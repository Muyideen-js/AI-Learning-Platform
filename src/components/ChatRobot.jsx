import { motion } from 'framer-motion';
import './HeroRobot.css';

const ChatRobot = () => {
  return (
    <motion.div
      className="hero-robot-container chat-robot-center"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        y: [0, -10, 0]
      }}
      transition={{
        opacity: { duration: 0.6 },
        scale: { duration: 0.6 },
        y: { 
          duration: 3,
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
    </motion.div>
  );
};

export default ChatRobot;
