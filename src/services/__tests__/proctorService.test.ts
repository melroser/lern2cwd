/**
 * Unit tests for ProctorService
 * 
 * Tests:
 * - generateIntro: Returns friendly introduction with problem details
 * - respondToQuestion: Returns helpful guidance based on question type
 * - evaluate: Returns valid EvaluationResult with scores and feedback
 * 
 * Requirements: 3.1, 4.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProctorService, proctorService } from '../proctorService';
import type { Problem, SessionContext, ChatMessage } from '../../types';

// Test fixtures
const mockProblem: Problem = {
  id: 'test-problem',
  language: 'python',
  title: 'Test Problem',
  difficulty: 'easy',
  timeLimit: 15,
  prompt: 'Write a function that does something useful.',
  constraints: ['1 <= n <= 100', 'Input is always valid'],
  scaffold: 'def solve(n):\n    # Your code here\n    pass',
  examples: [
    {
      input: 'n = 5',
      output: '10',
      explanation: 'The result is doubled',
    },
    {
      input: 'n = 0',
      output: '0',
    },
  ],
  expectedApproach: 'Use a simple loop to iterate through the input.',
  commonPitfalls: ['Off-by-one errors', 'Not handling zero'],
  idealSolutionOutline: 'Loop from 1 to n, accumulate result',
  evaluationNotes: 'Look for understanding of basic iteration',
};

const mockChatHistory: ChatMessage[] = [
  {
    id: '1',
    role: 'proctor',
    content: 'Welcome to the assessment!',
    timestamp: Date.now() - 60000,
  },
  {
    id: '2',
    role: 'user',
    content: 'Thanks, I have a question.',
    timestamp: Date.now() - 30000,
  },
];

const createSessionContext = (overrides: Partial<SessionContext> = {}): SessionContext => ({
  problem: mockProblem,
  currentCode: mockProblem.scaffold,
  chatHistory: mockChatHistory,
  timeRemaining: 600, // 10 minutes
  ...overrides,
});

describe('ProctorService', () => {
  let service: ProctorService;

  beforeEach(() => {
    service = new ProctorService();
  });

  describe('generateIntro', () => {
    it('should return a string introduction', async () => {
      const intro = await service.generateIntro(mockProblem);
      expect(typeof intro).toBe('string');
      expect(intro.length).toBeGreaterThan(0);
    });

    it('should include the problem title', async () => {
      const intro = await service.generateIntro(mockProblem);
      expect(intro).toContain(mockProblem.title);
    });

    it('should include the problem prompt', async () => {
      const intro = await service.generateIntro(mockProblem);
      expect(intro).toContain(mockProblem.prompt);
    });

    it('should include constraints', async () => {
      const intro = await service.generateIntro(mockProblem);
      mockProblem.constraints.forEach((constraint) => {
        expect(intro).toContain(constraint);
      });
    });

    it('should include examples', async () => {
      const intro = await service.generateIntro(mockProblem);
      expect(intro).toContain(mockProblem.examples[0].input);
      expect(intro).toContain(mockProblem.examples[0].output);
    });

    it('should include the time limit', async () => {
      const intro = await service.generateIntro(mockProblem);
      expect(intro).toContain(String(mockProblem.timeLimit));
    });

    it('should have a friendly tone', async () => {
      const intro = await service.generateIntro(mockProblem);
      // Check for friendly elements
      expect(intro.toLowerCase()).toMatch(/welcome|hi|hello|good luck/);
    });

    it('should handle different difficulty levels', async () => {
      const easyProblem = { ...mockProblem, difficulty: 'easy' as const };
      const mediumProblem = { ...mockProblem, difficulty: 'medium' as const };
      const hardProblem = { ...mockProblem, difficulty: 'hard' as const };

      const easyIntro = await service.generateIntro(easyProblem);
      const mediumIntro = await service.generateIntro(mediumProblem);
      const hardIntro = await service.generateIntro(hardProblem);

      // Each should complete without error
      expect(easyIntro.length).toBeGreaterThan(0);
      expect(mediumIntro.length).toBeGreaterThan(0);
      expect(hardIntro.length).toBeGreaterThan(0);
    });
  });

  describe('respondToQuestion', () => {
    it('should return a string response', async () => {
      const context = createSessionContext();
      const response = await service.respondToQuestion('How do I start?', context);
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('should respond to hint requests', async () => {
      const context = createSessionContext();
      const response = await service.respondToQuestion('Can I get a hint?', context);
      expect(response.toLowerCase()).toMatch(/hint|approach|think|consider/);
    });

    it('should respond to stuck/help requests', async () => {
      const context = createSessionContext();
      const response = await service.respondToQuestion("I'm stuck, help!", context);
      expect(response.toLowerCase()).toMatch(/help|guidance|approach/);
    });

    it('should respond to edge case questions', async () => {
      const context = createSessionContext();
      const response = await service.respondToQuestion('What about edge cases?', context);
      expect(response.toLowerCase()).toMatch(/edge case|consider|handle/);
    });

    it('should respond to complexity questions', async () => {
      const context = createSessionContext();
      const response = await service.respondToQuestion('What is the time complexity?', context);
      expect(response.toLowerCase()).toMatch(/complexity|time|space/);
    });

    it('should respond to example/test questions', async () => {
      const context = createSessionContext();
      const response = await service.respondToQuestion('Can we walk through an example?', context);
      expect(response.toLowerCase()).toMatch(/example|input|output/);
    });

    it('should respond to approach questions', async () => {
      const context = createSessionContext();
      const response = await service.respondToQuestion('How should I approach this?', context);
      expect(response.toLowerCase()).toMatch(/approach|step|think/);
    });

    it('should include time warning when under 5 minutes', async () => {
      const context = createSessionContext({ timeRemaining: 180 }); // 3 minutes
      const response = await service.respondToQuestion('Any hints?', context);
      expect(response.toLowerCase()).toMatch(/minute|time|left/);
    });

    it('should not include time warning when over 5 minutes', async () => {
      const context = createSessionContext({ timeRemaining: 600 }); // 10 minutes
      const response = await service.respondToQuestion('Any hints?', context);
      // Should not have urgent time warning
      expect(response).not.toMatch(/⏰/);
    });

    it('should acknowledge when user has written code', async () => {
      const context = createSessionContext({
        currentCode: mockProblem.scaffold + '\n  // My implementation\n  for (let i = 0; i < n; i++) {\n    result += i;\n  }\n  return result;',
      });
      const response = await service.respondToQuestion('Is this right?', context);
      expect(response.toLowerCase()).toMatch(/solution|approach|implementation|working|progress/);
    });

    it('should handle general questions', async () => {
      const context = createSessionContext();
      const response = await service.respondToQuestion('What do you think?', context);
      expect(response.length).toBeGreaterThan(0);
      expect(response).toContain(mockProblem.title);
    });
  });

  describe('evaluate', () => {
    it('should return a valid EvaluationResult', async () => {
      const result = await service.evaluate(
        mockProblem.scaffold,
        mockProblem,
        mockChatHistory
      );

      expect(result).toHaveProperty('verdict');
      expect(result).toHaveProperty('scores');
      expect(result).toHaveProperty('feedback');
      expect(result).toHaveProperty('idealSolution');
      expect(result).toHaveProperty('missTags');
    });

    it('should return valid verdict values', async () => {
      const result = await service.evaluate(
        mockProblem.scaffold,
        mockProblem,
        mockChatHistory
      );

      expect(['Pass', 'Borderline', 'No Pass']).toContain(result.verdict);
    });

    it('should return scores in valid range (0-4)', async () => {
      const result = await service.evaluate(
        mockProblem.scaffold,
        mockProblem,
        mockChatHistory
      );

      const { scores } = result;
      expect(scores.approach).toBeGreaterThanOrEqual(0);
      expect(scores.approach).toBeLessThanOrEqual(4);
      expect(scores.completeness).toBeGreaterThanOrEqual(0);
      expect(scores.completeness).toBeLessThanOrEqual(4);
      expect(scores.complexity).toBeGreaterThanOrEqual(0);
      expect(scores.complexity).toBeLessThanOrEqual(4);
      expect(scores.communication).toBeGreaterThanOrEqual(0);
      expect(scores.communication).toBeLessThanOrEqual(4);
    });

    it('should return integer scores', async () => {
      const result = await service.evaluate(
        mockProblem.scaffold,
        mockProblem,
        mockChatHistory
      );

      const { scores } = result;
      expect(Number.isInteger(scores.approach)).toBe(true);
      expect(Number.isInteger(scores.completeness)).toBe(true);
      expect(Number.isInteger(scores.complexity)).toBe(true);
      expect(Number.isInteger(scores.communication)).toBe(true);
    });

    it('should return feedback with strengths and improvements', async () => {
      const result = await service.evaluate(
        mockProblem.scaffold,
        mockProblem,
        mockChatHistory
      );

      expect(Array.isArray(result.feedback.strengths)).toBe(true);
      expect(Array.isArray(result.feedback.improvements)).toBe(true);
      expect(result.feedback.strengths.length).toBeGreaterThan(0);
      expect(result.feedback.improvements.length).toBeGreaterThan(0);
    });

    it('should return non-empty idealSolution', async () => {
      const result = await service.evaluate(
        mockProblem.scaffold,
        mockProblem,
        mockChatHistory
      );

      expect(typeof result.idealSolution).toBe('string');
      expect(result.idealSolution.trim().length).toBeGreaterThan(0);
    });

    it('should return valid missTags', async () => {
      const result = await service.evaluate(
        mockProblem.scaffold,
        mockProblem,
        mockChatHistory
      );

      const validTags = [
        'edge-cases',
        'complexity-analysis',
        'incorrect-approach',
        'incomplete-solution',
        'unclear-communication',
        'wrong-data-structure',
        'off-by-one',
        'constraints-missed',
        'testing-mentality',
      ];

      expect(Array.isArray(result.missTags)).toBe(true);
      expect(result.missTags.length).toBeLessThanOrEqual(4);
      result.missTags.forEach((tag) => {
        expect(validTags).toContain(tag);
      });
    });

    it('should give better scores for more complete code', async () => {
      const minimalCode = mockProblem.scaffold;
      const implementedCode = `def solve(n):
    # Implementation with loops and conditionals
    result = 0
    for i in range(1, n + 1):
        if i % 2 == 0:
            result += i
    return result`;

      const minimalResult = await service.evaluate(minimalCode, mockProblem, mockChatHistory);
      const implementedResult = await service.evaluate(implementedCode, mockProblem, mockChatHistory);

      const minimalTotal =
        minimalResult.scores.approach +
        minimalResult.scores.completeness +
        minimalResult.scores.complexity +
        minimalResult.scores.communication;

      const implementedTotal =
        implementedResult.scores.approach +
        implementedResult.scores.completeness +
        implementedResult.scores.complexity +
        implementedResult.scores.communication;

      expect(implementedTotal).toBeGreaterThanOrEqual(minimalTotal);
    });

    it('should give better communication score for commented code', async () => {
      const uncommentedCode = `def solve(n):
    result = 0
    for i in range(1, n + 1):
        result += i
    return result`;

      const commentedCode = `def solve(n):
    # Initialize result accumulator
    result = 0
    # Loop through all numbers from 1 to n
    for i in range(1, n + 1):
        result += i
    # Return the sum
    return result`;

      const uncommentedResult = await service.evaluate(uncommentedCode, mockProblem, mockChatHistory);
      const commentedResult = await service.evaluate(commentedCode, mockProblem, mockChatHistory);

      expect(commentedResult.scores.communication).toBeGreaterThanOrEqual(
        uncommentedResult.scores.communication
      );
    });

    it('should return problem-specific ideal solution for known problems', async () => {
      const fizzBuzzProblem: Problem = {
        ...mockProblem,
        id: 'fizzbuzz',
        title: 'FizzBuzz',
      };

      const result = await service.evaluate(
        mockProblem.scaffold,
        fizzBuzzProblem,
        mockChatHistory
      );

      expect(result.idealSolution).toContain('fizz_buzz');
      expect(result.idealSolution.toLowerCase()).toMatch(/fizz|buzz/);
    });

    it('should return problem-specific ideal solution for two-sum', async () => {
      const twoSumProblem: Problem = {
        ...mockProblem,
        id: 'two-sum',
        title: 'Two Sum',
      };

      const result = await service.evaluate(
        mockProblem.scaffold,
        twoSumProblem,
        mockChatHistory
      );

      expect(result.idealSolution).toContain('two_sum');
      expect(result.idealSolution.toLowerCase()).toMatch(/dict|hash|complement/);
    });

    it('should return problem-specific ideal solution for valid-parentheses', async () => {
      const validParensProblem: Problem = {
        ...mockProblem,
        id: 'valid-parentheses',
        title: 'Valid Parentheses',
      };

      const result = await service.evaluate(
        mockProblem.scaffold,
        validParensProblem,
        mockChatHistory
      );

      expect(result.idealSolution).toContain('is_valid');
      expect(result.idealSolution.toLowerCase()).toMatch(/stack/);
    });

    it('should handle empty chat history', async () => {
      const result = await service.evaluate(
        mockProblem.scaffold,
        mockProblem,
        []
      );

      expect(result).toHaveProperty('verdict');
      expect(result).toHaveProperty('scores');
    });

    it('should calculate verdict correctly based on scores', async () => {
      // Test with code that should get higher scores
      const goodCode = `def solve(n):
    # Good implementation with proper structure
    result = 0
    for i in range(1, n + 1):
        if i % 2 == 0:
            result += i * 2
        else:
            result += i
    return result`;

      const result = await service.evaluate(goodCode, mockProblem, mockChatHistory);
      const total =
        result.scores.approach +
        result.scores.completeness +
        result.scores.complexity +
        result.scores.communication;
      const minScore = Math.min(
        result.scores.approach,
        result.scores.completeness,
        result.scores.complexity,
        result.scores.communication
      );

      // Verify verdict matches the scoring rules
      if (total >= 13 && minScore >= 3) {
        expect(result.verdict).toBe('Pass');
      } else if (total <= 8 || result.scores.approach <= 1) {
        expect(result.verdict).toBe('No Pass');
      } else {
        expect(result.verdict).toBe('Borderline');
      }
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(proctorService).toBeInstanceOf(ProctorService);
    });

    it('should have all required methods', () => {
      expect(typeof proctorService.generateIntro).toBe('function');
      expect(typeof proctorService.respondToQuestion).toBe('function');
      expect(typeof proctorService.evaluate).toBe('function');
    });
  });

  describe('latency simulation', () => {
    it('should have some delay for generateIntro', async () => {
      const start = Date.now();
      await service.generateIntro(mockProblem);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(400); // Allow some tolerance
    });

    it('should have some delay for respondToQuestion', async () => {
      const context = createSessionContext();
      const start = Date.now();
      await service.respondToQuestion('Help?', context);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(400);
    });

    it('should have some delay for evaluate', async () => {
      const start = Date.now();
      await service.evaluate(mockProblem.scaffold, mockProblem, mockChatHistory);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(700); // Evaluation has longer delay
    });
  });
});
