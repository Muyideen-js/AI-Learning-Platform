import React from 'react';
import { X, Youtube } from 'lucide-react';
import './VideoModal.css';

const VideoModal = ({ isOpen, onClose, query }) => {
  if (!isOpen) return null;

  // Enhance the query for educational results
  const searchQuery = encodeURIComponent(`coding tutorial ${query}`);

  return (
    <div className="video-modal-overlay">
      <div className="video-modal-content">
        <div className="video-modal-header">
          <div className="video-header-left">
            <Youtube size={20} color="#ff0000" />
            <h3>Video Explanation</h3>
          </div>
          <button className="btn-close-video" onClick={onClose} title="Close Video">
            <X size={20} />
          </button>
        </div>
        <div className="video-modal-body">
          <p className="video-context">Generating video tutorial for: <strong>{query}</strong></p>
          <div className="video-iframe-container">
            <iframe
              width="100%"
              height="100%"
              src={`https://www.youtube.com/embed?listType=search&list=${searchQuery}`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Video Explanation"
            ></iframe>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoModal;
