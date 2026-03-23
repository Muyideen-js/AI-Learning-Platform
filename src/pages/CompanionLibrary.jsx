import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import CompanionCard from '../components/CompanionCard';
import CustomSelect from '../components/CustomSelect';
import { Search, Filter, ArrowLeft, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './CompanionLibrary.css';

const SUBJECTS = [
  { value: 'All', label: 'All Subjects' },
  { value: 'Maths', label: 'Maths' },
  { value: 'Language', label: 'Language' },
  { value: 'Science', label: 'Science' },
  { value: 'History', label: 'History' },
  { value: 'Coding', label: 'Coding' },
  { value: 'Economics', label: 'Economics' }
];

const CompanionLibrary = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [companions, setCompanions] = useState([]);
  const [myCompanions, setMyCompanions] = useState([]);
  const [otherCompanions, setOtherCompanions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompanions = async () => {
      try {
        const companionsRef = collection(db, 'companions');
        const companionsQuery = query(companionsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(companionsQuery);
        const companionsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setCompanions(companionsData);
      } catch (error) {
        console.error('Error fetching companions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanions();
  }, []);

  useEffect(() => {
    let filtered = [...companions];

    // Filter by subject
    if (selectedSubject !== 'All') {
      filtered = filtered.filter(c => c.subject === selectedSubject);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        c =>
          c.name.toLowerCase().includes(query) ||
          c.topic.toLowerCase().includes(query)
      );
    }

    // Separate into My Companions and Others
    const mine = filtered.filter(c => c.createdBy === currentUser?.uid);
    const others = filtered.filter(c => c.createdBy !== currentUser?.uid);
    
    setMyCompanions(mine);
    setOtherCompanions(others);
  }, [searchQuery, selectedSubject, companions, currentUser]);

  return (
    <div className="library-page">
      <div className="page-container">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => navigate(-1)} style={{ padding: '8px', background: 'transparent', border: '2px solid var(--border-light)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s ease' }} title="Go Back">
              <ArrowLeft size={20} />
            </button>
            <button onClick={() => navigate('/')} style={{ padding: '8px', background: 'transparent', border: '2px solid var(--border-light)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s ease' }} title="Back to Home">
              <Home size={20} />
            </button>
          </div>
          <h1 className="page-title" style={{ margin: 0 }}>Companion Library</h1>
        </div>

        <div className="library-filters">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search companions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="filter-box">
            <Filter size={18} />
            <CustomSelect
              value={selectedSubject}
              onChange={setSelectedSubject}
              options={SUBJECTS}
              placeholder="Filter by subject"
            />
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading companions...</div>
        ) : (
          <>
            {/* My Companions Section */}
            {myCompanions.length > 0 ? (
              <div style={{ marginBottom: '40px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '20px', color: 'var(--text-primary)' }}>
                  📚 My Companions
                </h2>
                <div className="grid grid-3">
                  {myCompanions.map(companion => (
                    <CompanionCard key={companion.id} companion={companion} />
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '40px', textAlign: 'center', padding: '40px 20px', background: 'var(--bg-secondary)', border: '2px dashed var(--border-light)', borderRadius: '8px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>
                  📚 No Companions Yet
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
                  Create your first AI companion to start learning!
                </p>
                <button 
                  onClick={() => navigate('/create-companion')}
                  style={{
                    padding: '10px 20px',
                    background: 'var(--text-primary)',
                    color: 'var(--bg-primary)',
                    border: '2px solid var(--text-primary)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}
                >
                  Create Companion
                </button>
              </div>
            )}

            {/* Discover Companions Section */}
            {otherCompanions.length > 0 && (
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '20px', color: 'var(--text-primary)' }}>
                  🌎 Discover Companions
                </h2>
                <div className="grid grid-3">
                  {otherCompanions.map(companion => (
                    <CompanionCard key={companion.id} companion={companion} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {myCompanions.length === 0 && otherCompanions.length === 0 && (
              <div className="empty-state">
                <p>No companions found matching your criteria.</p>
                <p>Try adjusting your search or filters.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CompanionLibrary;
