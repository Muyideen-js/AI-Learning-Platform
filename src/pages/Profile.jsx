import React, { useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { Camera, Save, User, Mail, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Profile.css';

const Profile = () => {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [displayName, setDisplayName] = useState(currentUser?.displayName || userData?.name || '');
  const fileInputRef = useRef(null);

  const joinedLabel = useMemo(() => {
    const createdAt = userData?.createdAt;
    if (!createdAt) return 'Recently';
    const dateObj = createdAt?.toDate ? createdAt.toDate() : createdAt;
    if (!dateObj) return 'Recently';
    return new Date(dateObj).toLocaleDateString();
  }, [userData?.createdAt]);

  const roleLabel = userData?.role === 'admin' ? 'Administrator' : 'Student';
  const isDirty = displayName.trim() !== (currentUser?.displayName || userData?.name || '').trim();

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be less than 2MB');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const storageRef = ref(storage, `profiles/${currentUser.uid}/${file.name}`);
      await uploadBytes(storageRef, file);
      const photoURL = await getDownloadURL(storageRef);

      // Update Auth Profile
      await updateProfile(currentUser, { photoURL });
      
      // Update Firestore Document
      await updateDoc(doc(db, 'users', currentUser.uid), {
        photoURL,
      });

      setSuccessMessage('Profile photo updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setError('Failed to upload photo.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) return setError('Name cannot be empty');

    try {
      setLoading(true);
      setError('');
      
      // Update Auth Profile
      await updateProfile(currentUser, { displayName });
      
      // Update Firestore Document
      await updateDoc(doc(db, 'users', currentUser.uid), {
        name: displayName,
      });

      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setError('Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) return null;

  return (
    <div className="profile-page">
      <div className="profile-container">
        <div className="profile-header">
          <h1 className="profile-title">Profile</h1>
          <div className="profile-subtitle">{roleLabel}</div>
        </div>

        {error && <div className="profile-alert error">{error}</div>}
        {successMessage && <div className="profile-alert success">{successMessage}</div>}

        <div className="profile-content">
          <div className="profile-sidebar glass-panel">
            <div className="avatar-wrapper">
              <div className="avatar-circle">
                {currentUser.photoURL || userData?.photoURL ? (
                  <img src={currentUser.photoURL || userData?.photoURL} alt="Profile" />
                ) : (
                  <span className="avatar-placeholder">{displayName.charAt(0).toUpperCase() || 'U'}</span>
                )}
                <button 
                  className="btn-upload-photo" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  <Camera size={18} />
                </button>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handlePhotoUpload} 
                accept="image/jpeg, image/png, image/webp" 
                style={{ display: 'none' }} 
              />
            </div>
            
            <h2 className="sidebar-name">{displayName}</h2>
            <div className="sidebar-badge">{roleLabel}</div>
            <div className="sidebar-joined">
              <Calendar size={14} />
              <span>Joined {joinedLabel}</span>
            </div>
            
            <button className="btn-outline-action" onClick={() => navigate('/my-journey')}>
              Learning Journey
            </button>
          </div>

          <div className="profile-details glass-panel">
            <form className="profile-form" onSubmit={handleSaveProfile}>
              <div className="form-group">
                <label><User size={16} /> Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={loading}
                  className="profile-input"
                />
              </div>

              <div className="form-group">
                <label><Mail size={16} /> Email</label>
                <input
                  type="email"
                  value={currentUser.email || ''}
                  disabled
                  className="profile-input disabled"
                />
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn-save"
                  disabled={loading || !isDirty}
                >
                  {loading ? 'Saving...' : <><Save size={16} /> Save</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
