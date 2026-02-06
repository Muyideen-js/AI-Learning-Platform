import { motion } from 'framer-motion';
import './HeroRobot.css';

const HeroRobot = () => {
  return (
    <>
      {/* Left Robot - Teacher Style */}
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
      </motion.div>
    </>
  );
};

export default HeroRobot;
