import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '../useChat';
import type { ProctorResponseCallback } from '../useChat';

describe('useChat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should initialize with empty messages array', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.messages).toEqual([]);
    });

    it('should initialize with isLoading as false', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('should add user message to history (Requirement 6.2)', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage('Hello, proctor!');
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[0].content).toBe('Hello, proctor!');
    });

    it('should generate unique message ID', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage('First message');
      });

      expect(result.current.messages[0].id).toMatch(/^msg-[a-z0-9]+-[a-z0-9]+$/);
    });

    it('should set timestamp on message', async () => {
      const { result } = renderHook(() => useChat());
      const expectedTime = Date.now();

      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      expect(result.current.messages[0].timestamp).toBe(expectedTime);
    });

    it('should trim whitespace from message content', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage('  Hello with spaces  ');
      });

      expect(result.current.messages[0].content).toBe('Hello with spaces');
    });

    it('should not add empty messages', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage('');
      });

      expect(result.current.messages).toHaveLength(0);
    });

    it('should not add whitespace-only messages', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage('   ');
      });

      expect(result.current.messages).toHaveLength(0);
    });

    it('should preserve message order', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage('First');
      });

      vi.advanceTimersByTime(100);

      await act(async () => {
        await result.current.sendMessage('Second');
      });

      vi.advanceTimersByTime(100);

      await act(async () => {
        await result.current.sendMessage('Third');
      });

      expect(result.current.messages).toHaveLength(3);
      expect(result.current.messages[0].content).toBe('First');
      expect(result.current.messages[1].content).toBe('Second');
      expect(result.current.messages[2].content).toBe('Third');
    });

    it('should generate different IDs for different messages', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage('Message 1');
      });

      vi.advanceTimersByTime(100);

      await act(async () => {
        await result.current.sendMessage('Message 2');
      });

      const ids = result.current.messages.map(m => m.id);
      expect(ids[0]).not.toBe(ids[1]);
    });
  });

  describe('sendMessage with proctor callback', () => {
    it('should call proctor callback and add response (Requirement 6.2)', async () => {
      const mockProctorResponse: ProctorResponseCallback = vi.fn().mockResolvedValue('Hello! How can I help?');

      const { result } = renderHook(() => useChat({ onGetProctorResponse: mockProctorResponse }));

      await act(async () => {
        await result.current.sendMessage('Hello!');
      });

      expect(mockProctorResponse).toHaveBeenCalledWith('Hello!');
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[0].content).toBe('Hello!');
      expect(result.current.messages[1].role).toBe('proctor');
      expect(result.current.messages[1].content).toBe('Hello! How can I help?');
    });

    it('should set isLoading to true while waiting for proctor response', async () => {
      let resolveProctor: (value: string) => void;
      const mockProctorResponse: ProctorResponseCallback = vi.fn().mockImplementation(() => {
        return new Promise<string>((resolve) => {
          resolveProctor = resolve;
        });
      });

      const { result } = renderHook(() => useChat({ onGetProctorResponse: mockProctorResponse }));

      // Start sending message (don't await)
      let sendPromise: Promise<void>;
      act(() => {
        sendPromise = result.current.sendMessage('Hello!');
      });

      // Check loading state is true
      expect(result.current.isLoading).toBe(true);

      // Resolve the proctor response
      await act(async () => {
        resolveProctor!('Response');
        await sendPromise;
      });

      // Check loading state is false
      expect(result.current.isLoading).toBe(false);
    });

    it('should set isLoading to false after proctor response', async () => {
      const mockProctorResponse: ProctorResponseCallback = vi.fn().mockResolvedValue('Response');

      const { result } = renderHook(() => useChat({ onGetProctorResponse: mockProctorResponse }));

      await act(async () => {
        await result.current.sendMessage('Hello!');
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should handle proctor callback error gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockProctorResponse: ProctorResponseCallback = vi.fn().mockRejectedValue(new Error('API Error'));

      const { result } = renderHook(() => useChat({ onGetProctorResponse: mockProctorResponse }));

      await act(async () => {
        await result.current.sendMessage('Hello!');
      });

      // User message should still be in history
      expect(result.current.messages.length).toBeGreaterThanOrEqual(1);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[0].content).toBe('Hello!');

      // Error message from proctor should be added
      expect(result.current.messages[1].role).toBe('proctor');
      expect(result.current.messages[1].content).toContain('error');

      // Loading should be false
      expect(result.current.isLoading).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it('should pass trimmed content to proctor callback', async () => {
      const mockProctorResponse: ProctorResponseCallback = vi.fn().mockResolvedValue('Response');

      const { result } = renderHook(() => useChat({ onGetProctorResponse: mockProctorResponse }));

      await act(async () => {
        await result.current.sendMessage('  Hello with spaces  ');
      });

      expect(mockProctorResponse).toHaveBeenCalledWith('Hello with spaces');
    });

    it('should not call proctor callback for empty messages', async () => {
      const mockProctorResponse: ProctorResponseCallback = vi.fn().mockResolvedValue('Response');

      const { result } = renderHook(() => useChat({ onGetProctorResponse: mockProctorResponse }));

      await act(async () => {
        await result.current.sendMessage('');
      });

      expect(mockProctorResponse).not.toHaveBeenCalled();
    });
  });

  describe('clearMessages', () => {
    it('should clear all messages', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage('Message 1');
      });

      await act(async () => {
        await result.current.sendMessage('Message 2');
      });

      expect(result.current.messages).toHaveLength(2);

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toEqual([]);
    });

    it('should reset isLoading to false', async () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should work when messages array is already empty', () => {
      const { result } = renderHook(() => useChat());

      expect(result.current.messages).toEqual([]);

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toEqual([]);
    });
  });

  describe('message ID uniqueness', () => {
    it('should generate unique IDs across multiple messages', async () => {
      const mockProctorResponse: ProctorResponseCallback = vi.fn().mockResolvedValue('Response');
      const { result } = renderHook(() => useChat({ onGetProctorResponse: mockProctorResponse }));
      const messageIds: string[] = [];

      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await result.current.sendMessage(`Message ${i}`);
        });
        vi.advanceTimersByTime(100);
      }

      // Collect all message IDs (user + proctor messages)
      result.current.messages.forEach(m => messageIds.push(m.id));

      const uniqueIds = new Set(messageIds);
      expect(uniqueIds.size).toBe(messageIds.length);
    });
  });

  describe('Requirements validation', () => {
    it('Requirement 6.2: User message is sent to Proctor and displayed in history', async () => {
      const mockProctorResponse: ProctorResponseCallback = vi.fn().mockResolvedValue('Proctor response');

      const { result } = renderHook(() => useChat({ onGetProctorResponse: mockProctorResponse }));

      await act(async () => {
        await result.current.sendMessage('User question');
      });

      // Verify user message is in history
      expect(result.current.messages.some(m => m.role === 'user' && m.content === 'User question')).toBe(true);

      // Verify proctor was called
      expect(mockProctorResponse).toHaveBeenCalledWith('User question');

      // Verify proctor response is in history
      expect(result.current.messages.some(m => m.role === 'proctor' && m.content === 'Proctor response')).toBe(true);
    });

    it('Requirement 6.2: Message content is exact (not modified)', async () => {
      const { result } = renderHook(() => useChat());
      const exactContent = 'What is the time complexity of O(n²)?';

      await act(async () => {
        await result.current.sendMessage(exactContent);
      });

      expect(result.current.messages[0].content).toBe(exactContent);
    });
  });

  describe('edge cases', () => {
    it('should handle very long message content', async () => {
      const { result } = renderHook(() => useChat());
      const longMessage = 'x'.repeat(10000);

      await act(async () => {
        await result.current.sendMessage(longMessage);
      });

      expect(result.current.messages[0].content).toBe(longMessage);
      expect(result.current.messages[0].content.length).toBe(10000);
    });

    it('should handle special characters in messages', async () => {
      const { result } = renderHook(() => useChat());
      const specialMessage = 'What about O(n²) complexity? 🤔 日本語';

      await act(async () => {
        await result.current.sendMessage(specialMessage);
      });

      expect(result.current.messages[0].content).toBe(specialMessage);
    });

    it('should handle newlines in messages', async () => {
      const { result } = renderHook(() => useChat());
      const multilineMessage = 'Line 1\nLine 2\nLine 3';

      await act(async () => {
        await result.current.sendMessage(multilineMessage);
      });

      expect(result.current.messages[0].content).toBe(multilineMessage);
    });

    it('should handle code blocks in messages', async () => {
      const { result } = renderHook(() => useChat());
      const codeMessage = '```javascript\nfunction test() {\n  return 42;\n}\n```';

      await act(async () => {
        await result.current.sendMessage(codeMessage);
      });

      expect(result.current.messages[0].content).toBe(codeMessage);
    });

    it('should handle rapid sequential messages', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await Promise.all([
          result.current.sendMessage('Message 1'),
          result.current.sendMessage('Message 2'),
          result.current.sendMessage('Message 3'),
        ]);
      });

      expect(result.current.messages.length).toBe(3);
    });
  });

  describe('callback options', () => {
    it('should work without proctor callback (user messages only)', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage('Hello!');
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle changing proctor callback', async () => {
      const callback1: ProctorResponseCallback = vi.fn().mockResolvedValue('Response 1');
      const callback2: ProctorResponseCallback = vi.fn().mockResolvedValue('Response 2');

      const { result, rerender } = renderHook(
        ({ callback }) => useChat({ onGetProctorResponse: callback }),
        { initialProps: { callback: callback1 } }
      );

      await act(async () => {
        await result.current.sendMessage('First');
      });

      expect(callback1).toHaveBeenCalled();
      expect(result.current.messages[1].content).toBe('Response 1');

      // Change callback
      rerender({ callback: callback2 });

      vi.advanceTimersByTime(100);

      await act(async () => {
        await result.current.sendMessage('Second');
      });

      expect(callback2).toHaveBeenCalled();
      expect(result.current.messages[3].content).toBe('Response 2');
    });
  });
});
