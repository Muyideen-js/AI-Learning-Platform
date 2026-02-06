import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Sparkles, Library } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import CompanionCard from '../components/CompanionCard';
import HomeRobot from '../components/HomeRobot';
import './Home.css';

const Home = () => {
  const { currentUser } = useAuth();
  const [popularCompanions, setPopularCompanions] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const companionsRef = collection(db, 'companions');
        let companionsSnapshot;
        try {
          const companionsQuery = query(companionsRef, orderBy('createdAt', 'desc'), limit(10));
          companionsSnapshot = await getDocs(companionsQuery);
        } catch (error) {
          companionsSnapshot = await getDocs(companionsRef);
        }
        const companions = companionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        companions.sort((a, b) => {
          const aBookmarks = Array.isArray(a.bookmarkedBy) ? a.bookmarkedBy.length : 0;
          const bBookmarks = Array.isArray(b.bookmarkedBy) ? b.bookmarkedBy.length : 0;
          return bBookmarks - aBookmarks;
        });
        setPopularCompanions(companions.slice(0, 3));

        if (currentUser) {
          const sessionsRef = collection(db, 'sessions');
          const sessionsQuery = query(
            sessionsRef,
            orderBy('startedAt', 'desc'),
            limit(5)
          );
          const sessionsSnapshot = await getDocs(sessionsQuery);
          const sessions = sessionsSnapshot.docs
            .filter(doc => doc.data().userId === currentUser.uid)
            .map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
          setRecentSessions(sessions);
        }
      } catch (error) {
        if (error.code !== 'permission-denied') {
          console.error('Error fetching data:', error);
        } else {
           console.warn('Data fetch permission denied (likely auth pending).');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser]);

  return (
    <div className="home-page">
      <div className="home-hero">
        <HomeRobot />
        <h1 className="home-title">Learn with AI Companions</h1>
        <p className="home-subtitle">
          Create personalized AI learning companions and engage in interactive voice-based learning sessions
        </p>
        <Link to={currentUser ? '/create-companion' : '/sign-in'} className="btn btn-primary btn-large">
          <Sparkles size={14} />
          Build a New Companion
        </Link>
      </div>

      <div className="page-container">
        <section className="home-section">
          <h2 className="section-title">
            <Library size={18} />
            Popular Companions
          </h2>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : popularCompanions.length > 0 ? (
            <div className="grid grid-3">
              {popularCompanions.map(companion => (
                <CompanionCard key={companion.id} companion={companion} />
              ))}
            </div>
          ) : (
            <div className="empty-state">No companions available yet</div>
          )}
        </section>

        {currentUser && recentSessions.length > 0 && (
          <section className="home-section">
            <h2 className="section-title">Recently Completed Sessions</h2>
            <div className="sessions-list">
              {recentSessions.map(session => (
                <div key={session.id} className="session-item">
                  <div className="session-info">
                    <h3>{session.companionName || 'Session'}</h3>
                    <p>{new Date(session.startedAt?.toDate()).toLocaleDateString()}</p>
                  </div>
                  <div className="session-duration">
                    {session.duration || 0} min
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default Home;
