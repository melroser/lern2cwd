import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '../useSession';
import type { Problem } from '../../types';

const problem: Problem = {
  id: 'two-sum',
  title: 'Two Sum',
  language: 'python',
  difficulty: 'easy',
  timeLimit: 15,
  prompt: 'Return indices of the two numbers that add to target.',
  constraints: ['Exactly one solution exists'],
  scaffold: 'def two_sum(nums, target):\n    pass',
  examples: [{ input: 'nums=[2,7,11,15], target=9', output: '[0,1]' }],
  expectedApproach: 'Use a hashmap of seen values.',
  commonPitfalls: ['Returning values instead of indices'],
  idealSolutionOutline: 'Hashmap lookup for complement.',
  evaluationNotes: 'Check for linear-time reasoning.',
  assessmentType: 'coding',
  domain: 'software-engineering',
  problemSetId: 'neetcode-50',
};

describe('useSession', () => {
  it('starts in a waiting-to-start state with scaffolded code', () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.startSession(problem);
    });

    expect(result.current.session?.status).toBe('waiting_to_start');
    expect(result.current.session?.code).toBe(problem.scaffold);
    expect(result.current.session?.chatHistory).toEqual([]);
  });

  it('activates a waiting session when the timer begins', () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.startSession(problem);
      result.current.activateSession();
    });

    expect(result.current.session?.status).toBe('active');
  });

  it('only submits active sessions for evaluation', async () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.startSession(problem);
    });
    await act(async () => {
      await result.current.submitForEvaluation();
    });
    expect(result.current.session?.status).toBe('waiting_to_start');

    act(() => {
      result.current.activateSession();
    });
    await act(async () => {
      await result.current.submitForEvaluation();
    });
    expect(result.current.session?.status).toBe('evaluating');
  });

  it('blocks code edits after evaluation starts', async () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.startSession(problem);
      result.current.activateSession();
      result.current.updateCode('draft v1');
    });

    await act(async () => {
      await result.current.submitForEvaluation();
    });

    act(() => {
      result.current.updateCode('draft v2');
    });

    expect(result.current.session?.code).toBe('draft v1');
  });

  it('appends chat messages with generated ids and timestamps', () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.startSession(problem);
      result.current.addChatMessage({ role: 'user', content: 'I am ready.' });
      result.current.addChatMessage({ role: 'proctor', content: 'Timer started.' });
    });

    expect(result.current.session?.chatHistory).toHaveLength(2);
    expect(result.current.session?.chatHistory[0].id).toMatch(/^msg-/);
    expect(result.current.session?.chatHistory[1].timestamp).toEqual(expect.any(Number));
  });
});
