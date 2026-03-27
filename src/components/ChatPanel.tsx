import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatPanelProps, ChatMessage } from '../types';

/**
 * ChatPanel component - Right panel with proctor chat
 * 
 * Requirements:
 * - 6.1: THE Chat_Panel SHALL display a scrollable message history
 * - 6.2: WHEN a user submits a message, THE Chat_Panel SHALL send it to the Proctor and display it in the history
 * - 6.3: WHEN the Proctor responds, THE Chat_Panel SHALL render the response with Markdown formatting (bold, bullets, code blocks)
 * - 6.4: THE Chat_Panel SHALL auto-scroll to the latest message, but preserve scroll position if user has scrolled up to read history
 * - 6.5: THE Chat_Panel SHALL visually distinguish between user messages and Proctor messages
 */

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  messagesContainer: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(182, 255, 182, 0.45)',
    padding: '32px',
    textAlign: 'center' as const,
    fontSize: '12px',
  },
};

// CSS for markdown content inside proctor messages
const markdownStyles = `
  .proctor-markdown p {
    margin: 0 0 8px 0;
  }
  .proctor-markdown p:last-child {
    margin-bottom: 0;
  }
  .proctor-markdown ul, .proctor-markdown ol {
    margin: 8px 0;
    paddingLeft: 20px;
  }
  .proctor-markdown li {
    margin: 4px 0;
  }
  .proctor-markdown code {
    background-color: rgba(0, 0, 0, 0.30);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: "Fira Code", "Consolas", "Monaco", monospace;
    font-size: 0.85em;
    color: var(--cool);
  }
  .proctor-markdown pre {
    background-color: rgba(0, 0, 0, 0.30);
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 8px 0;
    border: 1px solid rgba(96, 255, 160, 0.14);
  }
  .proctor-markdown pre code {
    background-color: transparent;
    padding: 0;
  }
  .proctor-markdown strong {
    color: var(--cool);
    font-weight: 600;
  }
  .proctor-markdown em {
    color: var(--hot);
    font-style: normal;
  }
  .proctor-markdown blockquote {
    border-left: 3px solid var(--cool);
    margin: 8px 0;
    padding-left: 12px;
    color: rgba(182, 255, 182, 0.75);
  }
`;

/**
 * Individual message component
 */
interface MessageProps {
  message: ChatMessage;
}

const Message: React.FC<MessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  
  return (
    <div
      className={`msg ${isUser ? 'user' : 'proctor'}`}
      data-testid={`message-${message.id}`}
      data-role={message.role}
    >
      <div className="who">
        {isUser ? 'You' : 'Proctor'}
      </div>
      <div className="text">
        {isUser ? (
          // User messages are plain text
          <span>{message.content}</span>
        ) : (
          // Proctor messages support markdown
          <div className="proctor-markdown">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Threshold in pixels for considering user "at bottom" of scroll
 */
const SCROLL_THRESHOLD = 50;

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
}) => {
  const [isAtBottom, setIsAtBottom] = useState(true);
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  /**
   * Check if user is scrolled to bottom (within threshold)
   */
  const checkIfAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight <= SCROLL_THRESHOLD;
  }, []);

  /**
   * Handle scroll events to track if user is at bottom
   * Requirement 6.4: preserve scroll position if user has scrolled up
   */
  const handleScroll = useCallback(() => {
    setIsAtBottom(checkIfAtBottom());
  }, [checkIfAtBottom]);

  /**
   * Scroll to bottom of messages
   */
  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, []);

  /**
   * Auto-scroll when new messages arrive (if user is at bottom)
   * Requirement 6.4: auto-scroll to latest message, but preserve position if scrolled up
   */
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages, isAtBottom, scrollToBottom]);

  return (
    <div style={styles.container} data-testid="chat-panel">
      {/* Inject markdown styles */}
      <style>{markdownStyles}</style>

      {/* Messages Container - Requirement 6.1: scrollable message history */}
      <div
        ref={messagesContainerRef}
        style={styles.messagesContainer}
        onScroll={handleScroll}
        data-testid="messages-container"
      >
        {messages.length === 0 ? (
          <div style={styles.emptyState} data-testid="empty-state">
            Start a conversation with the proctor
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default ChatPanel;
