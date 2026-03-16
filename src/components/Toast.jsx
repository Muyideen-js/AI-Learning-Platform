import React from 'react';
import './Toast.css';

const Toast = ({ toasts }) => {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className="toast">
          {typeof toast.message === 'string' ? toast.message : 'Something went wrong'}
        </div>
      ))}
    </div>
  );
};

export default Toast;
