import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, MessageSquare, Save } from 'lucide-react';
import './VoiceModal.css';

/**
 * Fullscreen voice modal with animated orb — ChatGPT-style voice mode.
 * 
 * States: connecting | listening | speaking
 * The orb reacts to volumeLevel when speaking, gentle pulse when listening.
 */
const VoiceModal = ({
  isOpen,
  isConnecting,
  isCallActive,
  isSpeaking,
  isMuted,
  volumeLevel = 0,
  voiceTranscript = [],
  companionName = 'Tutor',
  onToggleMute,
  onEndCall,
  onSwitchToText,
  onSaveTranscript,
}) => {
  const captionsRef = useRef(null);

  // Auto-scroll captions to latest
  useEffect(() => {
    if (captionsRef.current) {
      captionsRef.current.scrollTop = captionsRef.current.scrollHeight;
    }
  }, [voiceTranscript]);

  if (!isOpen) return null;

  // Derive visual state
  const state = isConnecting ? 'connecting' : isSpeaking ? 'speaking' : 'listening';

  // Orb scale: reacts to volume when speaking, gentle pulse otherwise
  const orbScale = state === 'speaking'
    ? 1 + volumeLevel * 0.4
    : 1;

  const orbGlow = state === 'speaking'
    ? Math.max(20, volumeLevel * 80)
    : state === 'listening' ? 15 : 10;

  // Get last 3 transcript entries for captions
  const recentCaptions = voiceTranscript.slice(-3);

  return (
    <div className="voice-modal-backdrop">
      <div className="voice-modal">
        {/* Companion name */}
        <div className="voice-modal-header">
          <span className="voice-modal-name">{companionName}</span>
          <span className="voice-modal-state">
            {state === 'connecting' && 'Connecting...'}
            {state === 'listening' && (isMuted ? 'Muted' : 'Listening')}
            {state === 'speaking' && 'Speaking'}
          </span>
        </div>

        {/* Animated Orb */}
        <div className="voice-orb-container">
          <div
            className={`voice-orb voice-orb--${state}`}
            style={{
              transform: `scale(${orbScale})`,
              boxShadow: `0 0 ${orbGlow}px ${orbGlow / 3}px rgba(255, 255, 255, 0.08)`,
            }}
          >
            <div className="voice-orb-inner" />
            <div className="voice-orb-ring voice-orb-ring--1" />
            <div className="voice-orb-ring voice-orb-ring--2" />
          </div>
        </div>

        {/* Live Captions */}
        <div className="voice-captions" ref={captionsRef}>
          {recentCaptions.length === 0 && state !== 'connecting' && (
            <p className="voice-caption-hint">Start speaking...</p>
          )}
          {recentCaptions.map(entry => (
            <p
              key={entry.id}
              className={`voice-caption voice-caption--${entry.role === 'user' ? 'user' : 'ai'}`}
            >
              {entry.text}
            </p>
          ))}
        </div>

        {/* Controls */}
        <div className="voice-controls">
          {isCallActive ? (
            <>
              <button
                className="voice-ctrl-btn voice-ctrl-btn--mute"
                onClick={onToggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                <span>{isMuted ? 'Unmute' : 'Mute'}</span>
              </button>

              <button
                className="voice-ctrl-btn voice-ctrl-btn--end"
                onClick={onEndCall}
                title="End Call"
              >
                <PhoneOff size={22} />
                <span>End</span>
              </button>

              <button
                className="voice-ctrl-btn voice-ctrl-btn--text"
                onClick={onSwitchToText}
                title="Switch to Text"
              >
                <MessageSquare size={22} />
                <span>Text</span>
              </button>

              {voiceTranscript.length > 0 && (
                <button
                  className="voice-ctrl-btn voice-ctrl-btn--save"
                  onClick={onSaveTranscript}
                  title="Save transcript to chat"
                >
                  <Save size={22} />
                  <span>Save</span>
                </button>
              )}
            </>
          ) : isConnecting ? (
            <button
              className="voice-ctrl-btn voice-ctrl-btn--end"
              onClick={onEndCall}
              title="Cancel"
            >
              <PhoneOff size={22} />
              <span>Cancel</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default VoiceModal;
