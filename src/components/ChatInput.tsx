import React, { useRef, useState } from 'react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isDisabled?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  input: {
    flex: 1,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(96, 255, 160, 0.18)',
    borderRadius: '12px',
    background: 'rgba(0, 0, 0, 0.20)',
    color: 'rgba(182, 255, 182, 0.92)',
    padding: '10px 12px',
    fontFamily: 'var(--font)',
    fontSize: '14px',
    outline: 'none',
    boxShadow: '0 0 18px rgba(0, 255, 120, 0.05)',
    resize: 'none' as const,
    minHeight: '44px',
    maxHeight: '120px',
  },
  inputFocused: {
    borderColor: 'rgba(59, 240, 255, 0.30)',
    boxShadow: '0 0 0 2px rgba(59, 240, 255, 0.10) inset, 0 0 24px rgba(59, 240, 255, 0.06)',
  },
  inputDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
};

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isDisabled,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);

    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  const handleSend = () => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue || isDisabled) return;

    onSendMessage(trimmedValue);
    setInputValue('');

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = inputValue.trim().length > 0 && !isDisabled;

  return (
    <div className="chatInput">
      <textarea
        ref={inputRef}
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsInputFocused(true)}
        onBlur={() => setIsInputFocused(false)}
        placeholder={isDisabled ? 'Chat disabled' : 'Type your message...'}
        disabled={isDisabled}
        style={{
          ...styles.input,
          ...(isInputFocused && !isDisabled ? styles.inputFocused : {}),
          ...(isDisabled ? styles.inputDisabled : {}),
        }}
        className="field"
        data-testid="chat-input"
        aria-label="Chat message input"
        rows={1}
      />
      <button
        onClick={handleSend}
        disabled={!canSend}
        onMouseEnter={() => setIsButtonHovered(true)}
        onMouseLeave={() => setIsButtonHovered(false)}
        className={`btn ${canSend ? 'primary' : ''}`}
        style={{
          ...(isButtonHovered && canSend ? { transform: 'translateY(-1px)' } : {}),
        }}
        data-testid="send-button"
        aria-label="Send message"
      >
        Send
      </button>
    </div>
  );
};

export default ChatInput;
