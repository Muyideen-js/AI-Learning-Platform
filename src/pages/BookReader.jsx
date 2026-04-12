import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Send, Sparkles, BookOpen, ChevronLeft, ChevronRight, FileQuestion } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { generateBookAIResponse } from '../lib/gemini';
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
          setBook({ id: docSnap.id, ...docSnap.data() });
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
    return <div className="loading" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading reader...</div>;
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
              file={book.fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<div className="pdf-loading">Loading PDF...</div>}
              error={<div className="pdf-error">Failed to load PDF. Please ensure the file is accessible.</div>}
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
            <h3><Sparkles size={18} /> Book Companion</h3>
            <div className="ai-quick-actions">
              <button 
                className="quick-action-btn" 
                onClick={() => handleAiAction('summarize')}
                disabled={isAiProcessing || !extractedText}
                title="Summarize current page"
              >
                <BookOpen size={16} /> Summarize
              </button>
              <button 
                className="quick-action-btn" 
                onClick={() => handleAiAction('quiz')}
                disabled={isAiProcessing || !extractedText}
                title="Generate quiz from current page"
              >
                <FileQuestion size={16} /> Flash Quiz
              </button>
            </div>
          </div>

          <div className="ai-chat-history">
            {chatMessages.length === 0 ? (
              <div className="empty-chat-state">
                <Sparkles size={32} />
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
