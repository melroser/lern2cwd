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
    backgroundColor: '#1e1e2e',
    color: '#cdd6f4',
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid #45475a',
    backgroundColor: '#181825',
  },
  headerTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    color: '#89b4fa',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  messageWrapper: {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '85%',
  },
  userMessageWrapper: {
    alignSelf: 'flex-end',
  },
  proctorMessageWrapper: {
    alignSelf: 'flex-start',
  },
  messageLabel: {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
    letterSpacing: '0.5px',
  },
  userLabel: {
    color: '#a6e3a1',
    textAlign: 'right' as const,
  },
  proctorLabel: {
    color: '#89b4fa',
  },
  messageBubble: {
    padding: '12px 16px',
    borderRadius: '12px',
    fontSize: '0.9rem',
    lineHeight: 1.6,
    wordBreak: 'break-word' as const,
  },
  userMessage: {
    backgroundColor: '#313244',
    color: '#cdd6f4',
    borderBottomRightRadius: '4px',
  },
  proctorMessage: {
    backgroundColor: '#45475a',
    color: '#cdd6f4',
    borderBottomLeftRadius: '4px',
  },
  inputContainer: {
    padding: '16px',
    borderTop: '1px solid #45475a',
    backgroundColor: '#181825',
    display: 'flex',
    gap: '12px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '0.9rem',
    backgroundColor: '#313244',
    color: '#cdd6f4',
    border: '1px solid #45475a',
    borderRadius: '8px',
    outline: 'none',
    resize: 'none' as const,
    fontFamily: 'inherit',
    minHeight: '44px',
    maxHeight: '120px',
  },
  inputFocused: {
    borderColor: '#89b4fa',
  },
  inputDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  sendButton: {
    padding: '12px 20px',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#1e1e2e',
    backgroundColor: '#89b4fa',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    alignSelf: 'flex-end',
  },
  sendButtonDisabled: {
    backgroundColor: '#585b70',
    color: '#9399b2',
    cursor: 'not-allowed',
  },
  sendButtonHover: {
    backgroundColor: '#b4befe',
    transform: 'translateY(-1px)',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6c7086',
    fontStyle: 'italic',
    padding: '32px',
    textAlign: 'center' as const,
  },
  // Markdown styling
  markdownContent: {
    margin: 0,
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
    background-color: #313244;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: "Fira Code", "Consolas", "Monaco", monospace;
    font-size: 0.85em;
  }
  .proctor-markdown pre {
    background-color: #313244;
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 8px 0;
  }
  .proctor-markdown pre code {
    background-color: transparent;
    padding: 0;
  }
  .proctor-markdown strong {
    color: #f9e2af;
    font-weight: 600;
  }
  .proctor-markdown em {
    color: #cba6f7;
  }
  .proctor-markdown blockquote {
    border-left: 3px solid #89b4fa;
    margin: 8px 0;
    padding-left: 12px;
    color: #a6adc8;
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
      style={{
        ...styles.messageWrapper,
        ...(isUser ? styles.userMessageWrapper : styles.proctorMessageWrapper),
      }}
      data-testid={`message-${message.id}`}
      data-role={message.role}
    >
      <span
        style={{
          ...styles.messageLabel,
          ...(isUser ? styles.userLabel : styles.proctorLabel),
        }}
      >
        {isUser ? 'You' : 'Proctor'}
      </span>
      <div
        style={{
          ...styles.messageBubble,
          ...(isUser ? styles.userMessage : styles.proctorMessage),
        }}
        data-testid={`message-content-${message.id}`}
      >
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
  onSendMessage,
  isDisabled,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
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

  /**
   * Handle input change with auto-resize
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  /**
   * Handle sending a message
   * Requirement 6.2: send message to Proctor and display in history
   */
  const handleSend = () => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue || isDisabled) return;
    
    onSendMessage(trimmedValue);
    setInputValue('');
    
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    
    // Ensure we scroll to bottom after sending
    setIsAtBottom(true);
  };

  /**
   * Handle Enter key to send message (Shift+Enter for new line)
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = inputValue.trim().length > 0 && !isDisabled;

  return (
    <div style={styles.container} data-testid="chat-panel">
      {/* Inject markdown styles */}
      <style>{markdownStyles}</style>
      
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.headerTitle}>Chat with Proctor</h2>
      </div>

      {/* Messages Container - Requirement 6.1: scrollable message history */}
      <div
        ref={messagesContainerRef}
        style={styles.messagesContainer}
        onScroll={handleScroll}
        data-testid="messages-container"
      >
        {messages.length === 0 ? (
          <div style={styles.emptyState} data-testid="empty-state">
            Start a conversation with the proctor. Ask questions about the problem or your approach.
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
            {/* Invisible element to scroll to */}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Container */}
      <div style={styles.inputContainer}>
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
          placeholder={isDisabled ? 'Chat disabled' : 'Type your message... (Enter to send, Shift+Enter for new line)'}
          disabled={isDisabled}
          style={{
            ...styles.input,
            ...(isInputFocused && !isDisabled ? styles.inputFocused : {}),
            ...(isDisabled ? styles.inputDisabled : {}),
          }}
          data-testid="chat-input"
          aria-label="Chat message input"
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          onMouseEnter={() => setIsButtonHovered(true)}
          onMouseLeave={() => setIsButtonHovered(false)}
          style={{
            ...styles.sendButton,
            ...(!canSend ? styles.sendButtonDisabled : {}),
            ...(canSend && isButtonHovered ? styles.sendButtonHover : {}),
          }}
          data-testid="send-button"
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
