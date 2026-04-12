import React, { useState, useRef } from 'react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import { X, UploadCloud, FileText, CheckCircle } from 'lucide-react';
import './UploadBookModal.css';

const UploadBookModal = ({ isOpen, onClose, onUploadComplete }) => {
  const { currentUser } = useAuth();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected && selected.type === 'application/pdf') {
      setFile(selected);
      if (!title) setTitle(selected.name.replace('.pdf', ''));
      setError(null);
    } else {
      setError('Please select a valid PDF file.');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === 'application/pdf') {
      setFile(dropped);
      if (!title) setTitle(dropped.name.replace('.pdf', ''));
      setError(null);
    } else {
      setError('Please drop a valid PDF file.');
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return setError('Please select a file first.');
    if (!title.trim()) return setError('Please enter a title.');

    setUploading(true);
    setError(null);

    try {
      const storageRef = ref(storage, `books/${currentUser.uid}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(p);
        },
        (err) => {
          console.error(err);
          setError('Failed to upload file.');
          setUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          const newDoc = await addDoc(collection(db, 'books'), {
            title,
            author: author || 'Unknown',
            fileUrl: downloadURL,
            fileName: file.name,
            isPublic,
            userId: currentUser.uid,
            createdAt: serverTimestamp(),
            tags: [],
            likes: 0
          });

          setUploading(false);
          setProgress(0);
          setFile(null);
          setTitle('');
          setAuthor('');
          if (onUploadComplete) onUploadComplete(newDoc.id);
          onClose();
        }
      );
    } catch (err) {
      console.error(err);
      setError('An error occurred during upload.');
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="upload-modal glass-panel">
        <div className="modal-header">
          <h2>Upload PDF / Book</h2>
          <button onClick={onClose} className="close-btn" disabled={uploading}>
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleUpload} className="upload-form">
          <div 
            className={`drop-zone ${file ? 'has-file' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? (
              <div className="file-info">
                <FileText size={40} className="file-icon" />
                <span>{file.name}</span>
                <p className="file-size">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                <div className="change-file">Click to change</div>
              </div>
            ) : (
              <div className="drop-content">
                <UploadCloud size={48} className="upload-icon" />
                <p>Click to browse or drag & drop</p>
                <span className="supported">Supports .pdf up to 50MB</span>
              </div>
            )}
            <input 
              type="file" 
              accept=".pdf" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileChange} 
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>Title</label>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="e.g. Intro to Machine Learning" 
              disabled={uploading}
              required 
            />
          </div>

          <div className="form-group">
            <label>Author (Optional)</label>
            <input 
              type="text" 
              value={author} 
              onChange={(e) => setAuthor(e.target.value)} 
              placeholder="e.g. John Doe" 
              disabled={uploading}
            />
          </div>

          <div className="form-group row-group">
            <label className="toggle-label">
              <input 
                type="checkbox" 
                checked={isPublic} 
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={uploading}
              />
              <span className="toggle-text">Make this book public</span>
            </label>
            <span className="help-text">Public books can be discovered by other learners.</span>
          </div>

          {uploading ? (
            <div className="upload-progress-container">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <span className="progress-text">Uploading... {Math.round(progress)}%</span>
            </div>
          ) : (
            <button type="submit" className="upload-submit-btn" disabled={!file}>
              <CheckCircle size={18} /> Confirm Upload
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

export default UploadBookModal;
