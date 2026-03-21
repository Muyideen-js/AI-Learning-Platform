import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ArrowLeft, Home, TrendingUp, Award, BookOpen, Clock, Zap, Target, Flame, Bot, Timer, Star, Trophy, Sparkles, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import './MyJourney.css';

const MyJourney = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [stats, setStats] = useState({
    totalSessions: 0,
    totalMinutes: 0,
    companionsCreated: 0,
    currentStreak: 0,
  });
  const [loading, setLoading] = useState(true);

  // Real-time Firestore Listeners
  useEffect(() => {
    if (!currentUser) return;

    // 1. Listen to created companions
    const companionsQuery = query(
      collection(db, 'companions'),
      where('createdBy', '==', currentUser.uid)
    );
    
    const unsubscribeCompanions = onSnapshot(companionsQuery, (snapshot) => {
      setStats(prev => ({ ...prev, companionsCreated: snapshot.size }));
    });

    // 2. Listen to learning sessions
    const sessionsQuery = query(
      collection(db, 'sessions'),
      where('userId', '==', currentUser.uid)
    );

    const unsubscribeSessions = onSnapshot(sessionsQuery, (snapshot) => {
      let totalTime = 0;
      snapshot.docs.forEach(doc => {
        totalTime += (doc.data().duration || 0);
      });
      
      setStats(prev => ({ 
        ...prev, 
        totalSessions: snapshot.size,
        totalMinutes: Math.floor(totalTime / 60),
        // Simplistic streak logic placeholder until backend cron exists
        currentStreak: snapshot.size > 0 ? (snapshot.size > 5 ? 7 : snapshot.size) : 0
      }));
      setLoading(false);
    });

    return () => {
      unsubscribeCompanions();
      unsubscribeSessions();
    };
  }, [currentUser]);

  // Framer Motion Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  const achievements = [
    { id: 'first-steps', icon: Target, name: 'First Steps', desc: 'Complete your first session', requirement: 1, current: stats.totalSessions, color: '#00e5ff' },
    { id: 'on-fire', icon: Flame, name: 'On Fire', desc: 'Complete 10 sessions', requirement: 10, current: stats.totalSessions, color: '#ff3366' },
    { id: 'ai-master', icon: Bot, name: 'AI Master', desc: 'Create 3 companions', requirement: 3, current: stats.companionsCreated, color: '#6c5cff' },
    { id: 'time-traveler', icon: Timer, name: 'Time Traveler', desc: 'Learn for 60 minutes', requirement: 60, current: stats.totalMinutes, color: '#ffaa00' },
    { id: 'dedicated', icon: Star, name: 'Dedicated', desc: '7-day learning streak', requirement: 7, current: stats.currentStreak, color: '#00ffaa' },
    { id: 'champion', icon: Trophy, name: 'Champion', desc: 'Complete 50 sessions', requirement: 50, current: stats.totalSessions, color: '#ffd700' },
  ];

  if (loading) {
    return (
      <div className="journey-page">
        <div className="journey-loader">
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          >
            <Sparkles size={40} className="glow-icon" />
          </motion.div>
          <p>Syncing your journey...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="journey-page">
      {/* Dynamic Background */}
      <div className="journey-bg-effects">
        <div className="glow-orb orb-1"></div>
        <div className="glow-orb orb-2"></div>
      </div>

      <div className="journey-content-wrapper">
        {/* Header Navigation */}
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="journey-nav"
        >
          <div className="nav-buttons">
            <button onClick={() => navigate(-1)} className="glass-btn icon-only" title="Go Back">
              <ArrowLeft size={20} />
            </button>
            <button onClick={() => navigate('/')} className="glass-btn icon-only" title="Home">
              <Home size={20} />
            </button>
          </div>
          <div className="streak-badge">
            <Flame size={18} className="streak-icon" />
            <span>{stats.currentStreak} Day Streak</span>
          </div>
        </motion.header>

        {/* Hero Section */}
        <motion.section 
          className="journey-hero"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="hero-text">
            <h1 className="gradient-text">My Learning Journey</h1>
            <p className="hero-subtitle">Watch your expertise grow in real-time. Every session makes you sharper.</p>
          </div>
        </motion.section>

        {/* Stats Grid */}
        <motion.div 
          className="metrics-grid"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          <motion.div className="metric-card glass-panel" variants={itemVariants} whileHover={{ y: -5, scale: 1.02 }}>
            <div className="metric-icon-box" style={{ color: '#00e5ff', background: 'rgba(0, 229, 255, 0.1)' }}>
              <BookOpen size={28} />
            </div>
            <div className="metric-info">
              <span className="metric-value">{stats.totalSessions}</span>
              <span className="metric-label">Sessions Completed</span>
            </div>
          </motion.div>

          <motion.div className="metric-card glass-panel" variants={itemVariants} whileHover={{ y: -5, scale: 1.02 }}>
            <div className="metric-icon-box" style={{ color: '#ffaa00', background: 'rgba(255, 170, 0, 0.1)' }}>
              <Clock size={28} />
            </div>
            <div className="metric-info">
              <span className="metric-value">{stats.totalMinutes}</span>
              <span className="metric-label">Minutes Learned</span>
            </div>
          </motion.div>

          <motion.div className="metric-card glass-panel" variants={itemVariants} whileHover={{ y: -5, scale: 1.02 }}>
            <div className="metric-icon-box" style={{ color: '#6c5cff', background: 'rgba(108, 92, 255, 0.1)' }}>
              <Bot size={28} />
            </div>
            <div className="metric-info">
              <span className="metric-value">{stats.companionsCreated}</span>
              <span className="metric-label">AI Tutors Built</span>
            </div>
          </motion.div>

          <motion.div className="metric-card glass-panel" variants={itemVariants} whileHover={{ y: -5, scale: 1.02 }}>
            <div className="metric-icon-box" style={{ color: '#ff3366', background: 'rgba(255, 51, 102, 0.1)' }}>
              <TrendingUp size={28} />
            </div>
            <div className="metric-info">
              <span className="metric-value">{stats.currentStreak}</span>
              <span className="metric-label">Highest Streak</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Achievements Section */}
        <motion.section 
          className="achievements-section"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <div className="section-header">
            <Award size={24} className="section-icon" />
            <h2>Trophy Room</h2>
          </div>
          
          <motion.div 
            className="achievements-deck"
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            {achievements.map((badge) => {
              const isUnlocked = badge.current >= badge.requirement;
              const progressPct = Math.min((badge.current / badge.requirement) * 100, 100);
              
              return (
                <motion.div 
                  key={badge.id} 
                  className={`achievement-card glass-panel ${isUnlocked ? 'unlocked' : 'locked'}`}
                  variants={itemVariants}
                  whileHover={isUnlocked ? { scale: 1.05, rotateY: 5, rotateX: 5 } : {}}
                  style={{
                    '--glow-color': badge.color
                  }}
                >
                  <div className="card-glare"></div>
                  <div className="achievement-icon-wrapper" style={{ color: isUnlocked ? badge.color : 'var(--text-secondary)' }}>
                    <badge.icon size={40} className={isUnlocked ? 'animate-pulse-slow' : ''} />
                  </div>
                  <h3 className="achievement-name">{badge.name}</h3>
                  <p className="achievement-desc">{badge.desc}</p>
                  
                  {!isUnlocked && (
                    <div className="achievement-progress-bar">
                      <div className="progress-fill" style={{ width: `${progressPct}%`, backgroundColor: badge.color }}></div>
                    </div>
                  )}
                  {isUnlocked && (
                    <div className="unlocked-badge">
                      <Sparkles size={14} /> Unlocked
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        </motion.section>

        {/* CTA Section */}
        <motion.div 
          className="journey-cta glass-panel"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <div className="cta-content">
            <h3>Ready for your next breakthrough?</h3>
            <p>Don't break your streak! Jump right back into the learning library.</p>
          </div>
          <button onClick={() => navigate('/library')} className="btn-glow">
            <span>Browse Library</span>
            <ChevronRight size={18} />
          </button>
        </motion.div>

      </div>
    </div>
  );
};

export default MyJourney;
