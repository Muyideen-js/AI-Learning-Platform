import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import './AISpeakingModal.css';

const AISpeakingModal = ({ isOpen, onClose, text, companionName }) => {
  const [currentText, setCurrentText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    if (!isOpen || !text) return;

    // Start speaking
    setIsSpeaking(true);
    setCharIndex(0);
    setCurrentText('');

    // Text-to-speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1;
      utterance.lang = 'en-US';

      // Get best voice
      const voices = window.speechSynthesis.getVoices();
      const usVoice = voices.find(v => v.lang.startsWith('en-US') && v.name.includes('Google')) ||
                      voices.find(v => v.lang.startsWith('en-US'));
      if (usVoice) {
        utterance.voice = usVoice;
      }

      utterance.onend = () => {
        setIsSpeaking(false);
        setTimeout(() => {
          onClose();
        }, 1000);
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        onClose();
      };

      window.speechSynthesis.speak(utterance);
    }

    // Typewriter effect for captions
    const typingInterval = setInterval(() => {
      setCharIndex(prev => {
        if (prev < text.length) {
          setCurrentText(text.substring(0, prev + 1));
          return prev + 1;
        }
        clearInterval(typingInterval);
        return prev;
      });
    }, 50);

    return () => {
      clearInterval(typingInterval);
      window.speechSynthesis.cancel();
    };
  }, [isOpen, text]);

  const handleSkip = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="ai-speaking-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleSkip}
        >
          <motion.div
            className="ai-speaking-modal"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="skip-button" onClick={handleSkip}>
              <X size={20} />
            </button>

            <div className="ai-avatar-container">
              <motion.div
                className="ai-avatar"
                animate={isSpeaking ? {
                  scale: [1, 1.05, 1],
                } : {}}
                transition={{
                  duration: 0.8,
                  repeat: isSpeaking ? Infinity : 0,
                  ease: "easeInOut"
                }}
              >
                <div className="avatar-inner">
                  {companionName?.charAt(0) || 'AI'}
                </div>
              </motion.div>

              {/* Pulsing rings */}
              {isSpeaking && (
                <>
                  <motion.div
                    className="pulse-ring ring-1"
                    animate={{
                      scale: [1, 1.5],
                      opacity: [0.6, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeOut"
                    }}
                  />
                  <motion.div
                    className="pulse-ring ring-2"
                    animate={{
                      scale: [1, 1.5],
                      opacity: [0.4, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeOut",
                      delay: 0.3
                    }}
                  />
                  <motion.div
                    className="pulse-ring ring-3"
                    animate={{
                      scale: [1, 1.5],
                      opacity: [0.2, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeOut",
                      delay: 0.6
                    }}
                  />
                </>
              )}
            </div>

            {/* Sound wave bars */}
            {isSpeaking && (
              <div className="sound-waves">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="wave-bar"
                    animate={{
                      scaleY: [0.3, 1, 0.3],
                    }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.1
                    }}
                  />
                ))}
              </div>
            )}

            {/* Live captions */}
            <div className="caption-container">
              <p className="caption-text">
                {currentText}
                <span className="cursor-blink">|</span>
              </p>
            </div>

            <p className="skip-hint">Click anywhere to skip</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AISpeakingModal;
