import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProctorService, proctorService } from '../proctorService';
import type { ChatMessage, Problem, SessionContext } from '../../types';

const baseProblem: Problem = {
  id: 'test-problem',
  language: 'python',
  title: 'Test Problem',
  difficulty: 'easy',
  timeLimit: 15,
  prompt: 'Write a function that does something useful.',
  constraints: ['1 <= n <= 100', 'Input is always valid'],
  scaffold: 'def solve(n):\n    pass',
  examples: [
    {
      input: 'n = 5',
      output: '10',
      explanation: 'The result is doubled',
    },
  ],
  expectedApproach: 'Use a simple loop to iterate through the input.',
  commonPitfalls: ['Off-by-one errors', 'Not handling zero'],
  idealSolutionOutline: 'Loop from 1 to n, accumulate result',
  evaluationNotes: 'Look for understanding of basic iteration',
  assessmentType: 'coding',
  domain: 'python-fundamentals',
  problemSetId: 'python-fundamentals',
};

const mockChatHistory: ChatMessage[] = [
  {
    id: '1',
    role: 'proctor',
    content: 'Welcome to the assessment!',
    timestamp: Date.now() - 60_000,
  },
  {
    id: '2',
    role: 'user',
    content: 'Thanks, I have a question.',
    timestamp: Date.now() - 30_000,
  },
];

const createSessionContext = (overrides: Partial<SessionContext> = {}): SessionContext => ({
  problem: baseProblem,
  currentCode: baseProblem.scaffold,
  chatHistory: mockChatHistory,
  timeRemaining: 600,
  ...overrides,
});

describe('ProctorService', () => {
  let service: ProctorService;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    service = new ProctorService();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('generateIntro', () => {
    it('returns the current assessment opener', async () => {
      const intro = await service.generateIntro(baseProblem);
      expect(intro).toBe("Welcome to the assessment. When you're ready to begin, let me know.");
    });

    it('keeps a friendly welcome tone', async () => {
      const intro = await service.generateIntro(baseProblem);
      expect(intro.toLowerCase()).toContain('welcome');
      expect(intro.toLowerCase()).toContain('ready');
    });
  });

  describe('respondToQuestion', () => {
    it('uses the Netlify AI gateway when an auth token provider is configured', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'Gateway response' }),
      });
      globalThis.fetch = fetchMock as typeof fetch;

      service.configureAccessTokenProvider(async () => 'jwt-token');

      const response = await service.respondToQuestion('How do I start?', createSessionContext());

      expect(response).toBe('Gateway response');
      expect(fetchMock).toHaveBeenCalledWith(
        '/.netlify/functions/ai',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt-token',
          }),
        }),
      );
      expect(service.getLastInteractionMode()).toBe('llm');
    });

    it('returns a deterministic hint ladder in mock mode', async () => {
      const response = await service.respondToQuestion('stuck', createSessionContext());
      expect(response).toMatch(/Hint|Start by restating the contract/i);
      expect(service.getLastInteractionMode()).toBe('fallback');
    });

    it('answers time checks directly', async () => {
      const response = await service.respondToQuestion(
        'how much time is left?',
        createSessionContext({ timeRemaining: 183 }),
      );

      expect(response).toContain('3:03');
    });

    it('gives concrete code feedback when a draft is visible', async () => {
      const response = await service.respondToQuestion(
        'is this good?',
        createSessionContext({
          currentCode: 'def solve(n):\n    total = 0\n    for i in range(n):\n        total += i\n    return total',
        }),
      );

      expect(response.length).toBeGreaterThan(20);
      expect(response.toLowerCase()).toMatch(/close|final check|recheck|revisit|fix|strong/);
    });
  });

  describe('evaluate', () => {
    it('returns a valid evaluation payload', async () => {
      const result = await service.evaluate(baseProblem.scaffold, baseProblem, mockChatHistory);

      expect(['Pass', 'Borderline', 'No Pass']).toContain(result.verdict);
      expect(result.scores.approach).toBeGreaterThanOrEqual(0);
      expect(result.scores.approach).toBeLessThanOrEqual(4);
      expect(Array.isArray(result.feedback.strengths)).toBe(true);
      expect(Array.isArray(result.feedback.improvements)).toBe(true);
      expect(Array.isArray(result.missTags)).toBe(true);
    });

    it('returns curated ideal solutions for known problems', async () => {
      const result = await service.evaluate(
        'def two_sum(nums, target):\n    pass',
        {
          ...baseProblem,
          id: 'two-sum',
          title: 'Two Sum',
        },
        mockChatHistory,
      );

      expect(result.idealSolution).toContain('two_sum');
      expect(result.idealSolution.toLowerCase()).toMatch(/dict|hash|complement/);
    });
  });

  describe('singleton instance', () => {
    it('exports a singleton instance with the expected surface', () => {
      expect(proctorService).toBeInstanceOf(ProctorService);
      expect(typeof proctorService.generateIntro).toBe('function');
      expect(typeof proctorService.respondToQuestion).toBe('function');
      expect(typeof proctorService.evaluate).toBe('function');
    });
  });
});
