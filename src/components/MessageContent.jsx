import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const MessageContent = ({ text, isAI }) => {
  // Function to parse message and extract code blocks
  const parseMessage = (message) => {
    const parts = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const inlineCodeRegex = /`([^`]+)`/g;
    
    let lastIndex = 0;
    let match;

    // Find all code blocks
    const codeBlocks = [];
    while ((match = codeBlockRegex.exec(message)) !== null) {
      codeBlocks.push({
        start: match.index,
        end: match.index + match[0].length,
        language: match[1] || 'javascript',
        code: match[2].trim()
      });
    }

    // If no code blocks, check for inline code
    if (codeBlocks.length === 0) {
      const textWithInlineCode = message.split(inlineCodeRegex);
      return textWithInlineCode.map((part, index) => {
        if (index % 2 === 1) {
          // This is inline code
          return (
            <code key={index} style={{
              background: isAI ? '#0a0a0a' : '#1a1a1a',
              padding: '2px 6px',
              borderRadius: '0px',
              fontFamily: 'Roboto Mono, monospace',
              fontSize: '13px',
              border: '1px solid ' + (isAI ? '#333' : '#444')
            }}>
              {part}
            </code>
          );
        }
        return <span key={index}>{part}</span>;
      });
    }

    // Process message with code blocks
    codeBlocks.forEach((block, index) => {
      // Add text before code block
      if (block.start > lastIndex) {
        const textBefore = message.substring(lastIndex, block.start);
        parts.push(
          <p key={`text-${index}`} style={{ margin: '0 0 12px 0' }}>
            {textBefore.trim()}
          </p>
        );
      }

      // Add code block
      parts.push(
        <div key={`code-${index}`} style={{ margin: '12px 0' }}>
          <div style={{
            background: isAI ? '#0a0a0a' : '#1a1a1a',
            border: '2px solid ' + (isAI ? '#333' : '#444'),
            padding: '4px 12px',
            fontSize: '11px',
            fontFamily: 'Roboto Mono, monospace',
            textTransform: 'uppercase',
            color: '#888'
          }}>
            {block.language}
          </div>
          <SyntaxHighlighter
            language={block.language}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              background: isAI ? '#0a0a0a' : '#1a1a1a',
              border: '2px solid ' + (isAI ? '#333' : '#444'),
              borderTop: 'none',
              padding: '16px',
              fontSize: '13px',
              fontFamily: 'Roboto Mono, monospace'
            }}
          >
            {block.code}
          </SyntaxHighlighter>
        </div>
      );

      lastIndex = block.end;
    });

    // Add remaining text
    if (lastIndex < message.length) {
      const textAfter = message.substring(lastIndex);
      parts.push(
        <p key="text-end" style={{ margin: '12px 0 0 0' }}>
          {textAfter.trim()}
        </p>
      );
    }

    return parts;
  };

  return <div>{parseMessage(text)}</div>;
};

export default MessageContent;
