import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatPanel } from '../ChatPanel';
import type { ChatMessage } from '../../types';

const messages: ChatMessage[] = [
  {
    id: 'user-1',
    role: 'user',
    content: 'Can you clarify the input?',
    timestamp: 1,
  },
  {
    id: 'proctor-1',
    role: 'proctor',
    content: '**Sure.** Use a hash set.\n\n- Track seen digits\n- Check rows, cols, and boxes\n\n`set()` is fine here.',
    timestamp: 2,
  },
];

describe('ChatPanel', () => {
  it('shows an empty-state message when there is no chat history', () => {
    render(<ChatPanel messages={[]} />);

    expect(screen.getByTestId('empty-state')).toHaveTextContent(/start a conversation/i);
  });

  it('renders user and proctor messages in order', () => {
    render(<ChatPanel messages={messages} />);

    const renderedMessages = screen.getAllByTestId(/message-/);
    expect(renderedMessages).toHaveLength(2);
    expect(renderedMessages[0]).toHaveAttribute('data-role', 'user');
    expect(renderedMessages[1]).toHaveAttribute('data-role', 'proctor');
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Proctor')).toBeInTheDocument();
  });

  it('renders markdown formatting for proctor messages only', () => {
    render(<ChatPanel messages={messages} />);

    expect(screen.getByText('Sure.')).toContainHTML('strong');
    expect(screen.getByText('Track seen digits').closest('li')).not.toBeNull();
    expect(screen.getByText('set()').tagName.toLowerCase()).toBe('code');
    expect(screen.getByText('Can you clarify the input?').tagName.toLowerCase()).toBe('span');
  });

  it('exposes a scrollable messages container', () => {
    render(<ChatPanel messages={messages} />);

    expect(screen.getByTestId('messages-container')).toBeInTheDocument();
  });
});
