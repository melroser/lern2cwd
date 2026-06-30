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
  title: 'Tutorial Question',
  difficulty: 'easy',
  timeLimit: 8,
  prompt: 'What do you think of the app so far?',
  constraints: [
    'Share one honest first impression.',
    'Mention something about colors, performance, layout, clarity, or anything you want to know.',
    'Ask the Tutor a question if you want.',
  ],
  scaffold: '# Tutorial question\n# Share a quick first impression.\n\nanswer: \n\nquestion_for_tutor: ',
  examples: [
    {
      input: 'The color scheme is readable, and I want to know what happens after I submit.',
      output: 'A short first impression is enough for this tutorial.',
      explanation: 'The tutorial is successful when the user tries the answer, Help, submit, and feedback flow.',
    },
  ],
  expectedApproach: 'Share a quick first impression, optionally ask the Tutor a question, then submit to see feedback.',
  commonPitfalls: ['Leaving the answer blank', 'Only writing punctuation'],
  idealSolutionOutline: 'A short honest first impression about the app or a question the user has.',
  evaluationNotes: 'Pass any meaningful attempt.',
  assessmentType: 'behavioral',
  domain: 'onboarding',
  problemSetId: 'tutorial',
  competencyTags: ['tutorial', 'feedback', 'onboarding'],
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

    it('answers first tutorial answer requests without inventing a correct answer', async () => {
      const response = await service.respondToQuestion(
        'What should I write?',
        createSessionContext({
          problem: tutorialProblem,
          currentCode: tutorialProblem.scaffold,
        }),
      );

      expect(response).toContain('There is not a correct answer here.');
      expect(response).toContain('Write one honest first impression.');
      expect(response).toContain('colors, speed, layout');
      expect(service.getLastInteractionMode()).toBe('fallback');
    });

    it('nudges first tutorial users toward one concrete observation', async () => {
      const response = await service.respondToQuestion(
        'Can I get a hint?',
        createSessionContext({
          problem: tutorialProblem,
          currentCode: tutorialProblem.scaffold,
        }),
      );

      expect(response).toContain('Here is a nudge:');
      expect(response).toContain('colors, performance, layout, clarity');
      expect(response).toContain('Write one sentence about it');
    });

    it('normalizes first tutorial confusion into a first guess', async () => {
      const response = await service.respondToQuestion(
        'what the fuck is this',
        createSessionContext({
          problem: tutorialProblem,
          currentCode: tutorialProblem.scaffold,
        }),
      );

      expect(response).toContain('This is just a tutorial question.');
      expect(response).toContain('Write what you think of the app so far.');
      expect(response).toContain('The app feels');
    });

    it('keeps repeated first tutorial clarification grounded in the app prompt', async () => {
      const previousTutorResponse = 'Write one honest first impression in the Answer box. A sentence or two is enough.';
      const response = await service.respondToQuestion(
        'about what?',
        createSessionContext({
          problem: tutorialProblem,
          currentCode: tutorialProblem.scaffold,
          chatHistory: [
            ...mockChatHistory,
            {
              id: '3',
              role: 'user',
              content: 'An impression of what?',
              timestamp: Date.now() - 10_000,
            },
            {
              id: '4',
              role: 'proctor',
              content: previousTutorResponse,
              timestamp: Date.now() - 5_000,
            },
          ],
        }),
      );

      expect(response).toContain('About the app itself.');
      expect(response).toContain('colors, speed, layout');
      expect(response).not.toContain('make one guess');
      expect(response).not.toContain('learning programming');
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
        'answer: The color scheme is readable, and the app feels fast. I want to know what happens after I submit.\nquestion_for_tutor: What happens after submit?',
        tutorialProblem,
        [
          ...mockChatHistory,
          {
            id: '3',
            role: 'user',
            content: 'What happens after submit?',
            timestamp: Date.now() - 10_000,
          },
        ],
      );

      expect(result.verdict).toBe('Pass');
      expect(result.feedback.strengths.join(' ')).toContain('You completed the tutorial question.');
      expect(result.feedback.strengths.join(' ')).toContain('You used Help');
      expect(result.feedback.improvements.join(' ')).toContain('core loop');
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
      expect(result.feedback.strengths.join(' ')).toContain('A short first impression is enough');
      expect(result.feedback.improvements.join(' ')).toContain('Add one thing you notice');
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
