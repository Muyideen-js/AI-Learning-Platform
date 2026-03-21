import { useState, useRef, useCallback, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Sparkles, CheckCircle, Trash2, X, ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
import { reviewCode } from '../lib/gemini';
import ReactMarkdown from 'react-markdown';
import './CodeSandbox.css';

// Detect language from companion topic
const detectLanguage = (topic = '', subject = '') => {
  const text = `${topic} ${subject}`.toLowerCase();
  if (text.includes('python')) return 'python';
  if (text.includes('html') || text.includes('web')) return 'html';
  if (text.includes('css')) return 'css';
  if (text.includes('typescript') || text.includes('tsx')) return 'typescript';
  if (text.includes('java') && !text.includes('javascript')) return 'java';
  if (text.includes('c++') || text.includes('cpp')) return 'cpp';
  if (text.includes('c#') || text.includes('csharp')) return 'csharp';
  if (text.includes('php')) return 'php';
  if (text.includes('sql')) return 'sql';
  if (text.includes('go') || text.includes('golang')) return 'go';
  if (text.includes('rust')) return 'rust';
  return 'javascript'; // default for React, JS, Node, etc.
};

const LANGUAGE_OPTIONS = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'html',       label: 'HTML' },
  { value: 'css',        label: 'CSS' },
  { value: 'python',     label: 'Python' },
  { value: 'java',       label: 'Java' },
  { value: 'cpp',        label: 'C++' },
  { value: 'csharp',     label: 'C#' },
  { value: 'php',        label: 'PHP' },
  { value: 'sql',        label: 'SQL' },
  { value: 'go',         label: 'Go' },
  { value: 'rust',       label: 'Rust' },
];

const STARTER_CODE = {
  javascript: `// Write your JavaScript code here\n`,
  typescript: `// Write your TypeScript code here\n`,
  html: `<!-- Write your HTML structure here -->\n`,
  css: `/* Write your CSS styles here */\n`,
  python: `# Write your Python code here\n`,
  java: `// Write your Java code here\n`,
  cpp: `// Write your C++ code here\n`,
  csharp: `// Write your C# code here\n`,
  php: `<?php\n// Write your PHP code here\n?>\n`,
  sql: `-- Write your SQL queries here\n`,
  go: `// Write your Go code here\n`,
  rust: `// Write your Rust code here\n`,
};

/**
 * AI Code Sandbox — Monaco editor + live preview + Gemini code review.
 * Only rendered for coding-related companions.
 */
