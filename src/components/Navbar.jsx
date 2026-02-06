import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, User, Sparkles, PlusSquare, Home, Library } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Navbar.css';

const Navbar = () => {
  const { currentUser, userData, logout } = useAuth();
  const navigate = useNavigate();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setUserDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <Sparkles size={18} />
          <span>AI Learning</span>
        </Link>

        <div className="navbar-links">
          <Link to="/" className="nav-link">
            <Home size={14} />
            <span>Home</span>
          </Link>
          <Link to="/library" className="nav-link">
            <Library size={14} />
            <span>Library</span>
          </Link>
          {currentUser ? (
            <>
              <Link to="/create-companion" className="nav-link">
                <PlusSquare size={14} />
                <span>Create</span>
              </Link>
              <Link to="/my-journey" className="nav-link">
                <User size={14} />
                <span>Journey</span>
              </Link>
              
              <div className="navbar-user" ref={dropdownRef}>
                <button
                  className="user-trigger"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    transition: 'all 0.3s ease'
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--bg-primary)',
                      fontWeight: '700',
                      fontSize: '14px',
                      textTransform: 'uppercase'
                    }}
                  >
                    {userData?.name?.charAt(0) || 'U'}
                  </div>
                  <span className="user-name" style={{ fontSize: '14px', fontWeight: '500' }}>
                    {userData?.name || 'User'}
                  </span>
                </button>

                <AnimatePresence>
                  {userDropdownOpen && (
                    <motion.div
                      className="user-dropdown"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <button onClick={handleLogout} className="dropdown-item">
                        <LogOut size={14} />
                        <span>Logout</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <Link to="/sign-in" className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '500' }}>
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
