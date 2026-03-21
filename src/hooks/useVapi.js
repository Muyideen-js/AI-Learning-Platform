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
            // CRITICAL FIX: Safe WebRTC Intercept for Krisp WASM crashes
            // Swallows the Vapi `noise-cancellation` request completely without
            // calling Daily.co's hardware originalUpdate, thereby preventing the
            // 22-second enumerateDevices microphone thread deadlock while still
            // successfully protecting against the WASM_OR_WORKER_NOT_READY crash.
            // ----------------------------------------------------------------------
            vapi.on('call-start-progress', (e) => {
                if (e.stage === 'daily-call-object-creation' && e.status === 'completed') {
                    const dailyCall = vapi.call;
                    if (dailyCall && typeof dailyCall.updateInputSettings === 'function') {
                        const originalUpdate = dailyCall.updateInputSettings.bind(dailyCall);
                        dailyCall.updateInputSettings = async (settings) => {
                            if (settings?.audio?.processor?.type === 'noise-cancellation') {
                                console.warn('VAPI Patched: Safely swallowed Krisp noise-cancellation request to prevent WASM crash & mic deadlock.');
                                return Promise.resolve(); // Swallow it! Do NOT touch originalUpdate
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

            // Retrieve the configured VAPI Assistant ID from the environment string.
            // The user's Public Key returned a 403 Forbidden when we attempted to use
            // dynamic Transient Assistants, meaning their account requires explicitly using
            // a Dashboard-configured Assistant ID.
            const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID;
            if (!assistantId) {
                setError('Voice assistant not configured. Add VITE_VAPI_ASSISTANT_ID to .env');
                isStartingRef.current = false;
                setIsConnecting(false);
                return;
            }

            // We invoke start nakedly using the string ID. We previously safely mocked
            // the `noise-cancellation` Daily.co WebRTC intercept to prevent Krisp crashes
            // without locking the hardware enumerateDevices thread. Combined, the native
            // ID should now connect properly.
            await vapi.start(assistantId);
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
