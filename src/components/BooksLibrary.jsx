import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, Search, UploadCloud, Globe, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import UploadBookModal from './UploadBookModal';
import './BooksLibrary.css';

const BooksLibrary = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [books, setBooks] = useState([]);
  const [myBooks, setMyBooks] = useState([]);
  const [discoverBooks, setDiscoverBooks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const fetchBooks = async () => {
    setLoading(true);
    try {
      const booksRef = collection(db, 'books');
      
      // Ideally we would run two queries, but for simplicity here we fetch all and filter
      const q = query(booksRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const allBooks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setBooks(allBooks);
    } catch (err) {
      console.error('Error fetching books:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, [currentUser]);

  useEffect(() => {
    let filtered = books;
    if (searchQuery.trim()) {
      const lowered = searchQuery.toLowerCase();
      filtered = filtered.filter(b => 
        b.title?.toLowerCase().includes(lowered) || 
        b.author?.toLowerCase().includes(lowered)
      );
    }

    const mine = filtered.filter(b => b.userId === currentUser?.uid);
    const publicBooks = filtered.filter(b => b.isPublic && b.userId !== currentUser?.uid);

    setMyBooks(mine);
    setDiscoverBooks(publicBooks);
  }, [books, searchQuery, currentUser]);

  const handleUploadComplete = () => {
    fetchBooks();
  };

  const handleBookClick = (bookId) => {
    navigate(`/book/${bookId}`);
  };

  return (
    <div className="books-library-container">
      <div className="books-header-actions">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search books..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <button className="upload-btn" onClick={() => setShowUploadModal(true)}>
          <UploadCloud size={18} /> Upload PDF
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading books...</div>
      ) : (
        <>
          <div className="books-section">
            <h2 className="section-heading">My Library</h2>
            {myBooks.length > 0 ? (
              <div className="books-grid">
                {myBooks.map((book) => (
                  <BookCard key={book.id} book={book} onClick={() => handleBookClick(book.id)} />
                ))}
              </div>
            ) : (
              <div className="empty-state books-empty">
                <BookOpen size={32} className="empty-icon" />
                <p>You haven't uploaded any books yet.</p>
                <button onClick={() => setShowUploadModal(true)} className="empty-action-btn">Upload your first PDF</button>
              </div>
            )}
          </div>

          {discoverBooks.length > 0 && (
            <div className="books-section discover-section">
              <h2 className="section-heading"><Globe size={20} style={{ marginRight: '8px' }} /> Discover Public Books</h2>
              <div className="books-grid">
                {discoverBooks.map((book) => (
                  <BookCard key={book.id} book={book} onClick={() => handleBookClick(book.id)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <UploadBookModal 
        isOpen={showUploadModal} 
        onClose={() => setShowUploadModal(false)} 
        onUploadComplete={handleUploadComplete} 
      />
    </div>
  );
};

// Book Card Subcomponent
const BookCard = ({ book, onClick }) => {
  return (
    <div className="book-card glass-panel" onClick={onClick}>
      <div className="book-cover-placeholder">
        <BookOpen size={48} className="cover-icon" />
        {book.isPublic ? (
          <div className="book-badge public" title="Public Book"><Globe size={12} /></div>
        ) : (
          <div className="book-badge private" title="Private Book"><Lock size={12} /></div>
        )}
      </div>
      <div className="book-meta">
        <h3 className="book-title">{book.title}</h3>
        <p className="book-author">{book.author || 'Unknown Author'}</p>
      </div>
      <div className="book-actions-overlay">
        <span>Read & Chat</span>
      </div>
    </div>
  );
};

export default BooksLibrary;
