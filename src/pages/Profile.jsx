import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { Camera, Save, User, Mail, Shield, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Profile.css';

const Profile = () => {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  
  const [displayName, setDisplayName] = useState(currentUser?.displayName || userData?.name || '');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const fileInputRef = useRef(null);

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
    if (!displayName.trim()) {
      setError('Display name cannot be empty');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      // Update Auth Profile
      await updateProfile(currentUser, { displayName });
      
      // Update Firestore Document
      await updateDoc(doc(db, 'users', currentUser.uid), {
        name: displayName,
      });

      setIsEditing(false);
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
          <h1>My Profile</h1>
          <p>Manage your account settings and personal information</p>
        </div>

        {error && <div className="profile-alert error">{error}</div>}
        {successMessage && <div className="profile-alert success">{successMessage}</div>}

        <div className="profile-content">
          
          {/* Avatar Section */}
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
            <div className="sidebar-badge">
              <Shield size={14} /> 
              <span>{userData?.role === 'admin' ? 'Administrator' : 'Student'}</span>
            </div>

            <div className="sidebar-stats">
              <div className="stat-row">
                <span className="stat-label"><Calendar size={14} /> Joined</span>
                <span className="stat-val">
                  {userData?.createdAt ? new Date(userData.createdAt?.toDate ? userData.createdAt.toDate() : userData.createdAt).toLocaleDateString() : 'Recently'}
                </span>
              </div>
            </div>
            
            <button className="btn-outline-action" onClick={() => navigate('/my-journey')}>
              View Learning Journey
            </button>
          </div>

          {/* Details Section */}
          <div className="profile-details glass-panel">
            <div className="details-header">
              <h3>Personal Information</h3>
              {!isEditing && (
                <button className="btn-text-action" onClick={() => setIsEditing(true)}>
                  Edit Profile
                </button>
              )}
            </div>

            <form className="profile-form" onSubmit={handleSaveProfile}>
              <div className="form-group">
                <label><User size={16} /> Display Name</label>
                <input 
                  type="text" 
                  value={displayName} 
                  onChange={(e) => setDisplayName(e.target.value)} 
                  disabled={!isEditing || loading}
                  className="profile-input"
                />
              </div>

              <div className="form-group">
                <label><Mail size={16} /> Email Address</label>
                <input 
                  type="email" 
                  value={currentUser.email} 
                  disabled 
                  className="profile-input disabled"
                />
                <span className="input-hint">Email address cannot be changed directly.</span>
              </div>
              
              {isEditing && (
                <div className="form-actions">
                  <button type="button" className="btn-cancel" onClick={() => { setIsEditing(false); setDisplayName(currentUser.displayName || userData?.name); }} disabled={loading}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-save" disabled={loading}>
                    {loading ? 'Saving...' : <><Save size={16} /> Save Changes</>}
                  </button>
                </div>
              )}
            </form>

            <div className="account-danger-zone">
              <h3>Danger Zone</h3>
              <p>Once you delete your account, there is no going back. Please be certain.</p>
              <button className="btn-danger" onClick={() => alert('Account deletion currently disabled in demo mode.')}>
                Delete Account
              </button>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
