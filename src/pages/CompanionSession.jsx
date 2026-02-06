import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { generateAIResponse as getAIResponse } from '../lib/gemini';
import { ArrowLeft, Mic, MessageSquare, Square, Crown, Volume2, Send, Paperclip, MicOff, Copy, RotateCcw, Pause, StopCircle } from 'lucide-react';
import ChatRobot from '../components/ChatRobot';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import ReactMarkdown from 'react-markdown';
import './CompanionSession.css';

const CompanionSession = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, userData } = useAuth();
  const [companion, setCompanion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mode, setMode] = useState('text'); // 'text' or 'audio'
  const [transcript, setTranscript] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // Track if AI is speaking
  const [currentSpeakingMessageId, setCurrentSpeakingMessageId] = useState(null); // Track which message is being read
  const transcriptEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const messageIdCounter = useRef(0);
  const { toasts, showToast, hideToast } = useToast();
  
  // Curriculum state
  const [currentModuleId, setCurrentModuleId] = useState(1);
  const [moduleProgress, setModuleProgress] = useState([]);
  const [moduleStartTime, setModuleStartTime] = useState(null);
  const [moduleTimeSpent, setModuleTimeSpent] = useState(0);
  const [moduleMessageCount, setModuleMessageCount] = useState(0);
  const [curriculumVisible, setCurriculumVisible] = useState(false);
  const [moduleSessions, setModuleSessions] = useState({}); // Track which modules have sessions


  useEffect(() => {
    const fetchCompanion = async () => {
      try {
        const companionDoc = await getDoc(doc(db, 'companions', id));
        if (companionDoc.exists()) {
          setCompanion({ id: companionDoc.id, ...companionDoc.data() });
        } else {
          navigate('/library');
        }
      } catch (error) {
        console.error('Error fetching companion:', error);
        navigate('/library');
      } finally {
        setLoading(false);
      }
    };

    fetchCompanion();
  }, [id, navigate]);

  // Load module sessions to show Continue vs Start Lesson
  useEffect(() => {
    const loadModuleSessions = async () => {
      if (!currentUser || !companion?.curriculum) return;
      
      try {
        const sessionsRef = collection(db, 'sessions');
        const q = query(
          sessionsRef,
          where('userId', '==', currentUser.uid),
          where('companionId', '==', id)
        );
        
        const querySnapshot = await getDocs(q);
        const sessions = {};
        
        querySnapshot.forEach(doc => {
          const data = doc.data();
          if (data.moduleId) {
            sessions[data.moduleId] = {
              hasSession: true,
              messageCount: data.transcript?.length || 0,
              lastAccessed: data.lastAccessedAt
            };
          }
        });
        
        setModuleSessions(sessions);
      } catch (error) {
        console.error('Error loading module sessions:', error);
      }
    };
    
    loadModuleSessions();
  }, [currentUser, companion, id]);

  useEffect(() => {
    let interval;
    if (sessionStarted) {
      interval = setInterval(() => {
        setSessionDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [sessionStarted]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Initialize Web Speech API for voice recognition
  const initializeSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      let finalTranscript = '';
      let isProcessingSpeech = false;

      recognition.onstart = () => {
        console.log('Speech recognition started');
        setIsRecording(true);
      };

      recognition.onresult = async (event) => {
        // Ignore results if AI is speaking and show alert
        if (isSpeaking || isProcessing) {
          console.log('Ignoring speech input while AI is generating/speaking');
          // Show custom alert
          const alertDiv = document.createElement('div');
          alertDiv.textContent = '🤖 AI is responding... Please wait!';
          alertDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--text-primary);
            color: var(--bg-primary);
            padding: 20px 40px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            z-index: 9999;
            animation: fadeInOut 2s ease;
          `;
          document.body.appendChild(alertDiv);
          setTimeout(() => alertDiv.remove(), 2000);
          return;
        }
        
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        // Only process final results
        if (finalTranscript.trim() && !isProcessingSpeech && !isSpeaking) {
          isProcessingSpeech = true;
          const userMessage = finalTranscript.trim();
          finalTranscript = '';
          
          addMessage(userMessage, 'user');
          setIsProcessing(true);
          
          // Generate AI response with streaming for real-time
          const conversationHistory = transcript.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
          }));
          
          // Add placeholder message for streaming
          const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          addMessage('', 'ai', messageId);
          
          let fullResponse = '';
          try {
            // Get current module for context
            const currentModule = companion.curriculum?.find(m => m.id === currentModuleId);
            
            const aiResponse = await getAIResponse(
              userMessage, 
              companion, 
              conversationHistory,
              (chunk) => {
                // Update message in real-time as chunks arrive
                fullResponse += chunk;
                updateMessage(messageId, fullResponse);
                // Speak chunks as they arrive
                speakText(fullResponse, true);
              },
              currentModule
            );
            
            // Ensure final message is set
            if (fullResponse !== aiResponse) {
              updateMessage(messageId, aiResponse);
            }
            
            // Speak the response
            speakText(aiResponse);
          } catch (error) {
            console.error('Error generating response:', error);
            updateMessage(messageId, `Sorry, I encountered an error. Could you try asking about ${companion.topic} again?`);
          }
          
          setIsProcessing(false);
          isProcessingSpeech = false;
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        
        // Don't restart on certain errors
        if (event.error === 'no-speech') {
          // Just wait, don't restart immediately
          return;
        } else if (event.error === 'aborted') {
          return;
        } else if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please enable microphone permissions.');
          setMode('text');
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
        // Don't auto-restart - user must explicitly toggle audio mode
        // This prevents unwanted activation
      };

      recognitionRef.current = recognition;
      return recognition;
    }
    return null;
  };

  // Helper function to get the best available voice
  const getBestVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    
    // Priority order for high-quality voices
    const priorities = [
      // Microsoft Edge voices (best quality on Windows)
      { pattern: /Microsoft.*Aria.*Neural/i, score: 100 },
      { pattern: /Microsoft.*Guy.*Neural/i, score: 99 },
      { pattern: /Microsoft.*Jenny.*Neural/i, score: 98 },
      
      // Google voices (excellent quality)
      { pattern: /Google.*US.*English/i, score: 95 },
      { pattern: /Google.*UK.*English/i, score: 94 },
      
      // Apple voices (macOS)
      { pattern: /Samantha/i, score: 90 },
      { pattern: /Alex/i, score: 89 },
      
      // Enhanced/Premium voices
      { pattern: /Enhanced/i, score: 85 },
      { pattern: /Premium/i, score: 84 },
      { pattern: /Natural/i, score: 83 },
      
      // Standard Microsoft voices
      { pattern: /Microsoft.*Zira/i, score: 75 },
      { pattern: /Microsoft.*David/i, score: 74 },
    ];
    
    // Filter for US English voices only
    const usEnglishVoices = voices.filter(v => 
      v.lang.startsWith('en-US') || v.lang.startsWith('en_US')
    );
    
    // Score each voice
    const scoredVoices = usEnglishVoices.map(voice => {
      let score = 0;
      for (const priority of priorities) {
        if (priority.pattern.test(voice.name)) {
          score = priority.score;
          break;
        }
      }
      return { voice, score };
    });
    
    // Sort by score and return best
    scoredVoices.sort((a, b) => b.score - a.score);
    const bestVoice = scoredVoices[0]?.voice;
    
    if (bestVoice) {
      console.log('🎤 Selected voice:', bestVoice.name, `(score: ${scoredVoices[0].score})`);
    }
    
    return bestVoice;
  };

  // Helper function to strip markdown from text for TTS
  const stripMarkdown = (text) => {
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')  // Remove bold **text**
      .replace(/\*(.+?)\*/g, '$1')      // Remove italic *text*
      .replace(/`(.+?)`/g, '$1')        // Remove code `text`
      .replace(/#+\s/g, '')             // Remove headers #
      .replace(/[-*]\s/g, '')           // Remove bullet points - or *
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links [text](url)
      .replace(/!\[.+?\]\(.+?\)/g, '')  // Remove images
      .trim();
  };

  // Text-to-speech using browser with best voice
  const speakText = (text, isStreaming = false) => {
    if ('speechSynthesis' in window && mode === 'audio') {
      // Strip markdown before speaking
      const cleanText = stripMarkdown(text);
      
      // Skip streaming for now
      if (isStreaming) return;
      
      // Stop recognition while AI speaks
      const wasRecording = isRecording;
      if (recognitionRef.current && isRecording) {
        recognitionRef.current.stop();
      }
      
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      
      const utterance = new SpeechSynthesisUtterance(cleanText);
      
      // Optimized settings for natural, human-like speech
      utterance.rate = 1.15; // Natural conversational speed
      utterance.pitch = 1.0; // Neutral pitch
      utterance.volume = 1;
      utterance.lang = 'en-US';
      
      // Use best available voice
      const bestVoice = getBestVoice();
      if (bestVoice) {
        utterance.voice = bestVoice;
      }
      
      utterance.onstart = () => {
        setIsProcessing(true);
        setIsSpeaking(true);
      };
      
      utterance.onend = () => {
        setIsProcessing(false);
        
        // Restart speech recognition after AI finishes speaking
        if (wasRecording && mode === 'audio') {
          setTimeout(() => {
            setIsSpeaking(false);
            const recognition = initializeSpeechRecognition();
            if (recognition) {
              try {
                recognition.start();
              } catch (e) {
                console.log('Recognition already started or error:', e);
              }
            }
          }, 3000);
        }
      };
      
      window.speechSynthesis.speak(utterance);
    }
  };


  const startSession = async () => {
    try {
      // Check if a session already exists for this companion + module
      const sessionsRef = collection(db, 'sessions');
      const q = query(
        sessionsRef,
        where('userId', '==', currentUser.uid),
        where('companionId', '==', id),
        where('moduleId', '==', currentModuleId)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        // Load existing session
        const existingSession = querySnapshot.docs[0];
        const sessionData = existingSession.data();
        
        setSessionId(existingSession.id);
        setTranscript(sessionData.transcript || []);
        setModuleStartTime(Date.now());
        setSessionStarted(true);
        setMode('text');
        
        // Update last accessed
        await updateDoc(doc(db, 'sessions', existingSession.id), {
          lastAccessedAt: new Date()
        });
      } else {
        // Create new session for this module
        const sessionData = {
          userId: currentUser.uid,
          companionId: id,
          companionName: companion.name,
          moduleId: currentModuleId, // NEW: Track which module this session belongs to
          startedAt: new Date(),
          lastAccessedAt: new Date(),
          transcript: [],
          duration: 0,
          moduleProgress: [],
          currentModuleId: currentModuleId
        };
        const docRef = await addDoc(collection(db, 'sessions'), sessionData);
        setSessionId(docRef.id);
        setSessionStarted(true);
        setModuleStartTime(Date.now());
        
        // Start with text mode by default
        setMode('text');
      }
    } catch (error) {
      console.error('Error starting/loading session:', error);
    }
  };
  
  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript, isProcessing]);

  // Track time spent on current module
  useEffect(() => {
    if (!sessionStarted || !moduleStartTime) return;
    
    const interval = setInterval(() => {
      const timeSpent = Math.floor((Date.now() - moduleStartTime) / 1000);
      setModuleTimeSpent(timeSpent);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [sessionStarted, moduleStartTime]);
  
  // Helper: Check if module is unlocked
  const isModuleUnlocked = (moduleId) => {
    if (moduleId === 1) return true; // First module always unlocked
    
    const prevModuleProgress = moduleProgress.find(p => p.moduleId === moduleId - 1);
    // Require BOTH 10 messages AND 60 seconds
    return prevModuleProgress && prevModuleProgress.timeSpent >= 60 && prevModuleProgress.messageCount >= 10;
  };
  
  // Helper: Check if module is completed
  const isModuleCompleted = (moduleId) => {
    const progress = moduleProgress.find(p => p.moduleId === moduleId);
    return progress && progress.completed;
  };
  
  // Switch to a different module
  const switchModule = (moduleId) => {
    if (!isModuleUnlocked(moduleId)) return;
    
    // Save current module progress
    const updatedProgress = [...moduleProgress];
    const currentProgress = updatedProgress.find(p => p.moduleId === currentModuleId);
    
    if (currentProgress) {
      currentProgress.timeSpent = moduleTimeSpent;
      currentProgress.messageCount = moduleMessageCount;
    } else {
      updatedProgress.push({
        moduleId: currentModuleId,
        timeSpent: moduleTimeSpent,
        messageCount: moduleMessageCount,
        completed: false
      });
    }
    
    setModuleProgress(updatedProgress);
    setCurrentModuleId(moduleId);
    setModuleStartTime(Date.now());
    setModuleTimeSpent(0);
    setModuleMessageCount(0); // Reset message count
  };
  
  // Mark current module as complete
  const completeCurrentModule = () => {
    const updatedProgress = [...moduleProgress];
    const currentProgress = updatedProgress.find(p => p.moduleId === currentModuleId);
    
    if (currentProgress) {
      currentProgress.completed = true;
      currentProgress.timeSpent = moduleTimeSpent;
      currentProgress.messageCount = moduleMessageCount;
    } else {
      updatedProgress.push({
        moduleId: currentModuleId,
        timeSpent: moduleTimeSpent,
        messageCount: moduleMessageCount,
        completed: true
      });
    }
    
    setModuleProgress(updatedProgress);
    
    // Auto-switch to next module if available
    const curriculum = companion?.curriculum || [];
    if (currentModuleId < curriculum.length) {
      switchModule(currentModuleId + 1);
    }
  };

  const endSession = async () => {
    try {
      // Stop speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      
      // Stop any ongoing speech
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      if (sessionId) {
        await updateDoc(doc(db, 'sessions', sessionId), {
          endedAt: new Date(),
          duration: sessionDuration,
          transcript: transcript
        });
      }
      setSessionStarted(false);
      setIsRecording(false);
      setMode('text');
      navigate('/my-journey');
    } catch (error) {
      console.error('Error ending session:', error);
    }
  };

  const toggleAudioMode = async () => {
    if (isRecording) {
      // Stop recording
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      // State update handled by onend
    } else {
      // Start recording
      try {
        // Switch to audio mode if not already
        if (mode === 'text') {
          setMode('audio');
        }

        // Request microphone permission first
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const recognition = initializeSpeechRecognition();
        if (recognition) {
          recognition.start();
        } else {
          alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
        }
      } catch (error) {
        console.error('Microphone access denied:', error);
        alert('Microphone access is required for audio mode. Please allow microphone permissions.');
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isProcessing) return;
    
    const userMessage = inputText.trim();
    setInputText('');
    addMessage(userMessage, 'user');
    setIsProcessing(true);
    
    // Generate AI response with streaming for real-time
    const conversationHistory = transcript.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));
    
    // Add placeholder message for streaming
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    addMessage('', 'ai', messageId);
    
    let fullResponse = '';
    try {
      // Get current module for context
      const currentModule = companion.curriculum?.find(m => m.id === currentModuleId);
      
      const aiResponse = await getAIResponse(
        userMessage, 
        companion, 
        conversationHistory,
        (chunk) => {
          // Update message in real-time as chunks arrive
          fullResponse += chunk;
          updateMessage(messageId, fullResponse);
        },
        currentModule
      );
      
      // Ensure final message is set
      if (fullResponse !== aiResponse) {
        updateMessage(messageId, aiResponse);
      }
      
      setIsProcessing(false);
      
      // Speak response if in audio mode
      if (mode === 'audio') {
        speakText(aiResponse);
      }
    } catch (error) {
      console.error('Error generating response:', error);
      updateMessage(messageId, `Sorry, I encountered an error. Could you try asking about ${companion.topic} again?`);
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const addMessage = (text, sender, id = null) => {
    const newMessage = {
      id: id ||
`msg-${Date.now()}-${messageIdCounter.current++}`,
      text,
      sender,
      timestamp: new Date()
    };
    setTranscript(prev => {
      const updated = [...prev, newMessage];
      
      // Auto-save to Firestore
      if (sessionId) {
        updateDoc(doc(db, 'sessions', sessionId), {
          transcript: updated,
          lastAccessedAt: new Date()
        }).catch(err => console.error('Error saving transcript:', err));
      }
      
      return updated;
    });
    
    // Increment message count for user messages
    if (sender === 'user') {
      setModuleMessageCount(prev => prev + 1);
    }
    return newMessage.id;
  };

  const updateMessage = (messageId, newText) => {
    setTranscript(prev => {
      const updated = prev.map(msg => 
        msg.id === messageId ? { ...msg, text: newText } : msg
      );
      
      // Auto-save to Firestore
      if (sessionId) {
        updateDoc(doc(db, 'sessions', sessionId), {
          transcript: updated,
          lastAccessedAt: new Date()
        }).catch(err => console.error('Error saving transcript:', err));
      }
      
      return updated;
    });
  };

  // Message action handlers
  const handleCopyMessage = (text) => {
    navigator.clipboard.writeText(text);
    showToast('Copied!');
  };

  const handleReadMessage = (text, messageId) => {
    // If this message is already being read, pause/resume it
    if (currentSpeakingMessageId === messageId) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        return;
      } else if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        return;
      }
    }

    // Start reading a new message
    const toastId = showToast('Waiting for AI to speak...', 0);
    const cleanText = stripMarkdown(text);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.15;
    utterance.pitch = 1.0;
    utterance.onstart = () => {
      hideToast(toastId);
      setIsSpeaking(true);
      setCurrentSpeakingMessageId(messageId);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setCurrentSpeakingMessageId(null);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setCurrentSpeakingMessageId(null);
    };
    const bestVoice = getBestVoice();
    if (bestVoice) utterance.voice = bestVoice;
    window.speechSynthesis.speak(utterance);
  };

  const handlePauseSpeech = () => {
    if (window.speechSynthesis.speaking) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      } else {
        window.speechSynthesis.pause();
      }
    }
  };

  const handleStopSpeech = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setCurrentSpeakingMessageId(null);
  };

  const handleRegenerateMessage = async (messageId) => {
    // Find the user message before this AI message
    const msgIndex = transcript.findIndex(m => m.id === messageId);
    if (msgIndex > 0) {
      const userMsg = transcript[msgIndex - 1];
      if (userMsg.sender === 'user') {
        setIsProcessing(true);
        updateMessage(messageId, '');
        
        const conversationHistory = transcript.slice(0, msgIndex).map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        }));
        
        let fullResponse = '';
        try {
          const currentModule = companion.curriculum?.find(m => m.id === currentModuleId);
          const aiResponse = await getAIResponse(
            userMsg.text,
            companion,
            conversationHistory,
            (chunk) => {
              fullResponse += chunk;
              updateMessage(messageId, fullResponse);
            },
            currentModule
          );
          
          if (fullResponse !== aiResponse) {
            updateMessage(messageId, aiResponse);
          }
          
          setIsProcessing(false);
        } catch (error) {
          console.error('Error regenerating:', error);
          updateMessage(messageId, 'Sorry, I encountered an error while regenerating.');
          setIsProcessing(false);
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="session-page">
        <div className="loading">Loading companion...</div>
      </div>
    );
  }

  if (!companion) {
    return null;
  }

  return (
    <div className="companion-session-page">
      {/* Header */}
      <div className="session-header">
        <div className="header-left">
          <button onClick={() => navigate('/library')} className="btn-back">
            <ArrowLeft size={20} />
          </button>
          <div className="companion-info">
            <h2>{companion.name}</h2>
            <div className="companion-tags">
              <span className="tag">{companion.subject}</span>
              <span className="tag">{companion.topic}</span>
            </div>
          </div>
        </div>
        {sessionStarted && (
          <div className="header-right">
            <div className="session-timer">
              {Math.floor(sessionDuration / 60)}:{(sessionDuration % 60).toString().padStart(2, '0')}
            </div>
            {companion?.curriculum && companion.curriculum.length > 0 && (
              <button 
                onClick={() => setCurriculumVisible(!curriculumVisible)}
                className="btn-show"
                title={curriculumVisible ? 'Hide Curriculum' : 'Show Curriculum'}
              >
                {curriculumVisible ? 'Hide' : 'Show'}
              </button>
            )}
            <button onClick={endSession} className="btn-end">
              End Session
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="session-main">
        {!sessionStarted ? (
          <div className="pre-session">
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '6px' }}>📚 {companion.name}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{companion.topic}</p>
            </div>

            {companion.curriculum && companion.curriculum.length > 0 ? (
              <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                <h3 style={{ fontSize: '0.95rem', marginBottom: '16px', textAlign: 'center', fontWeight: '600' }}>Course Modules</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {companion.curriculum.map((module) => {
                    const unlocked = isModuleUnlocked(module.id);
                    const completed = isModuleCompleted(module.id);
                    
                    return (
                      <div
                        key={module.id}
                        style={{
                          padding: '14px 16px',
                          border: `2px solid ${completed ? '#4CAF50' : unlocked ? 'var(--border-light)' : 'var(--border-light)'}`,
                          background: unlocked ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                          opacity: unlocked ? 1 : 0.5,
                          transition: 'all 0.3s ease',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                              <span style={{ fontSize: '20px' }}>
                                {completed ? '✅' : unlocked ? '🔓' : '🔒'}
                              </span>
                              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600' }}>
                                Module {module.id}: {module.title}
                              </h4>
                            </div>
                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '1.5' }}>
                              {module.description}
                            </p>
                          </div>
                          {unlocked && !completed && (
                            <button
                              onClick={() => {
                                setCurrentModuleId(module.id);
                                startSession();
                              }}
                              style={{
                                padding: '8px 16px',
                                background: 'var(--text-primary)',
                                color: 'var(--bg-primary)',
                                border: '2px solid var(--text-primary)',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                transition: 'all 0.3s ease',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              Start Lesson
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: '32px', textAlign: 'center', padding: '24px', background: 'var(--bg-secondary)', border: '2px solid var(--border-light)' }}>
                  <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Want to unlock more modules and earn a certificate?
                  </p>
                  <button
                    style={{
                      padding: '12px 24px',
                      background: 'var(--text-primary)',
                      color: 'var(--bg-primary)',
                      border: '2px solid var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'var(--bg-primary)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'var(--text-primary)';
                      e.currentTarget.style.color = 'var(--bg-primary)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <Crown size={16} />
                    Go Pro
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <p style={{ color: 'var(--text-secondary)' }}>No curriculum available for this companion.</p>
                <button onClick={startSession} className="btn-start" style={{ marginTop: '20px' }}>
                  Start Free Session
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Chat Interface */
          <>
            {/* Toast Notifications */}
            <Toast toasts={toasts} />
            
            {/* Curriculum Sidebar */}
            {curriculumVisible && companion?.curriculum && companion.curriculum.length > 0 && (
              <div className="curriculum-sidebar">
                <div className="curriculum-header">
                  <h3>📚 Course Modules</h3>
                  <button 
                    className="curriculum-close-btn"
                    onClick={() => setCurriculumVisible(false)}
                    aria-label="Close curriculum"
                  >
                    ×
                  </button>
                </div>
                <div className="module-list">
                  {companion.curriculum.map((module) => {
                    const unlocked = isModuleUnlocked(module.id);
                    const completed = isModuleCompleted(module.id);
                    const isCurrent = module.id === currentModuleId;
                    
                    return (
                      <div
                        key={module.id}
                        className={`module-item ${
                          isCurrent ? 'current' : ''
                        } ${
                          unlocked ? 'unlocked' : 'locked'
                        } ${
                          completed ? 'completed' : ''
                        }`}
                        onClick={() => unlocked && switchModule(module.id)}
                        style={{ cursor: unlocked ? 'pointer' : 'not-allowed' }}
                      >
                        <div className="module-header">
                          <span className="module-number">Module {module.id}</span>
                          <span className="module-status" style={{ fontSize: '20px' }}>
                            {completed ? '✅' : unlocked ? '🔓' : '🔒'}
                          </span>
                        </div>
                        <div className="module-title">{module.title}</div>
                        <div className="module-description">{module.description}</div>
                        {isCurrent && (
                          <div className="module-timer">
                            ⏱️ {Math.floor(moduleTimeSpent / 60)}:{(moduleTimeSpent % 60).toString().padStart(2, '0')}
                            <br />
                            💬 {moduleMessageCount} messages
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {moduleTimeSpent >= 60 && moduleMessageCount >= 10 && !isModuleCompleted(currentModuleId) && (
                  <button onClick={completeCurrentModule} className="btn-complete-module">
                    ✓ Mark Module {currentModuleId} Complete
                  </button>
                )}
              </div>
            )}
            {/* Chat Messages or Empty State */}
            <div className="chat-messages">
              {transcript.length === 0 ? (
                <div className="empty-state">
                  <ChatRobot />
                  <h1>
                    Are you Ready for <br/>
                    <span style={{ color: 'var(--text-secondary)' }}>{companion.name}</span> class?
                  </h1>
                  <p>
                    Send "Start" to begin your first lesson!
                  </p>
                </div>
              ) : (
                <div className="messages-list">
                  {transcript.map((msg) => (
                    <div key={msg.id} className={`msg-bubble ${msg.sender === 'user' ? 'user' : 'ai'}`}>
                      <div className="msg-avatar">
                        {msg.sender === 'user' 
                          ? currentUser?.displayName?.charAt(0).toUpperCase() || 'U'
                          : '🤖'
                        }
                      </div>
                      <div className="msg-body">
                        <div className="msg-name">
                          {msg.sender === 'user' ? currentUser?.displayName?.split(' ')[0] || 'You' : companion.name}
                        </div>
                        <div className="msg-text">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                        {/* Action buttons for AI messages */}
                        {msg.sender === 'ai' && msg.text && (
                          <div className="msg-actions">
                            <button 
                              className="action-btn" 
                              onClick={() => handleCopyMessage(msg.text)}
                              title="Copy message"
                            >
                              <Copy size={14} />
                            </button>
                            <button 
                              className="action-btn" 
                              onClick={() => handleReadMessage(msg.text, msg.id)}
                              title={currentSpeakingMessageId === msg.id ? "Pause/Resume" : "Read aloud"}
                            >
                              {currentSpeakingMessageId === msg.id ? (
                                <Pause size={14} />
                              ) : (
                                <Volume2 size={14} />
                              )}
                            </button>
                            <button 
                              className="action-btn" 
                              onClick={() => handleRegenerateMessage(msg.id)}
                              title="Regenerate response"
                            >
                              <RotateCcw size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {/* Typing indicator inside AI message bubble */}
                  {isProcessing && (
                    <div className="msg-bubble ai">
                      <div className="msg-avatar">🤖</div>
                      <div className="msg-body">
                        <div className="msg-name">{companion.name}</div>
                        <div className="msg-text">
                          <div className="typing-indicator">
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div ref={transcriptEndRef} />
            </div>

            {/* Input Bar */}
            <div className="input-bar">
              <div className="input-container">
                {mode === 'text' ? (
                  <>
                    <div className="input-wrapper">
                      <button className="input-btn upload">
                        <Paperclip size={16} />
                      </button>
                      <textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type your message..."
                        className="input-field"
                        disabled={isProcessing}
                        rows={1}
                      />
                    </div>
                    <button onClick={() => setMode('audio')} className="input-btn">
                      <Volume2 size={16} />
                    </button>
                    <button
                      onClick={handleSendMessage}
                      disabled={!inputText.trim() || isProcessing}
                      className="input-btn send"
                    >
                      <Send size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setMode('text')} className="input-btn">
                      <MessageSquare size={16} />
                    </button>
                    <div className="audio-status">
                      {isRecording && <div className="pulse-dot"></div>}
                      <span>{isRecording ? 'Recording...' : 'Click mic to speak'}</span>
                    </div>
                    <button
                      onClick={toggleAudioMode}
                      className={`input-btn ${isRecording ? 'recording' : ''}`}
                    >
                      {isRecording ? <Square size={16} /> : <Mic size={16} />}
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CompanionSession;
