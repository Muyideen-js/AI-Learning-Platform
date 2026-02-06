import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import './HeroRobot.css';

const AutoTypeText = () => {
  const messages = [
    "Start learning with AI today! 🚀",
    "Master any subject with AI! 📚",
    "Your personal AI tutor! 🤖",
    "Learn smarter, not harder! 💡"
  ];
  
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(100);

  useEffect(() => {
    const currentMessage = messages[currentMessageIndex];
    
    const timer = setTimeout(() => {
      if (!isDeleting) {
        if (displayText.length < currentMessage.length) {
          setDisplayText(currentMessage.substring(0, displayText.length + 1));
          setTypingSpeed(100);
        } else {
          setTypingSpeed(2000);
          setIsDeleting(true);
        }
      } else {
        if (displayText.length > 0) {
          setDisplayText(currentMessage.substring(0, displayText.length - 1));
          setTypingSpeed(50);
        } else {
          setIsDeleting(false);
          setCurrentMessageIndex((prev) => (prev + 1) % messages.length);
          setTypingSpeed(500);
        }
      }
    }, typingSpeed);

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, currentMessageIndex, typingSpeed]);

  return (
    <p>
      {displayText}
      <span className="typing-cursor">|</span>
    </p>
  );
};

const HomeRobot = () => {
  return (
    <>
      <motion.div
        className="hero-robot-container hero-robot-left"
        initial={{ opacity: 0, x: -100, y: 50 }}
        animate={{ 
          opacity: 1, 
          x: 0,
          y: [0, -10, 0]
        }}
        transition={{
          opacity: { duration: 0.8 },
          x: { duration: 0.8 },
          y: { 
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }
        }}
      >
        <div className="robot-3d robot-teacher">
          <div className="robot-head-3d">
            <div className="robot-face">
              <div className="robot-eyes">
                <div className="robot-eye-3d left">
                  <div className="pupil"></div>
                </div>
                <div className="robot-eye-3d right">
                  <div className="pupil"></div>
                </div>
              </div>
              <div className="robot-mouth-3d"></div>
            </div>
            <div className="robot-antenna-3d">
              <div className="antenna-ball"></div>
            </div>
          </div>
          <div className="robot-body-3d">
            <div className="body-panel"></div>
            <div className="body-light"></div>
          </div>
          <div className="robot-arms">
            <div className="robot-arm-3d left"></div>
            <div className="robot-arm-3d right"></div>
          </div>
        </div>
        
        <motion.div
          className="speech-bubble left-bubble"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
        >
          <AutoTypeText />
        </motion.div>
      </motion.div>

      {/* Elegant Splash - Bottom Right */}
      <motion.div
        className="elegant-splash"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, duration: 1 }}
      >
        <motion.div 
          className="splash-ring ring-1"
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ 
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="splash-ring ring-2"
          animate={{ 
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{ 
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5
          }}
        />
        <div className="splash-core"></div>
      </motion.div>
    </>
  );
};

export default HomeRobot;
