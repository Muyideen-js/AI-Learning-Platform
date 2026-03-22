import React, { useEffect, useState, useRef } from 'react';
import { X, PlayCircle, PauseCircle, StopCircle, RefreshCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './VideoModal.css';

const VideoModal = ({ isOpen, onClose, topic, text, companionName }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [sentences, setSentences] = useState([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const synthRef = useRef(window.speechSynthesis);
  const utteranceRef = useRef(null);
  
  // Parse text into sentences and strip markdown for speech
  useEffect(() => {
    if (!text) return;
    
    // Clean code blocks and mermaid diagrams for speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '') // remove code blocks completely from speech
      .replace(/\*\*/g, '')
      .replace(/#/g, '')
      .replace(/\*/g, '')
      .replace(/`/g, '');
      
    // Split into sentences
    const sents = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
    setSentences(sents.map(s => s.trim()).filter(s => s.length > 0));
  }, [text]);

  // Handle Playback
  useEffect(() => {
    if (!isOpen) {
      synthRef.current.cancel();
      setIsPlaying(false);
      return;
    }

    if (isOpen && sentences.length > 0 && !isPlaying && currentSentenceIndex === 0 && !utteranceRef.current) {
      // Auto-start on open
      startPresentation();
    }
    
    return () => {
      synthRef.current.cancel();
    };
  }, [isOpen, sentences]);

  const startPresentation = () => {
    synthRef.current.cancel();
    setCurrentSentenceIndex(0);
    setDisplayedText('');
    playSentence(0);
  };

  const playSentence = (index) => {
    if (index >= sentences.length) {
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    setCurrentSentenceIndex(index);
    const sentence = sentences[index];
    
    // Visual text typing effect mock (actually just shows current sentence)
    setDisplayedText(sentence);

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = 0.95;
    utterance.pitch = 1.1; // Slightly robotic/synthetic
    
    // Try to find a good female/synthetic voice like Google UK English Female
    const voices = synthRef.current.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Female')) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => {
      playSentence(index + 1);
    };

    utterance.onerror = () => {
      setIsPlaying(false);
    };

    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };

  const pausePresentation = () => {
    if (synthRef.current.speaking) {
      synthRef.current.pause();
      setIsPlaying(false);
    }
  };

  const resumePresentation = () => {
    if (synthRef.current.paused) {
      synthRef.current.resume();
      setIsPlaying(true);
    } else if (!isPlaying) {
       startPresentation();
    }
  };

  const stopPresentation = () => {
    synthRef.current.cancel();
    setIsPlaying(false);
    setCurrentSentenceIndex(0);
    setDisplayedText('');
  };

  if (!isOpen) return null;

  return (
    <div className="video-modal-overlay">
      <div className="video-modal-content ai-presentation-mode">
        <div className="video-modal-header">
          <div className="video-header-left">
            <div className={`ai-recording-indicator ${isPlaying ? 'active' : ''}`}></div>
            <h3>AI Generated Presentation</h3>
          </div>
          <button className="btn-close-video" onClick={onClose} title="Close Video">
            <X size={20} />
          </button>
        </div>
        
        <div className="video-modal-body presentation-body">
          <h2 className="presentation-topic">{topic}</h2>
          
          <div className="presentation-stage">
            {/* The Avatar Visuals */}
            <div className={`ai-avatar-container ${isPlaying ? 'speaking' : ''}`}>
              <div className="avatar-rings">
                <div className="ring ring-1"></div>
                <div className="ring ring-2"></div>
                <div className="ring ring-3"></div>
              </div>
              <div className="ai-avatar-core">
                🤖
              </div>
              <div className="ai-name-badge">{companionName || 'AI Tutor'}</div>
            </div>

            {/* The Subtitles/Captions */}
            <div className="presentation-captions">
              {displayedText ? (
                <p className="caption-text fade-in-text">{displayedText}</p>
              ) : (
                <p className="caption-text paused-text">Press Play to begin the lesson.</p>
              )}
            </div>
          </div>
          
          {/* Controls */}
          <div className="presentation-controls">
            {isPlaying ? (
              <button className="ctrl-btn" onClick={pausePresentation}><PauseCircle size={24} /> Pause</button>
            ) : (
              <button className="ctrl-btn play" onClick={resumePresentation}><PlayCircle size={28} /> Play</button>
            )}
            <button className="ctrl-btn" onClick={stopPresentation}><StopCircle size={20} /> Stop</button>
            <button className="ctrl-btn" onClick={startPresentation}><RefreshCcw size={18} /> Restart</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoModal;
