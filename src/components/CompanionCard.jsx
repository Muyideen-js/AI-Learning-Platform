import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Bookmark, BookmarkCheck, Trash2 } from 'lucide-react';
import { doc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import DeleteConfirmModal from './DeleteConfirmModal';
import './CompanionCard.css';

const SUBJECT_COLORS = {
  Maths: '#4f46e5', // Indigo
  Language: '#0891b2', // Cyan
  Science: '#059669', // Emerald
  History: '#b45309', // Amber
  Coding: '#7c3aed', // Violet
  Economics: '#db2777' // Pink
};

const CompanionCard = ({ companion }) => {
  const { currentUser, userData, refreshUserData } = useAuth();
  const isBookmarked = userData?.bookmarkedCompanions?.includes(companion.id) || false;
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const toggleBookmark = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!currentUser) return;

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      if (isBookmarked) {
        await updateDoc(userRef, {
          bookmarkedCompanions: arrayRemove(companion.id)
        });
      } else {
        await updateDoc(userRef, {
          bookmarkedCompanions: arrayUnion(companion.id)
        });
      }
      // Refresh user data to update UI immediately
      await refreshUserData();
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    }
  };

  const handleDeleteClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteDoc(doc(db, 'companions', companion.id));
      setShowDeleteModal(false);
      // Refresh the page to update the list
      window.location.reload();
    } catch (error) {
      console.error('Error deleting companion:', error);
      alert('Failed to delete companion. Please try again.');
    }
  };

  return (
    <>
      <Link to={`/companion/${companion.id}`} className="companion-card">
        <div
          className="companion-card-header"
          style={{ backgroundColor: SUBJECT_COLORS[companion.subject] || '#6b7280' }}
        >
          <div className="companion-card-subject">{companion.subject}</div>
          {currentUser && (
            <div className="card-actions">
              <button
                onClick={toggleBookmark}
                className="bookmark-btn"
                aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              >
                {isBookmarked ? (
                  <BookmarkCheck size={14} fill="white" />
                ) : (
                  <Bookmark size={14} />
                )}
              </button>
              {companion.createdBy === currentUser.uid && (
                <button
                  onClick={handleDeleteClick}
                  className="delete-btn"
                  aria-label="Delete companion"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="companion-card-body">
          <h3 className="companion-card-name">{companion.name}</h3>
          <p className="companion-card-topic">{companion.topic}</p>
          <div className="companion-card-footer">
            <span className="companion-card-duration">
              {companion.duration} min
            </span>
            <span className="companion-card-style">
              {companion.style === 'formal' ? 'Formal' : 'Casual'}
            </span>
          </div>
        </div>
      </Link>

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        companionName={companion.name}
      />
    </>
  );
};

export default CompanionCard;


