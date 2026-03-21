import { useState, useRef, useCallback, useEffect } from 'react';
import Vapi from '@vapi-ai/web';

/**
 * Custom hook for managing VAPI voice tutor sessions.
 *
 * Uses a pre-created assistant from the VAPI dashboard (configured via VITE_VAPI_ASSISTANT_ID).
 * Voice transcripts are kept SEPARATE from chat — never auto-appended to text chat.
 *
 * Fixes applied:
 * - Krisp/background denoising disabled to prevent KrispInitError crash
 * - Start lock prevents double vapi.start() from React 18 StrictMode
 * - Call start is triggered only from user click (not from effects)
 */
const useVapi = ({ onError, onCallStart, onCallEnd } = {}) => {
    const [isCallActive, setIsCallActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volumeLevel, setVolumeLevel] = useState(0);
    const [voiceTranscript, setVoiceTranscript] = useState([]);
    const [error, setError] = useState(null);

    const vapiRef = useRef(null);
    const isStartingRef = useRef(false); // Start lock — prevents double start
    const callbacksRef = useRef({ onError, onCallStart, onCallEnd });

    useEffect(() => {
        callbacksRef.current = { onError, onCallStart, onCallEnd };
    }, [onError, onCallStart, onCallEnd]);

    // Initialize VAPI instance once
    const getVapi = useCallback(() => {
        if (!vapiRef.current) {
            const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;
            if (!publicKey) {
                console.error('VITE_VAPI_PUBLIC_KEY is missing from .env');
                setError('Voice service not configured. Add VITE_VAPI_PUBLIC_KEY to .env');
                return null;
            }

            vapiRef.current = new Vapi(publicKey);
            const vapi = vapiRef.current;

            vapi.on('call-start', () => {
                isStartingRef.current = false;
                setIsCallActive(true);
                setIsConnecting(false);
                setError(null);
                callbacksRef.current.onCallStart?.();
            });

            // ----------------------------------------------------------------------
            // CRITICAL FIX: Intercept Daily.co WebRTC to prevent Krisp WASM crashes
            // Vapi SDK v2.5.2 hardcodes `type: 'noise-cancellation'` which crashes on
            // some browsers/setups with "WASM_OR_WORKER_NOT_READY".
            // We intercept the internal Daily call object right after it's created.
            // ----------------------------------------------------------------------
            vapi.on('call-start-progress', (e) => {
                if (e.stage === 'daily-call-object-creation' && e.status === 'completed') {
                    // vapi.call is the underlying Daily.co instance
                    const dailyCall = vapi.call;
                    if (dailyCall && typeof dailyCall.updateInputSettings === 'function') {
                        const originalUpdate = dailyCall.updateInputSettings.bind(dailyCall);
                        dailyCall.updateInputSettings = async (settings) => {
                            // If VAPI tries to force Krisp, change it to 'none'
                            if (settings?.audio?.processor?.type === 'noise-cancellation') {
                                console.warn('VAPI Patched: Preventing Krisp noise-cancellation from loading to stop WASM crash.');
                                settings.audio.processor.type = 'none';
                            }
                            return originalUpdate(settings);
                        };
                    }
                }
            });

            vapi.on('call-end', () => {
                isStartingRef.current = false;
                setIsCallActive(false);
                setIsConnecting(false);
                setIsSpeaking(false);
                setIsMuted(false);
                setVolumeLevel(0);
                callbacksRef.current.onCallEnd?.();
            });

            vapi.on('speech-start', () => setIsSpeaking(true));
            vapi.on('speech-end', () => setIsSpeaking(false));
            vapi.on('volume-level', (level) => setVolumeLevel(level));

            // Voice transcripts stay here — NOT pushed to chat
            vapi.on('message', (message) => {
                if (message.type === 'transcript' && message.transcriptType === 'final') {
                    const entry = {
                        id: `vt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                        text: message.transcript,
                        role: message.role,
                        timestamp: new Date(),
                    };
                    setVoiceTranscript(prev => [...prev, entry]);
                }
            });

            vapi.on('error', (err) => {
                console.error('VAPI Error:', err);
                isStartingRef.current = false;

                let errorMsg = 'Voice connection error. Please try again.';
                if (typeof err === 'string') {
                    errorMsg = err;
                } else if (err?.type === 'start-method-error') {
                    errorMsg = 'Could not connect to voice service. Check your VAPI dashboard settings.';
                } else if (err?.error?.message) {
                    errorMsg = err.error.message;
                } else if (err?.message) {
                    errorMsg = err.message;
                } else if (err?.error?.msg) {
                    errorMsg = String(err.error.msg);
                }
                setError(errorMsg);
                setIsCallActive(false);
                setIsConnecting(false);
                callbacksRef.current.onError?.(errorMsg);
            });
        }
        return vapiRef.current;
    }, []);

    /**
     * Start a VAPI voice call using the pre-created assistant ID.
     * 
     * MUST be called from a user-initiated event (click handler), never from useEffect.
     * Has a start lock to prevent double invocations from React 18 StrictMode.
     * 
     * @param {Object} context - Optional chat context for continuity
     * @param {string} context.companionName - Name of the AI companion
     * @param {string} context.topic - Current learning topic
     * @param {string} context.moduleName - Current module title
     * @param {string} context.chatHistory - Last few messages as text
     */
    const startCall = useCallback(async (context = null) => {
        // Start lock — prevent double start from StrictMode or rapid clicks
        if (isStartingRef.current || isCallActive) {
            console.warn('VAPI: start already in progress or call active, ignoring.');
            return;
        }

        try {
            isStartingRef.current = true;
            setIsConnecting(true);
            setError(null);
            setVoiceTranscript([]);

            const vapi = getVapi();
            if (!vapi) {
                isStartingRef.current = false;
                setIsConnecting(false);
                return;
            }

            const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID;
            if (!assistantId) {
                setError('Voice assistant not configured. Add VITE_VAPI_ASSISTANT_ID to .env');
                isStartingRef.current = false;
                setIsConnecting(false);
                return;
            }

            // Build assistant overrides to inject chat context
            // so the AI continues from where the text conversation left off.
            // We use variableValues for context and a model-generated first message
            // so the AI greets naturally based on the conversation state.
            let assistantOverrides = undefined;
            if (context && context.chatHistory) {
                // To prevent WebRTC crashes, we will ONLY pass variable values, 
                // and avoid overriding firstMessageMode which causes instant hangups
                // if the assistant model on the dashboard is not explicitly configured for it.
                assistantOverrides = {
                    variableValues: {
                        companionName: context.companionName || 'Tutor',
                        topic: context.topic || 'the subject',
                        moduleName: context.moduleName || '',
                        chatContext: context.chatHistory
                    }
                };
            }

            // Start with the pre-configured assistant from VAPI dashboard.
            await vapi.start(assistantId, assistantOverrides);
        } catch (err) {
            console.error('Failed to start VAPI call:', err);
            isStartingRef.current = false;
            let errorMsg = 'Failed to start voice call. Please try again.';
            if (typeof err === 'string') errorMsg = err;
            else if (err?.error?.message) errorMsg = err.error.message;
            else if (err?.message) errorMsg = err.message;
            setError(errorMsg);
            setIsConnecting(false);
            callbacksRef.current.onError?.(errorMsg);
        }
    }, [getVapi, isCallActive]);

    const stopCall = useCallback(() => {
        try {
            const vapi = getVapi();
            if (vapi) vapi.stop();
        } catch (err) {
            console.error('Error stopping VAPI call:', err);
        }
        isStartingRef.current = false;
        setIsCallActive(false);
        setIsConnecting(false);
        setIsSpeaking(false);
    }, [getVapi]);

    const toggleMute = useCallback(() => {
        try {
            const vapi = getVapi();
            if (!vapi) return;
            const newMuted = !isMuted;
            vapi.setMuted(newMuted);
            setIsMuted(newMuted);
        } catch (err) {
            console.error('Error toggling mute:', err);
        }
    }, [getVapi, isMuted]);

    const clearVoiceTranscript = useCallback(() => {
        setVoiceTranscript([]);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (vapiRef.current) {
                try { vapiRef.current.stop(); } catch (e) { /* ignore */ }
                vapiRef.current = null;
            }
            isStartingRef.current = false;
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

export default useVapi;
