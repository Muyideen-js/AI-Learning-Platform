import { useState, useEffect } from 'react';
import { Sparkles, BookOpen, Code, Lightbulb, Rocket, Zap, X } from 'lucide-react';
import './FloatingNotifications.css';

const notifications = [
  { icon: Sparkles, text: "Someone just learned React Hooks!", emoji: "🎉" },
  { icon: Code, text: "New: Master Node.js in 30 days", emoji: "💻" },
  { icon: BookOpen, text: "Sarah completed Python Basics", emoji: "📚" },
  { icon: Lightbulb, text: "Tip: Practice makes perfect!", emoji: "💡" },
  { icon: Rocket, text: "Join 10,000+ learners today", emoji: "🚀" },
  { icon: Zap, text: "Quick tip: Study for 20 mins daily", emoji: "⚡" },
  { icon: Sparkles, text: "Alex mastered JavaScript!", emoji: "✨" },
  { icon: Code, text: "New course: Web Development Pro", emoji: "🎯" },
];

const FloatingNotifications = () => {
  const [activeNotification, setActiveNotification] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const showNotification = () => {
      const randomNotif = notifications[Math.floor(Math.random() * notifications.length)];
      setActiveNotification(randomNotif);
      setIsVisible(true);

      // Hide after 5 seconds
      setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    };

    // Show first notification after 3 seconds
    const initialTimeout = setTimeout(showNotification, 3000);

    // Show new notification every 20 seconds
    const interval = setInterval(showNotification, 20000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  if (!activeNotification) return null;

  const Icon = activeNotification.icon;

  return (
    <div className={`floating-notification ${isVisible ? 'visible' : ''}`}>
      <div className="notification-icon">
        <Icon size={20} />
      </div>
      <div className="notification-content">
        <p>{activeNotification.text}</p>
        <span className="notification-emoji">{activeNotification.emoji}</span>
      </div>
      <button 
        className="notification-close"
        onClick={() => setIsVisible(false)}
        aria-label="Close notification"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default FloatingNotifications;
