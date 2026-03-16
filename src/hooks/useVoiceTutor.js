import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Voice tutor hook using browser Speech APIs + Gemini.
 * 
 * - SpeechRecognition (browser built-in) for listening
 * - Gemini API (user's existing key) for AI responses
 * - SpeechSynthesis (browser built-in) for speaking
 * 
 * No external services needed beyond Gemini.
 */

// Gemini model cache
let cachedModelName = null;

const useVoiceTutor = ({ onError, onCallEnd, companionData } = {}) => {
    const [isCallActive, setIsCallActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volumeLevel, setVolumeLevel] = useState(0);
    const [voiceTranscript, setVoiceTranscript] = useState([]);
    const [error, setError] = useState(null);

    const recognitionRef = useRef(null);
    const conversationRef = useRef([]);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const micStreamRef = useRef(null);
    const animFrameRef = useRef(null);
    const callbacksRef = useRef({ onError, onCallEnd });
    const isSpeakingRef = useRef(false);
    const isActiveRef = useRef(false);

    useEffect(() => {
        callbacksRef.current = { onError, onCallEnd };
    }, [onError, onCallEnd]);

    // --- Gemini API call ---
    const callGemini = useCallback(async (userMessage, systemPrompt) => {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) throw new Error('VITE_GEMINI_API_KEY is missing');

        // Discover model if not cached
        if (!cachedModelName) {
            const listRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
            );
            if (!listRes.ok) throw new Error(`Failed to list models: ${listRes.status}`);
            const listData = await listRes.json();
            const genModels = (listData.models || []).filter(m =>
                m.supportedGenerationMethods?.includes('generateContent')
            );
            if (genModels.length === 0) throw new Error('No Gemini models available');
            const picked = genModels.find(m => m.name.includes('gemini-2.5-flash')) ||
                genModels.find(m => m.name.includes('gemini-2.0-flash')) ||
                genModels.find(m => m.name.includes('gemini-1.5-flash')) ||
                genModels[0];
            cachedModelName = picked.name.replace('models/', '');
        }

        const requestBody = {
            systemInstruction: {
                role: 'system',
                parts: [{ text: systemPrompt }],
            },
            contents: [
                ...conversationRef.current.slice(-10).map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }],
                })),
                { role: 'user', parts: [{ text: userMessage }] },
            ],
            generationConfig: {
                temperature: 0.85,
                maxOutputTokens: 300,
            },
        };

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${cachedModelName}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            }
        );

        if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'I didn\'t quite catch that. Could you say it again?';
        return text;
    }, []);

    // --- Text to Speech ---
    const speak = useCallback((text) => {
        return new Promise((resolve) => {
            if (!text || !window.speechSynthesis) {
                resolve();
                return;
            }

            // Cancel any ongoing speech
            window.speechSynthesis.cancel();

            // Clean markdown from text
            const cleanText = text
                .replace(/```[\s\S]*?```/g, 'I can share the code in the text chat.')
                .replace(/\*\*(.*?)\*\*/g, '$1')
                .replace(/\*(.*?)\*/g, '$1')
                .replace(/#{1,6}\s/g, '')
                .replace(/[-*]\s/g, '')
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                .trim();

            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.rate = 0.95;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // Try to pick a good English voice
            const voices = window.speechSynthesis.getVoices();
            const preferred = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
                voices.find(v => v.name.includes('Samantha')) ||
                voices.find(v => v.name.includes('Microsoft') && v.lang.startsWith('en')) ||
                voices.find(v => v.lang.startsWith('en-'));
            if (preferred) utterance.voice = preferred;

            utterance.onstart = () => {
                isSpeakingRef.current = true;
                setIsSpeaking(true);
                // Simulate volume for orb animation
                const pulseVolume = () => {
                    if (!isSpeakingRef.current) return;
                    setVolumeLevel(0.3 + Math.random() * 0.5);
                    animFrameRef.current = requestAnimationFrame(pulseVolume);
                };
                pulseVolume();
            };

            utterance.onend = () => {
                isSpeakingRef.current = false;
                setIsSpeaking(false);
                setVolumeLevel(0);
                if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
                resolve();
            };

            utterance.onerror = () => {
                isSpeakingRef.current = false;
                setIsSpeaking(false);
                setVolumeLevel(0);
                resolve();
            };

            window.speechSynthesis.speak(utterance);
        });
    }, []);

    // --- Microphone volume analyzer ---
    const startMicAnalyser = useCallback((stream) => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioCtx.createAnalyser();
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 256;
            audioContextRef.current = audioCtx;
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateLevel = () => {
                if (!isActiveRef.current) return;
                if (!isSpeakingRef.current) {
                    analyser.getByteFrequencyData(dataArray);
                    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                    setVolumeLevel(Math.min(avg / 128, 1));
                }
                requestAnimationFrame(updateLevel);
            };
            updateLevel();
        } catch (e) {
            console.warn('Could not start mic analyser:', e);
        }
    }, []);

    // --- Build system prompt ---
    const buildSystemPrompt = useCallback(() => {
        const companion = companionData;
        if (!companion) {
            return `You are a highly intelligent professional voice tutor. Your role is to teach any subject through natural spoken conversation, like a real human tutor on a live call.

VOICE & PERSONALITY
- Calm, confident, professional, and warm.
- Speak clearly and naturally, like an experienced teacher.
- Use contractions naturally (I'm, you're, let's, that's).
- Keep responses concise (1 to 3 short paragraphs max).
- Avoid robotic phrases like "As an AI" or repeating "Great question."

INTELLIGENCE & INTENT AWARENESS
- Always identify what the student is actually trying to understand before answering.
- If the request is unclear, ask ONE short clarifying question instead of guessing.
- Use conversation memory to stay context-aware.
- If the student corrects you, immediately adjust your explanation.
- If they seem confused, explain the concept from a different angle instead of repeating yourself.

TEACHING STYLE
- Start simple, then increase depth.
- Use real-world analogies when helpful.
- Break complex topics into small steps.
- After explaining, ask a short follow-up question to keep the dialogue interactive.

VOICE OUTPUT RULES (CRITICAL)
- This is spoken conversation. Do NOT use markdown, bullet points, or long lists.
- Do NOT output long code blocks.
- If code is needed, explain it verbally and say: "I can share the exact code in the text chat if you'd like."
- Keep sentences short and easy to follow.
- Always end with a question or prompt that invites the student to respond.

SAFETY
- If unsure, admit uncertainty and ask for clarification.
- Refuse harmful or illegal requests politely and redirect.`;
        }

        return `You are ${companion.name}, a highly intelligent professional voice tutor inside an AI learning platform. Your role is to teach ${companion.topic || companion.subject || 'any subject'} through natural spoken conversation, like a real human tutor on a live call.

VOICE & PERSONALITY
- Calm, confident, professional, and warm.
- Speak clearly and naturally, like an experienced teacher.
- Use contractions naturally (I'm, you're, let's, that's).
- Keep responses concise (1 to 3 short paragraphs max).
- Avoid robotic phrases like "As an AI" or repeating "Great question."

INTELLIGENCE & INTENT AWARENESS
- Always identify what the student is actually trying to understand before answering.
- If the request is unclear, ask ONE short clarifying question instead of guessing.
- Use conversation memory to stay context-aware.
- If the student corrects you, immediately adjust your explanation.
- If they seem confused, explain the concept from a different angle instead of repeating yourself.

TEACHING STYLE
- Start simple, then increase depth.
- Use real-world analogies when helpful.
- Break complex topics into small steps.
- After explaining, ask a short follow-up question to keep the dialogue interactive.
- Offer options like: "Do you want an example, a quick exercise, or a deeper explanation?"

VOICE OUTPUT RULES (CRITICAL)
- This is spoken conversation. Do NOT use markdown, bullet points, or long lists.
- Do NOT output long code blocks.
- If code is needed, explain it verbally and say: "I can share the exact code in the text chat if you'd like."
- Keep sentences short and easy to follow.
- Always end with a question or prompt that invites the student to respond.

CONVERSATION FLOW
- Guide using questions when appropriate (Socratic method).
- Never dominate the conversation. Let it feel like a real dialogue.

SAFETY
- If unsure, admit uncertainty and ask for clarification.
- Refuse harmful or illegal requests politely and redirect.`;
    }, [companionData]);

    // --- Handle user speech result ---
    const handleSpeechResult = useCallback(async (userText) => {
        if (!userText?.trim() || !isActiveRef.current) return;

        // Add user message to transcript
        const userEntry = {
            id: `vt-${Date.now()}-u`,
            text: userText.trim(),
            role: 'user',
            timestamp: new Date(),
        };
        setVoiceTranscript(prev => [...prev, userEntry]);
        conversationRef.current.push({ role: 'user', content: userText.trim() });

        try {
            // Stop listening while AI responds
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) { /* ok */ }
            }

            const systemPrompt = buildSystemPrompt();
            const aiResponse = await callGemini(userText.trim(), systemPrompt);

            // Add AI response to transcript
            const aiEntry = {
                id: `vt-${Date.now()}-a`,
                text: aiResponse,
                role: 'assistant',
                timestamp: new Date(),
            };
            setVoiceTranscript(prev => [...prev, aiEntry]);
            conversationRef.current.push({ role: 'assistant', content: aiResponse });

            // Speak the response
            await speak(aiResponse);

            // Resume listening after speaking
            if (isActiveRef.current && recognitionRef.current) {
                try { recognitionRef.current.start(); } catch (e) { /* already started */ }
            }
        } catch (err) {
            console.error('Voice tutor error:', err);
            const msg = 'Sorry, I had trouble processing that. Could you try again?';
            setError(msg);
            callbacksRef.current.onError?.(msg);
            // Resume listening
            if (isActiveRef.current && recognitionRef.current) {
                try { recognitionRef.current.start(); } catch (e) { /* ok */ }
            }
        }
    }, [callGemini, speak, buildSystemPrompt]);

    // --- Start voice session ---
    const startCall = useCallback(async () => {
        try {
            setIsConnecting(true);
            setError(null);
            setVoiceTranscript([]);
            conversationRef.current = [];

            // Check for Speech Recognition support
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                throw new Error('Your browser does not support speech recognition. Please use Chrome.');
            }

            // Check Gemini key
            if (!import.meta.env.VITE_GEMINI_API_KEY) {
                throw new Error('Gemini API key not configured.');
            }

            // Request mic permission
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;
            startMicAnalyser(stream);

            // Set up speech recognition
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-US';
            recognitionRef.current = recognition;

            recognition.onresult = (event) => {
                const last = event.results[event.results.length - 1];
                if (last.isFinal) {
                    const text = last[0].transcript;
                    handleSpeechResult(text);
                }
            };

            recognition.onerror = (event) => {
                console.warn('Speech recognition error:', event.error);
                if (event.error === 'not-allowed') {
                    setError('Microphone access denied. Please allow microphone in browser settings.');
                }
                // Auto-restart on non-fatal errors
                if (event.error !== 'not-allowed' && event.error !== 'aborted' && isActiveRef.current) {
                    setTimeout(() => {
                        if (isActiveRef.current && recognitionRef.current) {
                            try { recognitionRef.current.start(); } catch (e) { /* ok */ }
                        }
                    }, 500);
                }
            };

            recognition.onend = () => {
                // Auto-restart if session is still active and not speaking
                if (isActiveRef.current && !isSpeakingRef.current) {
                    setTimeout(() => {
                        if (isActiveRef.current && recognitionRef.current) {
                            try { recognitionRef.current.start(); } catch (e) { /* ok */ }
                        }
                    }, 300);
                }
            };

            // Load voices (Chrome loads them async)
            if (window.speechSynthesis) {
                window.speechSynthesis.getVoices();
            }

            isActiveRef.current = true;
            setIsCallActive(true);
            setIsConnecting(false);

            // Start listening
            recognition.start();

            // Speak first message
            const name = companionData?.name || 'your voice tutor';
            const topic = companionData?.topic || companionData?.subject || 'your chosen topic';
            const firstMessage = `Hey! I'm ${name}. I'm here to help you learn ${topic} through conversation. What would you like to focus on today?`;

            const firstEntry = {
                id: `vt-${Date.now()}-first`,
                text: firstMessage,
                role: 'assistant',
                timestamp: new Date(),
            };
            setVoiceTranscript([firstEntry]);
            conversationRef.current.push({ role: 'assistant', content: firstMessage });

            await speak(firstMessage);

        } catch (err) {
            console.error('Failed to start voice session:', err);
            const errorMsg = typeof err === 'string' ? err : err.message || 'Failed to start voice session.';
            setError(errorMsg);
            setIsConnecting(false);
            setIsCallActive(false);
            isActiveRef.current = false;
            callbacksRef.current.onError?.(errorMsg);
        }
    }, [handleSpeechResult, speak, startMicAnalyser, companionData]);

    // --- Stop voice session ---
    const stopCall = useCallback(() => {
        isActiveRef.current = false;

        // Stop speech recognition
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) { /* ok */ }
            recognitionRef.current = null;
        }

        // Stop TTS
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        // Stop mic stream
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(t => t.stop());
            micStreamRef.current = null;
        }

        // Clean up audio context
        if (audioContextRef.current) {
            try { audioContextRef.current.close(); } catch (e) { /* ok */ }
            audioContextRef.current = null;
        }

        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

        setIsCallActive(false);
        setIsConnecting(false);
        setIsSpeaking(false);
        setIsMuted(false);
        setVolumeLevel(0);
        isSpeakingRef.current = false;
    }, []);

    // --- Toggle mute ---
    const toggleMute = useCallback(() => {
        if (micStreamRef.current) {
            const tracks = micStreamRef.current.getAudioTracks();
            const newMuted = !isMuted;
            tracks.forEach(t => { t.enabled = !newMuted; });
            setIsMuted(newMuted);

            if (newMuted && recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) { /* ok */ }
            } else if (!newMuted && isActiveRef.current && recognitionRef.current) {
                try { recognitionRef.current.start(); } catch (e) { /* ok */ }
            }
        }
    }, [isMuted]);

    const clearVoiceTranscript = useCallback(() => {
        setVoiceTranscript([]);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isActiveRef.current = false;
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) { /* ok */ }
            }
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(t => t.stop());
            }
            if (audioContextRef.current) {
                try { audioContextRef.current.close(); } catch (e) { /* ok */ }
            }
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, []);

    return {
        isCallActive,
        isConnecting,
        isSpeaking,
        isMuted,
        volumeLevel,
        voiceTranscript,
        error,
        startCall,
        stopCall,
        toggleMute,
        clearVoiceTranscript,
    };
};

export default useVoiceTutor;
