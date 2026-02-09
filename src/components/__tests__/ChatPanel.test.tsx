import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatPanel } from '../ChatPanel';
import type { ChatMessage } from '../../types';

/**
 * Unit tests for ChatPanel component
 * 
 * Requirements:
 * - 6.1: THE Chat_Panel SHALL display a scrollable message history
 * - 6.2: WHEN a user submits a message, THE Chat_Panel SHALL send it to the Proctor and display it in the history
 * - 6.3: WHEN the Proctor responds, THE Chat_Panel SHALL render the response with Markdown formatting
 * - 6.4: THE Chat_Panel SHALL auto-scroll to the latest message, but preserve scroll position if user has scrolled up
 * - 6.5: THE Chat_Panel SHALL visually distinguish between user messages and Proctor messages
 */

// Helper to create test messages
const createMessage = (
  id: string,
  role: 'user' | 'proctor',
  content: string,
  timestamp = Date.now()
): ChatMessage => ({
  id,
  role,
  content,
  timestamp,
});

describe('ChatPanel Component', () => {
  const defaultProps = {
    messages: [] as ChatMessage[],
    onSendMessage: vi.fn(),
    isDisabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the chat panel container', () => {
      render(<ChatPanel {...defaultProps} />);
      expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    });

    it('renders the header with title', () => {
      render(<ChatPanel {...defaultProps} />);
      expect(screen.getByText('Chat with Proctor')).toBeInTheDocument();
    });

    it('renders the messages container', () => {
      render(<ChatPanel {...defaultProps} />);
      expect(screen.getByTestId('messages-container')).toBeInTheDocument();
    });

    it('renders the input field', () => {
      render(<ChatPanel {...defaultProps} />);
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });

    it('renders the send button', () => {
      render(<ChatPanel {...defaultProps} />);
      expect(screen.getByTestId('send-button')).toBeInTheDocument();
    });

    it('displays empty state when no messages', () => {
      render(<ChatPanel {...defaultProps} />);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText(/Start a conversation/)).toBeInTheDocument();
    });
  });

  describe('message display (Requirement 6.1)', () => {
    it('displays messages in the chat history', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'proctor', 'Hi there!'),
      ];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      expect(screen.getByTestId('message-1')).toBeInTheDocument();
      expect(screen.getByTestId('message-2')).toBeInTheDocument();
    });

    it('hides empty state when messages exist', () => {
      const messages = [createMessage('1', 'user', 'Hello')];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    });

    it('displays multiple messages in order', () => {
      const messages = [
        createMessage('1', 'user', 'First message'),
        createMessage('2', 'proctor', 'Second message'),
        createMessage('3', 'user', 'Third message'),
      ];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      // Use exact match for message wrapper elements (not content elements)
      expect(screen.getByTestId('message-1')).toBeInTheDocument();
      expect(screen.getByTestId('message-2')).toBeInTheDocument();
      expect(screen.getByTestId('message-3')).toBeInTheDocument();
    });
  });

  describe('visual distinction (Requirement 6.5)', () => {
    it('marks user messages with role attribute', () => {
      const messages = [createMessage('1', 'user', 'User message')];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      const message = screen.getByTestId('message-1');
      expect(message).toHaveAttribute('data-role', 'user');
    });

    it('marks proctor messages with role attribute', () => {
      const messages = [createMessage('1', 'proctor', 'Proctor message')];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      const message = screen.getByTestId('message-1');
      expect(message).toHaveAttribute('data-role', 'proctor');
    });

    it('displays "You" label for user messages', () => {
      const messages = [createMessage('1', 'user', 'Hello')];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      expect(screen.getByText('You')).toBeInTheDocument();
    });

    it('displays "Proctor" label for proctor messages', () => {
      const messages = [createMessage('1', 'proctor', 'Hello')];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      expect(screen.getByText('Proctor')).toBeInTheDocument();
    });
  });

  describe('markdown rendering (Requirement 6.3)', () => {
    it('renders bold text in proctor messages', () => {
      const messages = [createMessage('1', 'proctor', 'This is **bold** text')];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      const messageContent = screen.getByTestId('message-content-1');
      expect(messageContent.querySelector('strong')).toBeInTheDocument();
    });

    it('renders bullet lists in proctor messages', () => {
      const messages = [createMessage('1', 'proctor', '- Item 1\n- Item 2\n- Item 3')];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      const messageContent = screen.getByTestId('message-content-1');
      expect(messageContent.querySelector('ul')).toBeInTheDocument();
      expect(messageContent.querySelectorAll('li')).toHaveLength(3);
    });

    it('renders inline code in proctor messages', () => {
      const messages = [createMessage('1', 'proctor', 'Use the `map()` function')];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      const messageContent = screen.getByTestId('message-content-1');
      expect(messageContent.querySelector('code')).toBeInTheDocument();
    });

    it('renders code blocks in proctor messages', () => {
      const messages = [createMessage('1', 'proctor', '```\nfunction test() {\n  return 1;\n}\n```')];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      const messageContent = screen.getByTestId('message-content-1');
      expect(messageContent.querySelector('pre')).toBeInTheDocument();
    });

    it('does not render markdown in user messages', () => {
      const messages = [createMessage('1', 'user', 'This is **not bold**')];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      const messageContent = screen.getByTestId('message-content-1');
      expect(messageContent.querySelector('strong')).not.toBeInTheDocument();
      expect(messageContent.textContent).toContain('**not bold**');
    });
  });

  describe('sending messages (Requirement 6.2)', () => {
    it('calls onSendMessage when send button is clicked', () => {
      const onSendMessage = vi.fn();
      render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);
      
      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Hello proctor' } });
      fireEvent.click(screen.getByTestId('send-button'));
      
      expect(onSendMessage).toHaveBeenCalledWith('Hello proctor');
    });

    it('calls onSendMessage when Enter is pressed', () => {
      const onSendMessage = vi.fn();
      render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);
      
      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Hello proctor' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      
      expect(onSendMessage).toHaveBeenCalledWith('Hello proctor');
    });

    it('does not send on Shift+Enter (allows new line)', () => {
      const onSendMessage = vi.fn();
      render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);
      
      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Hello proctor' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
      
      expect(onSendMessage).not.toHaveBeenCalled();
    });

    it('clears input after sending', () => {
      const onSendMessage = vi.fn();
      render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);
      
      const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: 'Hello proctor' } });
      fireEvent.click(screen.getByTestId('send-button'));
      
      expect(input.value).toBe('');
    });

    it('trims whitespace from message', () => {
      const onSendMessage = vi.fn();
      render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);
      
      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: '  Hello proctor  ' } });
      fireEvent.click(screen.getByTestId('send-button'));
      
      expect(onSendMessage).toHaveBeenCalledWith('Hello proctor');
    });

    it('does not send empty messages', () => {
      const onSendMessage = vi.fn();
      render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);
      
      fireEvent.click(screen.getByTestId('send-button'));
      
      expect(onSendMessage).not.toHaveBeenCalled();
    });

    it('does not send whitespace-only messages', () => {
      const onSendMessage = vi.fn();
      render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);
      
      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.click(screen.getByTestId('send-button'));
      
      expect(onSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('disables input when isDisabled is true', () => {
      render(<ChatPanel {...defaultProps} isDisabled={true} />);
      
      expect(screen.getByTestId('chat-input')).toBeDisabled();
    });

    it('disables send button when isDisabled is true', () => {
      render(<ChatPanel {...defaultProps} isDisabled={true} />);
      
      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Hello' } });
      
      expect(screen.getByTestId('send-button')).toBeDisabled();
    });

    it('does not send message when disabled', () => {
      const onSendMessage = vi.fn();
      render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} isDisabled={true} />);
      
      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.click(screen.getByTestId('send-button'));
      
      expect(onSendMessage).not.toHaveBeenCalled();
    });

    it('shows disabled placeholder text', () => {
      render(<ChatPanel {...defaultProps} isDisabled={true} />);
      
      expect(screen.getByTestId('chat-input')).toHaveAttribute('placeholder', 'Chat disabled');
    });

    it('send button is disabled when input is empty', () => {
      render(<ChatPanel {...defaultProps} />);
      
      expect(screen.getByTestId('send-button')).toBeDisabled();
    });

    it('send button is enabled when input has content', () => {
      render(<ChatPanel {...defaultProps} />);
      
      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Hello' } });
      
      expect(screen.getByTestId('send-button')).not.toBeDisabled();
    });
  });

  describe('auto-scroll behavior (Requirement 6.4)', () => {
    // Mock scrollIntoView
    const mockScrollIntoView = vi.fn();
    
    beforeEach(() => {
      mockScrollIntoView.mockClear();
      Element.prototype.scrollIntoView = mockScrollIntoView;
    });

    it('scrolls to bottom when new message arrives and user is at bottom', async () => {
      const messages = [createMessage('1', 'user', 'Hello')];
      const { rerender } = render(<ChatPanel {...defaultProps} messages={messages} />);
      
      // Add a new message
      const newMessages = [
        ...messages,
        createMessage('2', 'proctor', 'Hi there!'),
      ];
      rerender(<ChatPanel {...defaultProps} messages={newMessages} />);
      
      await waitFor(() => {
        expect(mockScrollIntoView).toHaveBeenCalled();
      });
    });

    it('messages container has overflow-y auto for scrolling', () => {
      const messages = [
        createMessage('1', 'user', 'Message 1'),
        createMessage('2', 'proctor', 'Message 2'),
      ];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      const container = screen.getByTestId('messages-container');
      expect(container).toHaveStyle({ overflowY: 'auto' });
    });
  });

  describe('accessibility', () => {
    it('input has aria-label', () => {
      render(<ChatPanel {...defaultProps} />);
      
      expect(screen.getByTestId('chat-input')).toHaveAttribute(
        'aria-label',
        'Chat message input'
      );
    });

    it('send button has aria-label', () => {
      render(<ChatPanel {...defaultProps} />);
      
      expect(screen.getByTestId('send-button')).toHaveAttribute(
        'aria-label',
        'Send message'
      );
    });

    it('input has placeholder text', () => {
      render(<ChatPanel {...defaultProps} />);
      
      expect(screen.getByTestId('chat-input')).toHaveAttribute(
        'placeholder',
        'Type your message... (Enter to send, Shift+Enter for new line)'
      );
    });
  });

  describe('input behavior', () => {
    it('updates input value on change', () => {
      render(<ChatPanel {...defaultProps} />);
      
      const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: 'Test message' } });
      
      expect(input.value).toBe('Test message');
    });

    it('handles multiline input', () => {
      render(<ChatPanel {...defaultProps} />);
      
      const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: 'Line 1\nLine 2' } });
      
      expect(input.value).toBe('Line 1\nLine 2');
    });
  });
});
