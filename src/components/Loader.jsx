import React from 'react';
import { useRive } from '@rive-app/react-canvas';
import loadingRive from '../assets/anim/loading.riv';

const Loader = ({ size = 200, text = "Loading..." }) => {
  const { RiveComponent } = useRive({
    src: loadingRive,
    autoplay: true,
  });

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      alignItems: 'center', 
      padding: '40px',
      margin: '0 auto',
      width: '100%'
    }}>
      <div style={{ width: size, height: size, marginBottom: '16px' }}>
        <RiveComponent />
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '14px', letterSpacing: '2px', textTransform: 'uppercase' }}>
        {text}
      </div>
    </div>
  );
};

export default Loader;
