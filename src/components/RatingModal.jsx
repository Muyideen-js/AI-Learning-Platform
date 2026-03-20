import { useState } from 'react';
import { collection, addDoc, doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Star, X } from 'lucide-react';
import './RatingModal.css';

const RatingModal = ({ isOpen, onClose, companionId, companionName, onRatingSubmitted }) => {
  const { currentUser } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Please select a star rating');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // 1. Add the individual review to the subcollection
      const reviewsRef = collection(db, 'companions', companionId, 'reviews');
      await addDoc(reviewsRef, {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous User',
        userPhoto: currentUser.photoURL || null,
        rating,
        createdAt: serverTimestamp()
      });

      // 2. Update the aggregate rating on the main companion document
      const companionRef = doc(db, 'companions', companionId);
      const companionSnap = await getDoc(companionRef);
      
      if (companionSnap.exists()) {
        const data = companionSnap.data();
        const prevCount = data.reviewCount || 0;
        const prevAvg = data.averageRating || 0;
        
        const newCount = prevCount + 1;
        const newAvg = ((prevAvg * prevCount) + rating) / newCount;
        
        await updateDoc(companionRef, {
          reviewCount: newCount,
          averageRating: Number(newAvg.toFixed(1))
        });
      }
      
      // Pass the rating back up so CompanionSession can update its local state immediately
      onRatingSubmitted(rating);
      
      onClose();
    } catch (err) {
      console.error('Error submitting review:', err);
      setError('Failed to submit review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="rating-modal">
        <button className="close-btn" onClick={onClose} disabled={isSubmitting}>
          <X size={20} />
        </button>

        <div className="rating-header">
          <h2>Rate Companion</h2>
          <p>What did you think of <strong>{companionName}</strong>?</p>
        </div>

        <form onSubmit={handleSubmit} className="rating-form">
          <div className="stars-container">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={`star-btn ${(hoverRating || rating) >= star ? 'active' : ''}`}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
              >
                <Star size={28} fill={(hoverRating || rating) >= star ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>

          {error && <div className="rating-error">{error}</div>}

          <div className="rating-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || rating === 0}>
              {isSubmitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RatingModal;
