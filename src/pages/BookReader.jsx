import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Send, ChevronLeft, ChevronRight } from 'lucide-react';
import { CiEdit } from "react-icons/ci";
import { TbClockQuestion } from "react-icons/tb";
import { PiChatCenteredTextThin } from "react-icons/pi";
import { Sparkles } from 'lucide-react'; // Keeping Sparkles for chat messages only
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { generateBookAIResponse } from '../lib/gemini';
import { getFile } from '../lib/localDb';
import ReactMarkdown from 'react-markdown';
import './BookReader.css';

// Set up PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const BookReader = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pdfFile, setPdfFile] = useState(null);

  // PDF State
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [extractedText, setExtractedText] = useState('');
  const [pdfRef, setPdfRef] = useState(null);

  // AI Chat State
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const fetchBook = async () => {
      try {
        const docRef = doc(db, 'books', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const bookData = { id: docSnap.id, ...docSnap.data() };
          setBook(bookData);
          
          // If stored locally, fetch from IndexedDB
          if (bookData.fileUrl === 'local' && bookData.localId) {
            const fileBlob = await getFile(bookData.localId);
            if (fileBlob) {
              setPdfFile(URL.createObjectURL(fileBlob));
            } else {
              console.error('Local file not found in IndexedDB');
            }
          } else {
            setPdfFile(bookData.fileUrl);
          }
        } else {
          navigate('/library');
        }
      } catch (err) {
        console.error('Error fetching book:', err);
        navigate('/library');
      } finally {
        setLoading(false);
      }
    };
    fetchBook();

    return () => {
      if (pdfFile && pdfFile.startsWith('blob:')) {
        URL.revokeObjectURL(pdfFile);
      }
    };
  }, [id, navigate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const onDocumentLoadSuccess = async (pdf) => {
    setNumPages(pdf.numPages);
    setPdfRef(pdf);
    
    // Initial extraction for the first page
    extractTextFromPage(pdf, 1);
  };

  const extractTextFromPage = async (pdf, pageNum) => {
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((item) => item.str).join(' ');
      setExtractedText(text);
    } catch (err) {
      console.error('Error extracting text:', err);
    }
  };

  const changePage = (offset) => {
    const newPage = pageNumber + offset;
    if (newPage >= 1 && newPage <= numPages) {
      setPageNumber(newPage);
      if (pdfRef) extractTextFromPage(pdfRef, newPage);
    }
  };

  const handleAiAction = async (actionType) => {
    if (!extractedText.trim()) return;
    
    let userMsgDisplay = '';
    if (actionType === 'summarize') userMsgDisplay = `Summarize page ${pageNumber}`;
    else if (actionType === 'quiz') userMsgDisplay = `Generate a quiz for page ${pageNumber}`;
    else userMsgDisplay = inputMessage;

    const newMessage = { sender: 'user', text: userMsgDisplay };
    setChatMessages((prev) => [...prev, newMessage]);
    setInputMessage('');
    setIsAiProcessing(true);

    try {
      // Build history
      const history = chatMessages.map(m => ({
        role: m.sender === 'ai' ? 'assistant' : 'user',
        content: m.text
      }));

      const contextHint = `[Currently reading Page ${pageNumber} of "${book.title}"]\n\n${extractedText}`;

      const responseText = await generateBookAIResponse({
        action: actionType,
        bookContext: contextHint,
        userMessage: actionType === 'chat' ? inputMessage : '',
        conversationHistory: history
      });

      setChatMessages((prev) => [...prev, { sender: 'ai', text: responseText }]);
    } catch (err) {
      console.error(err);
      setChatMessages((prev) => [...prev, { sender: 'ai', text: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isAiProcessing) return;
    handleAiAction('chat');
  };

  if (loading) {
    return <div className="loading" style={{ height: '100vh', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', justifyContent: 'center' }}>
      <Sparkles className="glow-icon" size={32} />
      <span>Fetching your document...</span>
    </div>;
  }

  if (!book) return null;

  return (
    <div className="book-reader-layout">
      {/* Top Panel (Navigation) */}
      <div className="reader-nav glass-panel">
        <button onClick={() => navigate('/library')} className="reader-back-btn">
          <ArrowLeft size={20} /> Back to Library
        </button>
        <span className="reader-title">{book.title}</span>
        <div className="reader-controls">
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="control-btn">-</button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(2.5, s + 0.1))} className="control-btn">+</button>
        </div>
      </div>

      <div className="reader-workspace">
        {/* PDF Viewer Pane */}
        <div className="pdf-pane">
          <div className="pdf-container">
            <Document
              file={pdfFile}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<div className="pdf-loading">Preparing reader...</div>}
              error={
                <div className="pdf-error">
                  <h3>Failed to load PDF</h3>
                  <p>This document is stored locally in your browser. If you uploaded it on another device, you'll need to re-upload it here.</p>
                  <button onClick={() => navigate('/library')} className="retry-btn">Back to Library</button>
                </div>
              }
            >
              <Page 
                pageNumber={pageNumber} 
                scale={scale} 
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="pdf-page-shadow"
              />
            </Document>
          </div>
          
          <div className="pdf-pagination glass-panel">
            <button onClick={() => changePage(-1)} disabled={pageNumber <= 1}><ChevronLeft size={20} /></button>
            <span>Page {pageNumber} of {numPages || '--'}</span>
            <button onClick={() => changePage(1)} disabled={pageNumber >= numPages}><ChevronRight size={20} /></button>
          </div>
        </div>

        {/* AI Companion Pane */}
        <div className="ai-pane glass-panel">
          <div className="ai-pane-header">
            <h3>Book Companion</h3>
            <div className="ai-quick-actions">
              <button 
                className="quick-action-btn" 
                onClick={() => handleAiAction('summarize')}
                disabled={isAiProcessing || !extractedText}
                title="Summarize current page"
              >
                <CiEdit size={18} /> Summarize
              </button>
              <button 
                className="quick-action-btn" 
                onClick={() => handleAiAction('quiz')}
                disabled={isAiProcessing || !extractedText}
                title="Generate quiz from current page"
              >
                <TbClockQuestion size={18} /> Flash Quiz
              </button>
            </div>
          </div>

          <div className="ai-chat-history">
            {chatMessages.length === 0 ? (
              <div className="empty-chat-state">
                <PiChatCenteredTextThin size={48} />
                <p>Ask a question about the current page, or use the quick actions above to generate summaries and quizzes.</p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-message ${msg.sender}`}>
                  {msg.sender === 'ai' && <div className="ai-avatar"><Sparkles size={14} /></div>}
                  <div className="message-bubble">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                </div>
              ))
            )}
            {isAiProcessing && (
              <div className="chat-message ai processing">
                <div className="ai-avatar"><Sparkles size={14} /></div>
                <div className="typing-indicator">
                  <span>.</span><span>.</span><span>.</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="ai-chat-input">
            <input
              type="text"
              placeholder="Ask about this page..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={isAiProcessing || !extractedText}
            />
            <button type="submit" disabled={!inputMessage.trim() || isAiProcessing}>
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BookReader;
