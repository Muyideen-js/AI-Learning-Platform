import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './DeleteConfirmModal.css';

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, companionName }) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-content"
            initial={{ scale: 0.8, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 50 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={onClose}>
              <X size={20} />
            </button>

            <div className="modal-icon">
              <motion.div
                className="warning-icon"
                initial={{ scale: 0 }}
                animate={{ scale: 1, rotate: [0, -10, 10, -10, 0] }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                ⚠️
              </motion.div>
            </div>

            <h2 className="modal-title">Delete Companion?</h2>
            <p className="modal-message">
              Are you sure you want to delete <strong>"{companionName}"</strong>?
            </p>
            <p className="modal-warning">
              This action cannot be undone.
            </p>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-delete" onClick={onConfirm}>
                Delete Forever
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DeleteConfirmModal;
