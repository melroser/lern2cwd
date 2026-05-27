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

const tutorialProblem: Problem = {
  id: 'tutorial-first-session',
  language: 'yaml',
  title: 'Your First Rep: Shoot Your Shot',
  difficulty: 'easy',
  timeLimit: 8,
  prompt: "How is James Joyce's Ulysses like programming?",
  constraints: [
    'Make a real attempt before asking for help.',
    'Include your best guess.',
    'Include one thing you are unsure about.',
    'Ask the Tutor for a nudge, then improve your answer before submitting.',
  ],
  scaffold: '# Your first rep\n# Try before you feel ready.\n\nanswer: \n\nquestion_for_tutor: ',
  examples: [
    {
      input: 'I do not know who James Joyce is, but I think the question is asking me to compare something hard to programming.',
      output: 'A real attempt is enough for this first rep.',
      explanation: 'The tutorial is successful when you try under uncertainty, ask for a nudge, revise, and submit.',
    },
  ],
  expectedApproach: 'Make a meaningful attempt under uncertainty, connect confusion in reading to confusion in programming, ask for a nudge, revise, and submit.',
  commonPitfalls: ['Stopping at only I do not know', 'Asking for the full answer before attempting'],
  idealSolutionOutline: 'A real first attempt that makes one guess, names uncertainty, asks for a nudge, and improves the answer before submitting.',
  evaluationNotes: 'Pass any meaningful attempt.',
  assessmentType: 'behavioral',
  domain: 'onboarding',
  problemSetId: 'tutorial',
  competencyTags: ['tutorial', 'retrieval-practice', 'productive-struggle', 'onboarding'],
};

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
      expect(intro).toBe(
        'Welcome. Press Start when you are ready. After that, you can ask me for help here if you want a nudge or clarification.',
      );
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

    it('falls back to local coaching when the Netlify AI gateway fails', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'quota exceeded',
      });
      globalThis.fetch = fetchMock as typeof fetch;

      service.configureAccessTokenProvider(async () => 'jwt-token');

      const response = await service.respondToQuestion('Can I get a hint?', createSessionContext());

      expect(response).toMatch(/Hint|Start by restating the contract/i);
      expect(response).not.toContain('proctor API error');
      expect(fetchMock).toHaveBeenCalled();
      expect(service.getLastInteractionMode()).toBe('fallback');
    });

    it('returns a deterministic hint ladder in mock mode', async () => {
      const response = await service.respondToQuestion('stuck', createSessionContext());
      expect(response).toMatch(/Hint|Start by restating the contract/i);
      expect(service.getLastInteractionMode()).toBe('fallback');
    });

    it('recognizes nudge language in fallback mode', async () => {
      const response = await service.respondToQuestion('Can I get a nudge?', createSessionContext());
      expect(response).toMatch(/Hint|Start by restating the contract/i);
      expect(service.getLastInteractionMode()).toBe('fallback');
    });

    it('answers edge case questions with concrete cases', async () => {
      const response = await service.respondToQuestion('What edge cases should I check?', createSessionContext());
      expect(response).toContain('Off-by-one errors');
      expect(response).toContain('Not handling zero');
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

    it('answers first tutorial context questions with a nudge instead of the full answer', async () => {
      const response = await service.respondToQuestion(
        'Who is James Joyce?',
        createSessionContext({
          problem: tutorialProblem,
          currentCode: tutorialProblem.scaffold,
        }),
      );

      expect(response).toContain('James Joyce was a writer');
      expect(response).toContain('You do not need more than that for this rep.');
      expect(response).toContain('what is one move you can still make');
      expect(response).not.toMatch(/full answer|modal editing|Vim/i);
      expect(service.getLastInteractionMode()).toBe('fallback');
    });

    it('refuses to give the first tutorial answer and offers next-step categories', async () => {
      const response = await service.respondToQuestion(
        'just give me the answer',
        createSessionContext({
          problem: tutorialProblem,
          currentCode: tutorialProblem.scaffold,
        }),
      );

      expect(response).toContain('I will not give the full answer yet.');
      expect(response).toContain('breaking the problem into smaller parts');
      expect(response).toContain('Pick one and write your own sentence.');
    });

    it('normalizes first tutorial confusion into a first guess', async () => {
      const response = await service.respondToQuestion(
        'what the fuck is this',
        createSessionContext({
          problem: tutorialProblem,
          currentCode: tutorialProblem.scaffold,
        }),
      );

      expect(response).toContain('That reaction is expected.');
      expect(response).toContain('Your next move is to make one guess.');
      expect(response).toContain('I do not know what Ulysses is');
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

    it('treats a meaningful first tutorial attempt as a win', async () => {
      const result = await service.evaluate(
        "answer: I don't know who James Joyce is, but I think the question might be asking me to compare a hard book with learning to code. Maybe both require breaking confusing things into smaller parts. I am unsure what Ulysses is.\nquestion_for_tutor: What is Ulysses?",
        tutorialProblem,
        [
          ...mockChatHistory,
          {
            id: '3',
            role: 'user',
            content: 'What is Ulysses?',
            timestamp: Date.now() - 10_000,
          },
        ],
      );

      expect(result.verdict).toBe('Pass');
      expect(result.feedback.strengths.join(' ')).toContain('You finished your first rep.');
      expect(result.feedback.strengths.join(' ')).toContain('You asked for a nudge');
      expect(result.feedback.improvements.join(' ')).toContain('The point is not to know everything');
      expect(result.idealSolution).toBe('');
      expect(result.missTags).toEqual([]);
      expect(result.annotations).toEqual([]);
    });

    it('does not pass a bare first tutorial non-attempt', async () => {
      const result = await service.evaluate(
        'answer: I don’t know\nquestion_for_tutor: ',
        tutorialProblem,
        mockChatHistory,
      );

      expect(result.verdict).toBe('Borderline');
      expect(result.feedback.strengths.join(' ')).toContain("'I don't know' is allowed");
      expect(result.feedback.improvements.join(' ')).toContain('Add one guess');
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