const CodeSandbox = ({ isOpen, onClose, companion, currentModule, lastAiMessage, onCodeChecked }) => {
  const defaultLang = detectLanguage(companion?.topic, companion?.subject);
  const [language, setLanguage] = useState(defaultLang);
  const [code, setCode] = useState(STARTER_CODE[defaultLang] || STARTER_CODE.javascript);
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [review, setReview] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState('output'); // 'output' | 'review'
  const iframeRef = useRef(null);
  const editorRef = useRef(null);

  const handleEditorMount = (editor) => {
    editorRef.current = editor;
  };

  // Run code based on language
  const runCode = useCallback(() => {
    setIsRunning(true);
    setActiveTab('output');
    setOutput('');

    try {
      if (language === 'html') {
        // HTML: render in iframe
        if (iframeRef.current) {
          iframeRef.current.srcdoc = code;
          setOutput('__HTML_RENDERED__');
        }
      } else if (language === 'javascript' || language === 'typescript') {
        // JS/TS: capture console.log output
        const logs = [];
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        console.log = (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
        console.error = (...args) => logs.push('❌ ' + args.map(a => String(a)).join(' '));
        console.warn = (...args) => logs.push('⚠️ ' + args.map(a => String(a)).join(' '));

        try {
          const fn = new Function(code);
          fn();
          setOutput(logs.length > 0 ? logs.join('\n') : '✅ Code executed successfully (no console output)');
        } catch (err) {
          setOutput(`❌ Runtime Error:\n${err.message}`);
        } finally {
          console.log = originalLog;
          console.error = originalError;
          console.warn = originalWarn;
        }
      } else if (language === 'css') {
        // CSS: wrap in HTML and render
        const htmlWrapper = `<!DOCTYPE html><html><head><style>${code}</style></head><body><div class="demo"><h1>CSS Preview</h1><p>Your styles are applied to this page.</p><button>Sample Button</button></div></body></html>`;
        if (iframeRef.current) {
          iframeRef.current.srcdoc = htmlWrapper;
          setOutput('__HTML_RENDERED__');
        }
      } else {
        // Other languages: show "preview only" message
        setOutput(`⚡ ${LANGUAGE_OPTIONS.find(l => l.value === language)?.label || language} preview is not available in-browser.\n\nYour code has been syntax-checked by the editor.\nClick "Ask AI" to get a full review and find potential issues.`);
      }
    } catch (err) {
      setOutput(`❌ Error: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  }, [code, language]);

  // Ask Gemini to review code
  const handleAskAI = useCallback(async () => {
    if (!code.trim()) return;
    setIsReviewing(true);
    setActiveTab('review');
    setReview(null);

    try {
      const moduleContext = currentModule
        ? `Module ${currentModule.id}: ${currentModule.title} — ${currentModule.description}`
        : '';
      const result = await reviewCode(code, language, moduleContext, lastAiMessage);
      setReview(result);
      if (onCodeChecked) {
        onCodeChecked(result);
      }
    } catch (err) {
      setReview(`❌ Failed to get AI review: ${err.message}`);
    } finally {
      setIsReviewing(false);
    }
  }, [code, language, currentModule, lastAiMessage]);

  // Change language
  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    setCode(STARTER_CODE[lang] || '');
    setOutput('');
    setReview(null);
    setShowLangDropdown(false);
  };

  const handleClear = () => {
    setCode(STARTER_CODE[language] || '');
    setOutput('');
    setReview(null);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = () => setShowLangDropdown(false);
    if (showLangDropdown) document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showLangDropdown]);

  if (!isOpen) return null;

  const currentLangLabel = LANGUAGE_OPTIONS.find(l => l.value === language)?.label || language;

  return (
    <div className={`code-sandbox ${isExpanded ? 'expanded' : ''}`}>
      {/* Header */}
      <div className="sandbox-header">
        <div className="sandbox-header-left">
          <span className="sandbox-icon">&lt;/&gt;</span>
          <span className="sandbox-title">Code Sandbox</span>

          {/* Language Selector */}
          <div className="lang-selector" onClick={(e) => { e.stopPropagation(); setShowLangDropdown(!showLangDropdown); }}>
            <span className="lang-current">{currentLangLabel}</span>
            <ChevronDown size={12} />
            {showLangDropdown && (
              <div className="lang-dropdown">
                {LANGUAGE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`lang-option ${opt.value === language ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleLanguageChange(opt.value); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sandbox-header-right">
          <button className="sandbox-btn sandbox-btn--run" onClick={runCode} disabled={isRunning}>
            <Play size={13} />
            Run
          </button>
          <button className="sandbox-btn sandbox-btn--ai" onClick={handleAskAI} disabled={isReviewing || !code.trim()} title="Verify code against the AI task">
            <CheckCircle size={13} />
            {isReviewing ? 'Checking...' : 'Check My Code'}
          </button>
          <button className="sandbox-btn sandbox-btn--clear" onClick={handleClear} title="Clear">
            <Trash2 size={13} />
          </button>
          <button className="sandbox-btn sandbox-btn--expand" onClick={() => setIsExpanded(!isExpanded)} title={isExpanded ? 'Minimize' : 'Expand'}>
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button className="sandbox-btn sandbox-btn--close" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Editor + Output */}
      <div className="sandbox-body">
        {/* Code Editor */}
        <div className="sandbox-editor">
          <Editor
            height="100%"
            language={language}
            value={code}
            onChange={(val) => setCode(val || '')}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: 20,
              padding: { top: 12 },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              tabSize: 2,
              renderWhitespace: 'none',
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              overviewRulerBorder: false,
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
              },
            }}
          />
        </div>

        {/* Output Panel */}
        <div className="sandbox-output">
          {/* Tabs */}
          <div className="output-tabs">
            <button
              className={`output-tab ${activeTab === 'output' ? 'active' : ''}`}
              onClick={() => setActiveTab('output')}
            >
              Output
            </button>
            <button
              className={`output-tab ${activeTab === 'review' ? 'active' : ''}`}
              onClick={() => setActiveTab('review')}
            >
              Task Check {review ? '✅' : ''}
            </button>
          </div>

          <div className="output-content">
            {activeTab === 'output' ? (
              <>
                {/* Hidden iframe for HTML rendering */}
                <iframe
                  ref={iframeRef}
                  className="output-iframe"
                  sandbox="allow-scripts"
                  title="Code output"
                  style={{ display: output === '__HTML_RENDERED__' ? 'block' : 'none' }}
                />
                {output && output !== '__HTML_RENDERED__' && (
                  <pre className="output-console">{output}</pre>
                )}
                {!output && (
                  <div className="output-placeholder">
                    Click <strong>Run</strong> to execute your code
                  </div>
                )}
              </>
            ) : (
              <div className="output-review">
                {isReviewing ? (
                  <div className="review-loading">
                    <div className="review-spinner" />
                    <span>Verifying your code...</span>
                  </div>
                ) : review ? (
                  <div className="review-content">
                    <ReactMarkdown>{review}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="output-placeholder">
                    Click <strong>Check My Code</strong> to see if you solved the AI's challenge!
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeSandbox;
