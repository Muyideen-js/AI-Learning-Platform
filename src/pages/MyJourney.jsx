import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ArrowLeft, Home, Award, Target, Trophy, Sparkles, ChevronRight, Book, BookOpen } from 'lucide-react';
import { PiBooksThin } from "react-icons/pi";
import { CiTimer } from "react-icons/ci";
import { BsPersonVideo3 } from "react-icons/bs";
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import './MyJourney.css';

const ContributionBoard = ({ sessions }) => {
  // Generate last 100 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const days = [];
  for (let i = 99; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  // Count sessions per day
  const activityMap = {};
  sessions.forEach(session => {
    if (!session.startedAt) return;
    const date = session.startedAt.toDate ? session.startedAt.toDate() : new Date(session.startedAt);
    date.setHours(0, 0, 0, 0);
    const key = date.getTime();
    activityMap[key] = (activityMap[key] || 0) + 1;
  });

  const getIntensityClass = (count) => {
    if (count === 0) return 'level-0';
    if (count === 1) return 'level-1';
    if (count <= 3) return 'level-2';
    if (count <= 5) return 'level-3';
    return 'level-4';
  };

  return (
    <div className="contribution-board glass-panel">
      <div className="board-header">
        <h3>Learning Activity</h3>
        <span>{sessions.length} sessions total</span>
      </div>
      <div className="board-grid">
        {days.map((day, idx) => {
          const count = activityMap[day.getTime()] || 0;
          return (
            <div 
              key={idx} 
              className={`activity-block ${getIntensityClass(count)}`}
              title={`${day.toDateString()}: ${count} sessions`}
            />
          );
        })}
      </div>
      <div className="board-legend">
        <span>Less</span>
        <div className="activity-block level-0"></div>
        <div className="activity-block level-1"></div>
        <div className="activity-block level-2"></div>
        <div className="activity-block level-3"></div>
        <div className="activity-block level-4"></div>
        <span>More</span>
      </div>
    </div>
  );
};

const MyJourney = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [stats, setStats] = useState({
    totalSessions: 0,
    totalMinutes: 0,
    companionsCreated: 0,
  });
  const [sessionsData, setSessionsData] = useState([]);
  const [recentBooks, setRecentBooks] = useState([]);
  const [recentCompanions, setRecentCompanions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Real-time Firestore Listeners
  useEffect(() => {
    if (!currentUser) return;

    // Listen to companions
    const companionsQuery = query(
      collection(db, 'companions'),
      where('createdBy', '==', currentUser.uid)
    );
    
    const unsubscribeCompanions = onSnapshot(companionsQuery, (snapshot) => {
      setStats(prev => ({ ...prev, companionsCreated: snapshot.size }));
      const comps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecentCompanions(comps.slice(0, 4)); // Show recent 4
    });

    // Listen to books
    const booksQuery = query(
      collection(db, 'books'),
      where('userId', '==', currentUser.uid)
    );

    const unsubscribeBooks = onSnapshot(booksQuery, (snapshot) => {
      const bks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecentBooks(bks.slice(0, 4));
    });

    // Listen to sessions
    const sessionsQuery = query(
      collection(db, 'sessions'),
      where('userId', '==', currentUser.uid)
    );

    const unsubscribeSessions = onSnapshot(sessionsQuery, (snapshot) => {
      let totalTime = 0;
      const allSessions = [];
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        totalTime += (data.duration || 0);
        allSessions.push(data);
      });
      
      setSessionsData(allSessions);
      setStats(prev => ({ 
        ...prev, 
        totalSessions: snapshot.size,
        totalMinutes: Math.floor(totalTime / 60),
      }));
      setLoading(false);
    });

    return () => {
      unsubscribeCompanions();
      unsubscribeBooks();
      unsubscribeSessions();
    };
  }, [currentUser]);

  // Framer Motion Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  if (loading) {
    return (
      <div className="journey-page">
        <div className="journey-loader">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
            <Sparkles size={40} strokeWidth={1.25} className="glow-icon" />
          </motion.div>
          <p>Syncing your journey...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="journey-page">
      <div className="journey-bg-effects">
        <div className="glow-orb orb-1"></div>
        <div className="glow-orb orb-2"></div>
      </div>

      <div className="journey-content-wrapper">
        <motion.header initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="journey-nav">
          <div className="nav-buttons">
            <button onClick={() => navigate(-1)} className="glass-btn icon-only" title="Go Back"><ArrowLeft size={20} strokeWidth={1.25} /></button>
            <button onClick={() => navigate('/')} className="glass-btn icon-only" title="Home"><Home size={20} strokeWidth={1.25} /></button>
          </div>
          <h1 className="page-title minimal">Your Dashboard</h1>
        </motion.header>

        <section className="dashboard-grid">
          {/* Main Left Column */}
          <div className="dashboard-main">
            {/* Overview Stats */}
            <motion.div className="metrics-row" variants={containerVariants} initial="hidden" animate="show">
              <motion.div className="metric-box glass-panel" variants={itemVariants}>
                <PiBooksThin size={28} className="metric-icon" />
                <div className="metric-text">
                  <span className="value">{stats.totalSessions}</span>
                  <span className="label">Total Sessions</span>
                </div>
              </motion.div>
              <motion.div className="metric-box glass-panel" variants={itemVariants}>
                <CiTimer size={28} className="metric-icon" />
                <div className="metric-text">
                  <span className="value">{stats.totalMinutes}</span>
                  <span className="label">Minutes Learned</span>
                </div>
              </motion.div>
              <motion.div className="metric-box glass-panel" variants={itemVariants}>
                <BsPersonVideo3 size={24} className="metric-icon" />
                <div className="metric-text">
                  <span className="value">{stats.companionsCreated}</span>
                  <span className="label">AI Companions</span>
                </div>
              </motion.div>
            </motion.div>

            {/* Contribution Board */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <ContributionBoard sessions={sessionsData} />
            </motion.div>

            {/* Recent Books Section */}
            <motion.section className="content-section" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
              <div className="section-header">
                <h2><Book size={20} /> Your Books</h2>
                <button className="text-btn" onClick={() => navigate('/library')}>See All <ChevronRight size={16} /></button>
              </div>
              <div className="horizontal-scroll-grid">
                {recentBooks.length > 0 ? recentBooks.map(book => (
                  <div key={book.id} className="mini-card glass-panel" onClick={() => navigate(`/book/${book.id}`)}>
                    <div className="card-icon"><BookOpen size={24} /></div>
                    <h4>{book.title}</h4>
                    <span>{book.author || 'Unknown'}</span>
                  </div>
                )) : (
                  <div className="empty-panel">No books uploaded yet. Explore the library!</div>
                )}
              </div>
            </motion.section>

             {/* Recent Companions Section */}
             <motion.section className="content-section" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              <div className="section-header">
                <h2><Target size={20} /> Learning Partners</h2>
                <button className="text-btn" onClick={() => navigate('/library')}>See All <ChevronRight size={16} /></button>
              </div>
              <div className="horizontal-scroll-grid">
                {recentCompanions.length > 0 ? recentCompanions.map(comp => (
                  <div key={comp.id} className="mini-card glass-panel" onClick={() => navigate(`/companion/${comp.id}`)}>
                    <div className="card-icon"><BsPersonVideo3 size={24} /></div>
                    <h4>{comp.name}</h4>
                    <span>{comp.subject}</span>
                  </div>
                )) : (
                  <div className="empty-panel">Create your first learning companion!</div>
                )}
              </div>
            </motion.section>
          </div>
          
          {/* Right Column / Sidebar */}
          <div className="dashboard-sidebar">
             {/* CTA Section */}
             <motion.div className="journey-cta glass-panel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
              <Award size={32} className="cta-icon" />
              <div className="cta-content">
                <h3>Keep the streak going!</h3>
                <p>You're building great habits.</p>
              </div>
              <button onClick={() => navigate('/library')} className="btn-glow">
                Explore Library
              </button>
            </motion.div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default MyJourney;
