import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSession } from '../useSession';
import type { Problem } from '../../types';

// Mock problem for testing
const mockProblem: Problem = {
  id: 'test-problem',
  language: 'javascript',
  title: 'Test Problem',
  difficulty: 'easy',
  timeLimit: 15,
  prompt: 'Write a function that does something.',
  constraints: ['1 <= n <= 100'],
  scaffold: 'function solution(n) {\n  // Your code here\n}',
  examples: [
    { input: 'n = 5', output: '10', explanation: 'Example explanation' }
  ],
  expectedApproach: 'Use a loop',
  commonPitfalls: ['Off-by-one errors'],
  idealSolutionOutline: 'Loop through and sum',
  evaluationNotes: 'Check for edge cases',
};

describe('useSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should initialize with session as null (idle state)', () => {
      const { result } = renderHook(() => useSession());
      expect(result.current.session).toBeNull();
    });
  });

  describe('startSession', () => {
    it('should create a new session with the given problem', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      expect(result.current.session).not.toBeNull();
      expect(result.current.session?.problemId).toBe('test-problem');
    });

    it('should generate a unique session ID', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      expect(result.current.session?.id).toMatch(/^session-[a-z0-9]+-[a-z0-9]+$/);
    });

    it('should set status to active', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      expect(result.current.session?.status).toBe('active');
    });

    it('should set startTime to current timestamp', () => {
      const { result } = renderHook(() => useSession());
      const expectedTime = Date.now();

      act(() => {
        result.current.startSession(mockProblem);
      });

      expect(result.current.session?.startTime).toBe(expectedTime);
    });

    it('should set endTime to null', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      expect(result.current.session?.endTime).toBeNull();
    });

    it('should initialize code with problem scaffold (Requirement 3.1)', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      expect(result.current.session?.code).toBe(mockProblem.scaffold);
    });

    it('should initialize with empty chat history', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      expect(result.current.session?.chatHistory).toEqual([]);
    });

    it('should replace existing session when starting a new one', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      const firstSessionId = result.current.session?.id;

      // Advance time to get different ID
      vi.advanceTimersByTime(1000);

      const anotherProblem: Problem = {
        ...mockProblem,
        id: 'another-problem',
        title: 'Another Problem',
      };

      act(() => {
        result.current.startSession(anotherProblem);
      });

      expect(result.current.session?.id).not.toBe(firstSessionId);
      expect(result.current.session?.problemId).toBe('another-problem');
    });
  });

  describe('endSession', () => {
    it('should set status to completed', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      act(() => {
        result.current.endSession();
      });

      expect(result.current.session?.status).toBe('completed');
    });

    it('should set endTime to current timestamp', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      // Advance time
      vi.advanceTimersByTime(5000);
      const expectedEndTime = Date.now();

      act(() => {
        result.current.endSession();
      });

      expect(result.current.session?.endTime).toBe(expectedEndTime);
    });

    it('should preserve session data when ending', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      act(() => {
        result.current.updateCode('const answer = 42;');
      });

      act(() => {
        result.current.endSession();
      });

      expect(result.current.session?.code).toBe('const answer = 42;');
      expect(result.current.session?.problemId).toBe('test-problem');
    });

    it('should do nothing if no session exists', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.endSession();
      });

      expect(result.current.session).toBeNull();
    });
  });

  describe('updateCode', () => {
    it('should update the code content (Requirement 7.4)', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      act(() => {
        result.current.updateCode('function solution(n) { return n * 2; }');
      });

      expect(result.current.session?.code).toBe('function solution(n) { return n * 2; }');
    });

    it('should preserve code through multiple updates (Requirement 7.4)', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      act(() => {
        result.current.updateCode('step 1');
      });

      act(() => {
        result.current.updateCode('step 2');
      });

      act(() => {
        result.current.updateCode('final code');
      });

      expect(result.current.session?.code).toBe('final code');
    });

    it('should not update code if session is not active', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      act(() => {
        result.current.updateCode('code before evaluation');
      });

      act(() => {
        result.current.submitForEvaluation();
      });

      // Try to update code while evaluating
      act(() => {
        result.current.updateCode('code during evaluation');
      });

      expect(result.current.session?.code).toBe('code before evaluation');
    });

    it('should do nothing if no session exists', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.updateCode('some code');
      });

      expect(result.current.session).toBeNull();
    });

    it('should handle empty string code', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      act(() => {
        result.current.updateCode('');
      });

      expect(result.current.session?.code).toBe('');
    });
  });

  describe('submitForEvaluation', () => {
    it('should transition status from active to evaluating (Requirement 1.4)', async () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      await act(async () => {
        await result.current.submitForEvaluation();
      });

      expect(result.current.session?.status).toBe('evaluating');
    });

    it('should preserve code content during evaluation', async () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      act(() => {
        result.current.updateCode('my solution code');
      });

      await act(async () => {
        await result.current.submitForEvaluation();
      });

      expect(result.current.session?.code).toBe('my solution code');
    });

    it('should preserve chat history during evaluation', async () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      act(() => {
        result.current.addChatMessage({ role: 'user', content: 'Help me!' });
      });

      await act(async () => {
        await result.current.submitForEvaluation();
      });

      expect(result.current.session?.chatHistory).toHaveLength(1);
      expect(result.current.session?.chatHistory[0].content).toBe('Help me!');
    });

    it('should not change status if already evaluating', async () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      await act(async () => {
        await result.current.submitForEvaluation();
      });

      expect(result.current.session?.status).toBe('evaluating');

      // Try to submit again
      await act(async () => {
        await result.current.submitForEvaluation();
      });

      expect(result.current.session?.status).toBe('evaluating');
    });

    it('should do nothing if no session exists', async () => {
      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.submitForEvaluation();
      });

      expect(result.current.session).toBeNull();
    });
  });

  describe('addChatMessage', () => {
    it('should add a user message to chat history', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      act(() => {
        result.current.addChatMessage({ role: 'user', content: 'What is the time complexity?' });
      });

      expect(result.current.session?.chatHistory).toHaveLength(1);
      expect(result.current.session?.chatHistory[0].role).toBe('user');
      expect(result.current.session?.chatHistory[0].content).toBe('What is the time complexity?');
    });

    it('should add a proctor message to chat history', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      act(() => {
        result.current.addChatMessage({ role: 'proctor', content: 'Welcome to the assessment!' });
      });

      expect(result.current.session?.chatHistory).toHaveLength(1);
      expect(result.current.session?.chatHistory[0].role).toBe('proctor');
    });

    it('should generate unique message IDs', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      act(() => {
        result.current.addChatMessage({ role: 'user', content: 'Message 1' });
      });

      vi.advanceTimersByTime(100);

      act(() => {
        result.current.addChatMessage({ role: 'proctor', content: 'Message 2' });
      });

      const ids = result.current.session?.chatHistory.map(m => m.id);
      expect(ids?.[0]).not.toBe(ids?.[1]);
      expect(ids?.[0]).toMatch(/^msg-[a-z0-9]+-[a-z0-9]+$/);
    });

    it('should set timestamp on messages', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      const messageTime = Date.now();

      act(() => {
        result.current.addChatMessage({ role: 'user', content: 'Test message' });
      });

      expect(result.current.session?.chatHistory[0].timestamp).toBe(messageTime);
    });

    it('should preserve message order', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      act(() => {
        result.current.addChatMessage({ role: 'proctor', content: 'Welcome!' });
      });

      vi.advanceTimersByTime(100);

      act(() => {
        result.current.addChatMessage({ role: 'user', content: 'Hello!' });
      });

      vi.advanceTimersByTime(100);

      act(() => {
        result.current.addChatMessage({ role: 'proctor', content: 'How can I help?' });
      });

      expect(result.current.session?.chatHistory).toHaveLength(3);
      expect(result.current.session?.chatHistory[0].content).toBe('Welcome!');
      expect(result.current.session?.chatHistory[1].content).toBe('Hello!');
      expect(result.current.session?.chatHistory[2].content).toBe('How can I help?');
    });

    it('should do nothing if no session exists', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.addChatMessage({ role: 'user', content: 'Test' });
      });

      expect(result.current.session).toBeNull();
    });
  });

  describe('session ID uniqueness', () => {
    it('should generate different IDs for sessions started at different times', () => {
      const { result } = renderHook(() => useSession());
      const sessionIds: string[] = [];

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.startSession(mockProblem);
        });
        sessionIds.push(result.current.session?.id || '');
        vi.advanceTimersByTime(1000);
      }

      const uniqueIds = new Set(sessionIds);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('Requirements validation', () => {
    it('Requirement 1.4: submitForEvaluation transitions to evaluating state', async () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      expect(result.current.session?.status).toBe('active');

      await act(async () => {
        await result.current.submitForEvaluation();
      });

      expect(result.current.session?.status).toBe('evaluating');
    });

    it('Requirement 3.1: startSession populates code with scaffold', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      expect(result.current.session?.code).toBe(mockProblem.scaffold);
    });

    it('Requirement 7.4: code content is preserved throughout session', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      // Update code multiple times
      act(() => {
        result.current.updateCode('version 1');
      });

      // Add chat messages (should not affect code)
      act(() => {
        result.current.addChatMessage({ role: 'user', content: 'Question' });
      });

      expect(result.current.session?.code).toBe('version 1');

      // Update code again
      act(() => {
        result.current.updateCode('version 2');
      });

      // Add more chat messages
      act(() => {
        result.current.addChatMessage({ role: 'proctor', content: 'Answer' });
      });

      expect(result.current.session?.code).toBe('version 2');
    });

    it('Requirement 7.4: code is not modified by other state changes', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      const originalCode = 'my solution code';

      act(() => {
        result.current.updateCode(originalCode);
      });

      // Simulate various state changes
      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.addChatMessage({ role: 'user', content: `Message ${i}` });
        });
        vi.advanceTimersByTime(1000);
      }

      // Code should remain unchanged
      expect(result.current.session?.code).toBe(originalCode);
    });
  });

  describe('edge cases', () => {
    it('should handle very long code content', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      const longCode = 'x'.repeat(100000);

      act(() => {
        result.current.updateCode(longCode);
      });

      expect(result.current.session?.code).toBe(longCode);
      expect(result.current.session?.code.length).toBe(100000);
    });

    it('should handle special characters in code', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      const specialCode = 'const str = "Hello\\nWorld\\t!"; // 日本語 🎉';

      act(() => {
        result.current.updateCode(specialCode);
      });

      expect(result.current.session?.code).toBe(specialCode);
    });

    it('should handle special characters in chat messages', () => {
      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession(mockProblem);
      });

      const specialMessage = 'What about O(n²) complexity? 🤔';

      act(() => {
        result.current.addChatMessage({ role: 'user', content: specialMessage });
      });

      expect(result.current.session?.chatHistory[0].content).toBe(specialMessage);
    });
  });
});
