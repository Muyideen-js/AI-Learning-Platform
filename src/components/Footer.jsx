import { Twitter } from 'lucide-react';
import './Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="footer-content">
        <p>© {currentYear} AI Learning. All rights reserved.</p>
        <a 
          href="https://x.com/yaomin_dev" 
          target="_blank" 
          rel="noopener noreferrer"
          className="footer-link"
          title="Follow on X (Twitter)"
        >
          <Twitter size={18} />
          <span>@yaomin_dev</span>
        </a>
      </div>
    </footer>
  );
};

export default Footer;
