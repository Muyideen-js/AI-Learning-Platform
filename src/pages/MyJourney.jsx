import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ArrowLeft, Home, TrendingUp, Award, BookOpen, Clock, Zap, Target, Flame, Bot, Timer, Star, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './MyJourney.css';

const MyJourney = () => {
  const navigate = useNavigate();
  const { currentUser, userData } = useAuth();
  const [stats, setStats] = useState({
    totalSessions: 0,
    totalMinutes: 0,
    companionsCreated: 0,
    currentStreak: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) return;

      try {
        // Fetch user's created companions
        const companionsRef = collection(db, 'companions');
        const myCompanionsQuery = query(
          companionsRef,
          where('createdBy', '==', currentUser.uid)
        );
        const myCompanionsSnapshot = await getDocs(myCompanionsQuery);

        // Fetch sessions
        const sessionsRef = collection(db, 'sessions');
        const sessionsQuery = query(
          sessionsRef,
          where('userId', '==', currentUser.uid)
        );
        const sessionsSnapshot = await getDocs(sessionsQuery);

        const totalMinutes = sessionsSnapshot.docs.reduce((acc, doc) => {
          return acc + (doc.data().duration || 0);
        }, 0);

        setStats({
          totalSessions: sessionsSnapshot.size,
          totalMinutes: Math.floor(totalMinutes / 60),
          companionsCreated: myCompanionsSnapshot.size,
          currentStreak: 7 // Placeholder
        });

        setLoading(false);
      } catch (error) {
        console.error('Error fetching journey data:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="journey-page">
        <div className="loading">Loading your journey...</div>
      </div>
    );
  }

  return (
    <div className="journey-page">
      {/* Header */}
      <div className="journey-header">
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate(-1)} className="btn-icon" title="Go Back">
            <ArrowLeft size={20} />
          </button>
          <button onClick={() => navigate('/')} className="btn-icon" title="Back to Home">
            <Home size={20} />
          </button>
        </div>
        <h1 className="journey-title">My Learning Journey</h1>
        <p className="journey-subtitle">Track your progress and achievements</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <BookOpen size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalSessions}</div>
            <div className="stat-label">Learning Sessions</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Clock size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalMinutes}</div>
            <div className="stat-label">Minutes Learned</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Zap size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.companionsCreated}</div>
            <div className="stat-label">AI Companions</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.currentStreak}</div>
            <div className="stat-label">Day Streak</div>
          </div>
        </div>
      </div>

      {/* Achievements Section */}
      <div className="achievements-section">
        <h2 className="section-title">
          <Award size={20} />
          Achievements
        </h2>
        <div className="achievements-grid">
          <div className={`achievement-badge ${stats.totalSessions >= 1 ? 'unlocked' : 'locked'}`}>
            <div className="badge-icon">
              <Target size={32} />
            </div>
            <div className="badge-name">First Steps</div>
            <div className="badge-desc">Complete your first session</div>
          </div>

          <div className={`achievement-badge ${stats.totalSessions >= 10 ? 'unlocked' : 'locked'}`}>
            <div className="badge-icon">
              <Flame size={32} />
            </div>
            <div className="badge-name">On Fire</div>
            <div className="badge-desc">Complete 10 sessions</div>
          </div>

          <div className={`achievement-badge ${stats.companionsCreated >= 3 ? 'unlocked' : 'locked'}`}>
            <div className="badge-icon">
              <Bot size={32} />
            </div>
            <div className="badge-name">AI Master</div>
            <div className="badge-desc">Create 3 companions</div>
          </div>

          <div className={`achievement-badge ${stats.totalMinutes >= 60 ? 'unlocked' : 'locked'}`}>
            <div className="badge-icon">
              <Timer size={32} />
            </div>
            <div className="badge-name">Time Traveler</div>
            <div className="badge-desc">Learn for 60 minutes</div>
          </div>

          <div className={`achievement-badge ${stats.currentStreak >= 7 ? 'unlocked' : 'locked'}`}>
            <div className="badge-icon">
              <Star size={32} />
            </div>
            <div className="badge-name">Dedicated</div>
            <div className="badge-desc">7-day learning streak</div>
          </div>

          <div className="achievement-badge locked">
            <div className="badge-icon">
              <Trophy size={32} />
            </div>
            <div className="badge-name">Champion</div>
            <div className="badge-desc">Complete 50 sessions</div>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="journey-cta">
        <h3>Keep Learning!</h3>
        <p>Continue your journey and unlock more achievements</p>
        <button onClick={() => navigate('/library')} className="btn-primary">
          Browse Companions
        </button>
      </div>
    </div>
  );
};

export default MyJourney;
