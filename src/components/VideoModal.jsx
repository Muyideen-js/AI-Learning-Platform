import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCcw, Video, X } from 'lucide-react';
import './VideoModal.css';

const extractCode = (value = '') => {
  const match = value.match(/```[\w]*\n([\s\S]*?)```/);
  return match?.[1]?.trim() || '';
};

const extractNarration = (value = '') => {
  const noCode = value.replace(/```[\s\S]*?```/g, '');
  return noCode
    .replace(/[#>*`_-]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
};

const VideoModal = ({ isOpen, onClose, topic, text, companionName }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');
  const [previewCode, setPreviewCode] = useState('');
  const [previewLine, setPreviewLine] = useState('');
  const rafRef = useRef(null);
  const recorderRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl('');
      setProgress(0);
      setPreviewCode('');
      setPreviewLine('');
      setError('');
    }
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isOpen]);

  const codeText = useMemo(() => {
    const parsed = extractCode(text || '');
    if (parsed) return parsed;
    return `// ${topic || 'Lesson'}\nfunction explainConcept() {\n  return "Practice with examples and short exercises.";\n}\n\nconsole.log(explainConcept());`;
  }, [text, topic]);

  const narration = useMemo(() => {
    const parsed = extractNarration(text || '');
    return parsed || `In this lesson, ${companionName || 'your tutor'} explains ${topic || 'the concept'} while writing code live.`;
  }, [text, topic, companionName]);

  const drawWrappedText = (ctx, textValue, x, y, maxWidth, lineHeight, maxLines = 4) => {
    const words = textValue.split(' ');
    let line = '';
    let lineCount = 0;
    for (let i = 0; i < words.length; i += 1) {
      const test = `${line}${words[i]} `;
      const width = ctx.measureText(test).width;
      if (width > maxWidth && line) {
        ctx.fillText(line.trim(), x, y + lineCount * lineHeight);
        line = `${words[i]} `;
        lineCount += 1;
        if (lineCount >= maxLines) break;
      } else {
        line = test;
      }
    }
    if (lineCount < maxLines) ctx.fillText(line.trim(), x, y + lineCount * lineHeight);
  };

  const generateVideo = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError('');
    setProgress(0);
    setVideoUrl('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(30);
      const chunks = [];

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data);
      };

      const durationMs = Math.min(70000, Math.max(18000, codeText.length * 25));
      const start = performance.now();
      const teacherName = companionName || 'AI Tutor';

      const drawFrame = (now) => {
        const elapsed = now - start;
        const pct = Math.min(1, elapsed / durationMs);
        const typedLen = Math.floor(codeText.length * pct);
        const typedCode = codeText.slice(0, typedLen);
        const currentSentence = narration.slice(0, Math.floor(narration.length * pct));

        setProgress(Math.round(pct * 100));
        setPreviewCode(typedCode);
        const sentenceParts = currentSentence.split(/[.!?]/).filter(Boolean);
        setPreviewLine(sentenceParts[sentenceParts.length - 1] || '');

        ctx.fillStyle = '#0c0f16';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#151a23';
        ctx.fillRect(0, 0, canvas.width, 78);
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 26px Inter, sans-serif';
        ctx.fillText(`Real Lesson Video • ${topic || 'AI Tutorial'}`, 36, 50);

        ctx.fillStyle = '#121721';
        ctx.fillRect(36, 102, 400, 560);
        ctx.fillStyle = '#2f81f7';
        ctx.beginPath();
        ctx.arc(236, 238, 84, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '700 46px Inter, sans-serif';
        ctx.fillText('TEACHER', 132, 252);
        ctx.font = '600 30px Inter, sans-serif';
        ctx.fillText(teacherName.slice(0, 16), 96, 348);
        ctx.font = '400 22px Inter, sans-serif';
        ctx.fillStyle = '#b8c0d6';
        drawWrappedText(ctx, currentSentence || narration, 64, 410, 340, 34, 7);

        ctx.fillStyle = '#0b0f15';
        ctx.fillRect(464, 102, 780, 560);
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(464, 102, 780, 44);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '500 18px monospace';
        ctx.fillText('lesson.ts', 494, 130);

        ctx.fillStyle = '#d1d5db';
        ctx.font = '22px Consolas, monospace';
        const lines = typedCode.split('\n');
        lines.forEach((line, idx) => {
          ctx.fillStyle = '#64748b';
          ctx.fillText(String(idx + 1), 492, 182 + idx * 28);
          ctx.fillStyle = '#e5e7eb';
          ctx.fillText(line || ' ', 548, 182 + idx * 28);
        });

        if (pct < 1) {
          rafRef.current = requestAnimationFrame(drawFrame);
        } else {
          recorder.stop();
        }
      };

      recorder.start(200);
      rafRef.current = requestAnimationFrame(drawFrame);

      const url = await new Promise((resolve, reject) => {
        recorder.onerror = reject;
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          resolve(URL.createObjectURL(blob));
        };
      });
      setVideoUrl(url);
    } catch (e) {
      console.error(e);
      setError('Could not generate video in this browser. Try Chrome/Edge.');
    } finally {
      setIsGenerating(false);
    }
  };

  const resetVideo = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl('');
    setProgress(0);
    setPreviewCode('');
    setPreviewLine('');
    setError('');
  };

  const stopGeneration = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setIsGenerating(false);
  };

  if (!isOpen) return null;

  return (
    <div className="video-modal-overlay">
      <div className="video-modal-content ai-presentation-mode">
        <div className="video-modal-header">
          <div className="video-header-left">
            <div className={`ai-recording-indicator ${isGenerating ? 'active' : ''}`}></div>
            <h3>Real Lesson Video Generator</h3>
          </div>
          <button className="btn-close-video" onClick={onClose} title="Close Video">
            <X size={20} />
          </button>
        </div>

        <div className="video-modal-body presentation-body layout-split">
          <div className="presentation-stage split-left">
            <h2 className="presentation-topic">{topic || 'AI Lesson'}</h2>
            <p className="caption-text">Generate a real `.webm` lesson video with a teacher scene and live code typing timeline.</p>
            <div className="presentation-controls">
              <button className="ctrl-btn play" onClick={generateVideo} disabled={isGenerating}>
                <Video size={20} />
                {isGenerating ? 'Generating...' : 'Generate Real Video'}
              </button>
              <button className="ctrl-btn" onClick={resetVideo} disabled={isGenerating}>
                <RefreshCcw size={16} /> Reset
              </button>
              <button className="ctrl-btn" onClick={stopGeneration} disabled={!isGenerating}>
                Stop
              </button>
              {videoUrl && (
                <a className="ctrl-btn" href={videoUrl} download={`lesson-${Date.now()}.webm`}>
                  <Download size={16} /> Download
                </a>
              )}
            </div>
            {isGenerating && (
              <div className="video-progress-wrap">
                <div className="video-progress-bar">
                  <div className="video-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span>{progress}%</span>
              </div>
            )}
            {error && <div className="video-error">{error}</div>}
          </div>

          <div className="presentation-screen split-right vscode-theme">
            {videoUrl ? (
              <video className="real-video-player" src={videoUrl} controls autoPlay />
            ) : (
              <div className="vscode-window">
                <div className="vscode-titlebar">
                  <div className="vscode-title">lesson.ts - Preview</div>
                </div>
                <div className="vscode-editor-content">
                  <div className="vscode-line-numbers">
                    {Array.from({ length: Math.max(18, previewCode.split('\n').length + 2) }).map((_, i) => (
                      <div key={i} className="line-num">{i + 1}</div>
                    ))}
                  </div>
                  <div className="vscode-code-area">
                    <pre><code>{previewCode || '// Click "Generate Real Video" to start rendering...'}</code></pre>
                    {previewLine && <div className="live-caption">{previewLine}</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoModal;
