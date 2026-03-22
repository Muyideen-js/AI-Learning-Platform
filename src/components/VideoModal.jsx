import React, { useEffect, useState, useRef } from 'react';
import { X, PlayCircle, PauseCircle, StopCircle, RefreshCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './VideoModal.css';

const parseContent = (text) => {
  if (!text) return [];
  const blocks = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }
    blocks.push({ type: 'code', language: match[1], content: match[2] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    blocks.push({ type: 'text', content: text.substring(lastIndex) });
  }
  return blocks;
};

// Split text block into sentences for TTS
const getSentences = (text) => {
  const cleanText = text
    .replace(/\*\*/g, '')
    .replace(/#/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '');
  return (cleanText.match(/[^.!?\n]+[.!?\n]+/g) || [cleanText]).map(s => s.trim()).filter(s => s.length > 0);
};

const VideoModal = ({ isOpen, onClose, topic, text, companionName }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [visibleContent, setVisibleContent] = useState('');
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [currentCodeTyping, setCurrentCodeTyping] = useState('');
  const [activeCodeBlock, setActiveCodeBlock] = useState(null);
  
  const synthRef = useRef(window.speechSynthesis);
  const utteranceRef = useRef(null);
  const typingIntervalRef = useRef(null);
  
  useEffect(() => {
    if (text) {
      setBlocks(parseContent(text));
    }
  }, [text]);

  useEffect(() => {
    if (!isOpen) {
      stopPresentation();
    } else if (isOpen && blocks.length > 0 && !isPlaying && currentBlockIndex === 0 && !visibleContent) {
      startPresentation();
    }
    return () => stopPresentation();
  }, [isOpen, blocks]);

  const startPresentation = () => {
    stopPresentation();
    setIsPlaying(true);
    playBlock(0, '');
  };

  const playBlock = (index, accumulatedContent) => {
    if (index >= blocks.length) {
      setIsPlaying(false);
      setCurrentBlockIndex(index);
      return;
    }
    
    setIsPlaying(true);
    setCurrentBlockIndex(index);
    const block = blocks[index];
    
    if (block.type === 'text') {
      setActiveCodeBlock(null);
      const sentences = getSentences(block.content);
      playTextSentences(sentences, 0, accumulatedContent, index);
    } else if (block.type === 'code') {
      setActiveCodeBlock(block);
      playCodeTyping(block, accumulatedContent, index);
    }
  };

  const playTextSentences = (sentences, sIndex, accumulatedContent, bIndex) => {
    if (sIndex >= sentences.length) {
      // Calculate how many slashes to add, or just take the original block and format it
      const commentBlock = blocks[bIndex].content
        .split('\n')
        .map(l => l.trim() ? `// ${l.trim()}` : '')
        .join('\n');
      
      const newAcc = accumulatedContent + commentBlock + '\n\n';
      setVisibleContent(newAcc);
      playBlock(bIndex + 1, newAcc);
      return;
    }

    const sentence = sentences[sIndex];
    
    // Type the sentence as a comment
    const newAcc = accumulatedContent + '// ' + sentence + '\n';
    setVisibleContent(newAcc);

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = 1.05;
    utterance.pitch = 1.1;
    
    const voices = synthRef.current.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Female')) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => {
      playTextSentences(sentences, sIndex + 1, accumulatedContent, bIndex);
    };
    
    utterance.onerror = () => {
      // Skip on error
      playTextSentences(sentences, sIndex + 1, accumulatedContent, bIndex);
    };

    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };

  const playCodeTyping = (block, accumulatedContent, bIndex) => {
    let typed = '';
    let charIndex = 0;
    
    // Announce code
    const utterance = new SpeechSynthesisUtterance("Writing code example...");
    utterance.rate = 1.1;
    synthRef.current.speak(utterance);
    
    clearInterval(typingIntervalRef.current);
    typingIntervalRef.current = setInterval(() => {
      if (charIndex < block.content.length) {
        // Typing chunk
        typed += block.content.substring(charIndex, charIndex + 3);
        charIndex += 3;
        setCurrentCodeTyping(typed);
      } else {
        clearInterval(typingIntervalRef.current);
        const newAcc = accumulatedContent + `\n\`\`\`${block.language}\n${block.content}\n\`\`\`\n\n`;
        setVisibleContent(newAcc);
        setCurrentCodeTyping('');
        setActiveCodeBlock(null);
        setTimeout(() => playBlock(bIndex + 1, newAcc), 1000);
      }
    }, 30);
  };

  const stopPresentation = () => {
    synthRef.current.cancel();
    clearInterval(typingIntervalRef.current);
    setIsPlaying(false);
    setCurrentBlockIndex(0);
    setVisibleContent('');
    setCurrentCodeTyping('');
    setActiveCodeBlock(null);
  };

  const pausePresentation = () => {
    if (synthRef.current.speaking) {
      synthRef.current.pause();
    }
    clearInterval(typingIntervalRef.current);
    setIsPlaying(false);
  };

  const resumePresentation = () => {
    if (currentBlockIndex >= blocks.length) {
      startPresentation();
      return;
    }
    if (synthRef.current.paused) {
      synthRef.current.resume();
      setIsPlaying(true);
    } else if (activeCodeBlock) {
      // Resume typing
      setIsPlaying(true);
      playCodeTyping({ ...activeCodeBlock, content: activeCodeBlock.content.substring(currentCodeTyping.length) }, visibleContent, currentBlockIndex);
    } else {
      startPresentation();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="video-modal-overlay">
      <div className="video-modal-content ai-presentation-mode">
        <div className="video-modal-header">
          <div className="video-header-left">
            <div className={`ai-recording-indicator ${isPlaying ? 'active' : ''}`}></div>
            <h3>AI Code Tutorial Video</h3>
          </div>
          <button className="btn-close-video" onClick={onClose} title="Close Video">
            <X size={20} />
          </button>
        </div>
        
        <div className="video-modal-body presentation-body layout-split">
          
          <div className="presentation-stage split-left">
            {/* The Avatar Visuals */}
            <h2 className="presentation-topic">{topic}</h2>
            <div className={`ai-avatar-container ${isPlaying && !activeCodeBlock ? 'speaking' : ''}`}>
              <div className="avatar-rings">
                <div className="ring ring-1"></div>
                <div className="ring ring-2"></div>
                <div className="ring ring-3"></div>
              </div>
              <div className="ai-avatar-core">
                🤖
              </div>
              <div className="ai-name-badge">{companionName || 'AI Tutor'}</div>
            </div>

            <div className="presentation-controls">
              {isPlaying ? (
                <button className="ctrl-btn" onClick={pausePresentation}><PauseCircle size={24} /> Pause</button>
              ) : (
                <button className="ctrl-btn play" onClick={resumePresentation}><PlayCircle size={28} /> Play</button>
              )}
              <button className="ctrl-btn" onClick={stopPresentation}><StopCircle size={20} /> Stop</button>
              <button className="ctrl-btn" onClick={startPresentation}><RefreshCcw size={18} /> Restart</button>
            </div>
          </div>
          
          <div className="presentation-screen split-right vscode-theme">
             <div className="vscode-window">
               <div className="vscode-titlebar">
                 <div className="mac-buttons">
                   <span className="mac-btn close"></span>
                   <span className="mac-btn min"></span>
                   <span className="mac-btn max"></span>
                 </div>
                 <div className="vscode-title">lesson-workspace - Visual Studio Code</div>
               </div>
               
               <div className="vscode-main">
                 <div className="vscode-activity-bar">
                   <div className="activity-icon active">📄</div>
                   <div className="activity-icon">🔍</div>
                   <div className="activity-icon">⚡</div>
                   <div className="activity-icon">⚙️</div>
                 </div>
                 <div className="vscode-sidebar">
                   <div className="sidebar-title">EXPLORER</div>
                   <div className="explorer-section">
                     <div className="explorer-header">▼ LEARNING-MODULE</div>
                     <div className="explorer-item active">
                       <span className="file-icon">📄</span> tutorial.js
                     </div>
                     <div className="explorer-item">
                       <span className="file-icon"></span> index.html
                     </div>
                     <div className="explorer-item">
                       <span className="file-icon"></span> style.css
                     </div>
                   </div>
                 </div>
                 <div className="vscode-editor">
                   <div className="vscode-tabs">
                     <div className="vscode-tab active">
                        <span className="file-icon">📄</span> tutorial.js
                        <span className="tab-close">×</span>
                     </div>
                   </div>
                   
                   <div className="vscode-editor-content">
                     <div className="vscode-line-numbers">
                       {Array.from({ length: Math.max(20, (visibleContent + currentCodeTyping).split('\n').length + 5) }).map((_, i) => (
                         <div key={i} className="line-num">{i + 1}</div>
                       ))}
                     </div>
                     <div className="vscode-code-area">
                       {visibleContent || currentCodeTyping ? (
                         <pre><code>
                           <span className="code-comments">{visibleContent}</span>
                           {activeCodeBlock && (
                             <span className="live-typing">
                               {currentCodeTyping}<span className="cursor-blink">|</span>
                             </span>
                           )}
                         </code></pre>
                       ) : (
                         <div className="paused-text" style={{ paddingLeft: '8px' }}>
                           {isPlaying ? '// Initializing tutorial workspace...' : '// Press Play to begin the lesson.'}
                         </div>
                       )}
                     </div>
                   </div>
                 </div>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoModal;
