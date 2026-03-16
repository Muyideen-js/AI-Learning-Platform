import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, Search } from 'lucide-react';
import './NotFound.css';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="not-found-page">
      <div className="not-found-content">
        {/* Animated glitch 404 */}
        <div className="not-found-code" data-text="404">
          404
        </div>

        <h2 className="not-found-title">Page not found</h2>
        <p className="not-found-desc">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="not-found-actions">
          <button className="not-found-btn not-found-btn--primary" onClick={() => navigate('/')}>
            <Home size={18} />
            <span>Go Home</span>
          </button>
          <button className="not-found-btn not-found-btn--secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
            <span>Go Back</span>
          </button>
          <button className="not-found-btn not-found-btn--secondary" onClick={() => navigate('/library')}>
            <Search size={18} />
            <span>Browse Library</span>
          </button>
        </div>
      </div>

      {/* Floating particles */}
      <div className="not-found-particles">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="not-found-particle" style={{ animationDelay: `${i * 0.8}s` }} />
        ))}
      </div>
    </div>
  );
};

export default NotFound;
