/**
 * Unit tests for EvaluationService
 * 
 * Tests:
 * - JSON extraction from various formats (plain, fenced, extra text)
 * - Score clamping to 0-4 range
 * - Verdict validation and fallback computation
 * - MissTag allowlist enforcement
 * - Error handling for malformed responses
 * - Retry logic for parse failures
 * 
 * Requirements: 4.2, 4.3, 9.2
 */

import { describe, it, expect, vi } from 'vitest';
import {
  EvaluationService,
  EvaluationParseError,
  getEvaluationWithRetry,
  evaluationService,
} from '../evaluationService';
import type { EvaluationResult, RubricScores, MissTag, Verdict } from '../../types';

describe('EvaluationService', () => {
  const service = new EvaluationService();

  describe('parseEvaluationResponse', () => {
    describe('JSON extraction', () => {
      it('should parse plain JSON', () => {
        const json = JSON.stringify({
          verdict: 'Pass',
          scores: { approach: 4, completeness: 4, complexity: 3, communication: 4 },
          feedback: { strengths: ['Good approach'], improvements: ['Minor edge case'] },
          idealSolution: 'function solution() {}',
          missTags: ['edge-cases'],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.verdict).toBe('Pass');
        expect(result.scores.approach).toBe(4);
      });

      it('should extract JSON from fenced code block', () => {
        const response = `Here is the evaluation:
\`\`\`json
{
  "verdict": "Borderline",
  "scores": { "approach": 3, "completeness": 3, "complexity": 2, "communication": 3 },
  "feedback": { "strengths": ["Decent approach"], "improvements": ["Improve complexity"] },
  "idealSolution": "function better() {}",
  "missTags": ["complexity-analysis"]
}
\`\`\`
That's my evaluation.`;

        const result = service.parseEvaluationResponse(response);
        expect(result.verdict).toBe('Borderline');
        expect(result.missTags).toContain('complexity-analysis');
      });

      it('should extract JSON from fenced code block without json label', () => {
        const response = `\`\`\`
{
  "verdict": "Pass",
  "scores": { "approach": 4, "completeness": 4, "complexity": 4, "communication": 4 },
  "feedback": { "strengths": ["Excellent"], "improvements": ["None needed"] },
  "idealSolution": "perfect()",
  "missTags": []
}
\`\`\``;

        const result = service.parseEvaluationResponse(response);
        expect(result.verdict).toBe('Pass');
      });

      it('should extract JSON with extra text before and after', () => {
        const response = `Let me evaluate this solution.
{
  "verdict": "No Pass",
  "scores": { "approach": 1, "completeness": 2, "complexity": 1, "communication": 2 },
  "feedback": { "strengths": ["Tried"], "improvements": ["Wrong approach"] },
  "idealSolution": "correct()",
  "missTags": ["incorrect-approach"]
}
Hope this helps!`;

        const result = service.parseEvaluationResponse(response);
        expect(result.verdict).toBe('No Pass');
        expect(result.missTags).toContain('incorrect-approach');
      });

      it('should throw EvaluationParseError when no JSON found', () => {
        expect(() => service.parseEvaluationResponse('No JSON here'))
          .toThrow(EvaluationParseError);
      });

      it('should throw EvaluationParseError for invalid JSON', () => {
        expect(() => service.parseEvaluationResponse('{ invalid json }'))
          .toThrow(EvaluationParseError);
      });
    });

    describe('score clamping', () => {
      it('should clamp scores above 4 to 4', () => {
        const json = JSON.stringify({
          verdict: 'Pass',
          scores: { approach: 10, completeness: 5, complexity: 100, communication: 4 },
          feedback: { strengths: ['Good'], improvements: ['Better'] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.scores.approach).toBe(4);
        expect(result.scores.completeness).toBe(4);
        expect(result.scores.complexity).toBe(4);
        expect(result.scores.communication).toBe(4);
      });

      it('should clamp scores below 0 to 0', () => {
        const json = JSON.stringify({
          verdict: 'No Pass',
          scores: { approach: -1, completeness: -5, complexity: -100, communication: 0 },
          feedback: { strengths: ['Tried'], improvements: ['Everything'] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.scores.approach).toBe(0);
        expect(result.scores.completeness).toBe(0);
        expect(result.scores.complexity).toBe(0);
        expect(result.scores.communication).toBe(0);
      });

      it('should round decimal scores to nearest integer', () => {
        const json = JSON.stringify({
          verdict: 'Borderline',
          scores: { approach: 3.7, completeness: 2.2, complexity: 2.5, communication: 1.4 },
          feedback: { strengths: ['OK'], improvements: ['More'] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.scores.approach).toBe(4);
        expect(result.scores.completeness).toBe(2);
        expect(result.scores.complexity).toBe(3);
        expect(result.scores.communication).toBe(1);
      });

      it('should default missing scores to 0', () => {
        const json = JSON.stringify({
          verdict: 'No Pass',
          scores: { approach: 2 },
          feedback: { strengths: ['Partial'], improvements: ['Complete it'] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.scores.approach).toBe(2);
        expect(result.scores.completeness).toBe(0);
        expect(result.scores.complexity).toBe(0);
        expect(result.scores.communication).toBe(0);
      });

      it('should handle non-numeric score values', () => {
        const json = JSON.stringify({
          verdict: 'No Pass',
          scores: { approach: 'high', completeness: null, complexity: undefined, communication: 3 },
          feedback: { strengths: ['Some'], improvements: ['Fix scores'] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.scores.approach).toBe(0);
        expect(result.scores.completeness).toBe(0);
        expect(result.scores.complexity).toBe(0);
        expect(result.scores.communication).toBe(3);
      });
    });

    describe('verdict validation and fallback', () => {
      it('should accept valid Pass verdict', () => {
        const json = JSON.stringify({
          verdict: 'Pass',
          scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
          feedback: { strengths: ['Perfect'], improvements: ['None'] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.verdict).toBe('Pass');
      });

      it('should accept valid Borderline verdict', () => {
        const json = JSON.stringify({
          verdict: 'Borderline',
          scores: { approach: 3, completeness: 3, complexity: 2, communication: 3 },
          feedback: { strengths: ['OK'], improvements: ['Better'] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.verdict).toBe('Borderline');
      });

      it('should accept valid No Pass verdict', () => {
        const json = JSON.stringify({
          verdict: 'No Pass',
          scores: { approach: 1, completeness: 1, complexity: 1, communication: 1 },
          feedback: { strengths: ['Tried'], improvements: ['Everything'] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.verdict).toBe('No Pass');
      });

      it('should use fallback verdict when verdict is missing', () => {
        const json = JSON.stringify({
          scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
          feedback: { strengths: ['Great'], improvements: ['Minor'] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        // Total = 16, min = 4, so should be Pass
        expect(result.verdict).toBe('Pass');
      });

      it('should use fallback verdict when verdict is invalid', () => {
        const json = JSON.stringify({
          verdict: 'Maybe',
          scores: { approach: 2, completeness: 2, complexity: 2, communication: 2 },
          feedback: { strengths: ['Some'], improvements: ['More'] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        // Total = 8, so should be No Pass
        expect(result.verdict).toBe('No Pass');
      });

      it('should use fallback verdict when verdict is empty string', () => {
        const json = JSON.stringify({
          verdict: '',
          scores: { approach: 3, completeness: 3, complexity: 3, communication: 3 },
          feedback: { strengths: ['Good'], improvements: ['Better'] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        // Total = 12, min = 3, so should be Borderline
        expect(result.verdict).toBe('Borderline');
      });
    });

    describe('missTag validation', () => {
      it('should accept valid miss tags', () => {
        const json = JSON.stringify({
          verdict: 'Borderline',
          scores: { approach: 3, completeness: 2, complexity: 2, communication: 3 },
          feedback: { strengths: ['OK'], improvements: ['Edge cases'] },
          idealSolution: 'solution()',
          missTags: ['edge-cases', 'complexity-analysis'],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.missTags).toEqual(['edge-cases', 'complexity-analysis']);
      });

      it('should filter out invalid miss tags', () => {
        const json = JSON.stringify({
          verdict: 'Borderline',
          scores: { approach: 3, completeness: 3, complexity: 3, communication: 3 },
          feedback: { strengths: ['OK'], improvements: ['More'] },
          idealSolution: 'solution()',
          missTags: ['edge-cases', 'invalid-tag', 'complexity-analysis', 'another-invalid'],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.missTags).toEqual(['edge-cases', 'complexity-analysis']);
      });

      it('should limit miss tags to maximum of 4', () => {
        const json = JSON.stringify({
          verdict: 'No Pass',
          scores: { approach: 1, completeness: 1, complexity: 1, communication: 1 },
          feedback: { strengths: ['Tried'], improvements: ['Everything'] },
          idealSolution: 'solution()',
          missTags: [
            'edge-cases',
            'complexity-analysis',
            'incorrect-approach',
            'incomplete-solution',
            'unclear-communication',
            'wrong-data-structure',
          ],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.missTags.length).toBe(4);
      });

      it('should deduplicate miss tags', () => {
        const json = JSON.stringify({
          verdict: 'Borderline',
          scores: { approach: 3, completeness: 3, complexity: 3, communication: 3 },
          feedback: { strengths: ['OK'], improvements: ['More'] },
          idealSolution: 'solution()',
          missTags: ['edge-cases', 'edge-cases', 'edge-cases'],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.missTags).toEqual(['edge-cases']);
      });

      it('should handle empty miss tags array', () => {
        const json = JSON.stringify({
          verdict: 'Pass',
          scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
          feedback: { strengths: ['Perfect'], improvements: ['None'] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.missTags).toEqual([]);
      });

      it('should handle missing miss tags field', () => {
        const json = JSON.stringify({
          verdict: 'Pass',
          scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
          feedback: { strengths: ['Perfect'], improvements: ['None'] },
          idealSolution: 'solution()',
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.missTags).toEqual([]);
      });
    });

    describe('required fields validation', () => {
      it('should throw when idealSolution is missing', () => {
        const json = JSON.stringify({
          verdict: 'Pass',
          scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
          feedback: { strengths: ['Good'], improvements: ['Better'] },
          missTags: [],
        });

        expect(() => service.parseEvaluationResponse(json))
          .toThrow(EvaluationParseError);
        expect(() => service.parseEvaluationResponse(json))
          .toThrow('Missing idealSolution');
      });

      it('should throw when idealSolution is empty', () => {
        const json = JSON.stringify({
          verdict: 'Pass',
          scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
          feedback: { strengths: ['Good'], improvements: ['Better'] },
          idealSolution: '',
          missTags: [],
        });

        expect(() => service.parseEvaluationResponse(json))
          .toThrow(EvaluationParseError);
      });

      it('should throw when feedback is completely missing', () => {
        const json = JSON.stringify({
          verdict: 'Pass',
          scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
          idealSolution: 'solution()',
          missTags: [],
        });

        expect(() => service.parseEvaluationResponse(json))
          .toThrow(EvaluationParseError);
        expect(() => service.parseEvaluationResponse(json))
          .toThrow('Missing feedback');
      });

      it('should throw when both strengths and improvements are empty', () => {
        const json = JSON.stringify({
          verdict: 'Pass',
          scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
          feedback: { strengths: [], improvements: [] },
          idealSolution: 'solution()',
          missTags: [],
        });

        expect(() => service.parseEvaluationResponse(json))
          .toThrow(EvaluationParseError);
      });

      it('should accept when only strengths is provided', () => {
        const json = JSON.stringify({
          verdict: 'Pass',
          scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
          feedback: { strengths: ['Great work'], improvements: [] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.feedback.strengths).toEqual(['Great work']);
        expect(result.feedback.improvements).toEqual([]);
      });

      it('should accept when only improvements is provided', () => {
        const json = JSON.stringify({
          verdict: 'No Pass',
          scores: { approach: 1, completeness: 1, complexity: 1, communication: 1 },
          feedback: { strengths: [], improvements: ['Need to improve'] },
          idealSolution: 'solution()',
          missTags: [],
        });

        const result = service.parseEvaluationResponse(json);
        expect(result.feedback.strengths).toEqual([]);
        expect(result.feedback.improvements).toEqual(['Need to improve']);
      });
    });
  });

  describe('calculateFallbackVerdict', () => {
    it('should return Pass when total >= 13 and no category < 3', () => {
      const scores: RubricScores = { approach: 4, completeness: 4, complexity: 3, communication: 3 };
      expect(service.calculateFallbackVerdict(scores)).toBe('Pass');
    });

    it('should return Pass at boundary (total = 13, min = 3)', () => {
      const scores: RubricScores = { approach: 4, completeness: 3, complexity: 3, communication: 3 };
      expect(service.calculateFallbackVerdict(scores)).toBe('Pass');
    });

    it('should return Borderline when total >= 13 but has category < 3', () => {
      const scores: RubricScores = { approach: 4, completeness: 4, complexity: 4, communication: 2 };
      expect(service.calculateFallbackVerdict(scores)).toBe('Borderline');
    });

    it('should return No Pass when total <= 8', () => {
      const scores: RubricScores = { approach: 2, completeness: 2, complexity: 2, communication: 2 };
      expect(service.calculateFallbackVerdict(scores)).toBe('No Pass');
    });

    it('should return No Pass at boundary (total = 8)', () => {
      const scores: RubricScores = { approach: 2, completeness: 2, complexity: 2, communication: 2 };
      expect(service.calculateFallbackVerdict(scores)).toBe('No Pass');
    });

    it('should return No Pass when approach <= 1 regardless of total', () => {
      const scores: RubricScores = { approach: 1, completeness: 4, complexity: 4, communication: 4 };
      expect(service.calculateFallbackVerdict(scores)).toBe('No Pass');
    });

    it('should return No Pass when approach = 0', () => {
      const scores: RubricScores = { approach: 0, completeness: 4, complexity: 4, communication: 4 };
      expect(service.calculateFallbackVerdict(scores)).toBe('No Pass');
    });

    it('should return Borderline for total 9-12', () => {
      const scores: RubricScores = { approach: 3, completeness: 3, complexity: 2, communication: 2 };
      expect(service.calculateFallbackVerdict(scores)).toBe('Borderline');
    });

    it('should return Borderline at boundary (total = 9)', () => {
      const scores: RubricScores = { approach: 3, completeness: 2, complexity: 2, communication: 2 };
      expect(service.calculateFallbackVerdict(scores)).toBe('Borderline');
    });

    it('should return Borderline at boundary (total = 12)', () => {
      const scores: RubricScores = { approach: 3, completeness: 3, complexity: 3, communication: 3 };
      expect(service.calculateFallbackVerdict(scores)).toBe('Borderline');
    });
  });

  describe('validateEvaluationResult', () => {
    const validResult: EvaluationResult = {
      verdict: 'Pass',
      scores: { approach: 4, completeness: 4, complexity: 3, communication: 4 },
      feedback: { strengths: ['Good'], improvements: ['Better'] },
      idealSolution: 'function solution() {}',
      missTags: ['edge-cases'],
    };

    it('should return true for valid result', () => {
      expect(service.validateEvaluationResult(validResult)).toBe(true);
    });

    it('should return false for invalid verdict', () => {
      const invalid = { ...validResult, verdict: 'Maybe' as unknown as Verdict };
      expect(service.validateEvaluationResult(invalid)).toBe(false);
    });

    it('should return false for score out of range (> 4)', () => {
      const invalid = {
        ...validResult,
        scores: { ...validResult.scores, approach: 5 },
      };
      expect(service.validateEvaluationResult(invalid)).toBe(false);
    });

    it('should return false for score out of range (< 0)', () => {
      const invalid = {
        ...validResult,
        scores: { ...validResult.scores, approach: -1 },
      };
      expect(service.validateEvaluationResult(invalid)).toBe(false);
    });

    it('should return false for non-integer score', () => {
      const invalid = {
        ...validResult,
        scores: { ...validResult.scores, approach: 3.5 },
      };
      expect(service.validateEvaluationResult(invalid)).toBe(false);
    });

    it('should return false for empty idealSolution', () => {
      const invalid = { ...validResult, idealSolution: '' };
      expect(service.validateEvaluationResult(invalid)).toBe(false);
    });

    it('should return false for whitespace-only idealSolution', () => {
      const invalid = { ...validResult, idealSolution: '   ' };
      expect(service.validateEvaluationResult(invalid)).toBe(false);
    });

    it('should return false for too many miss tags', () => {
      const invalid = {
        ...validResult,
        missTags: [
          'edge-cases',
          'complexity-analysis',
          'incorrect-approach',
          'incomplete-solution',
          'unclear-communication',
        ] as MissTag[],
      };
      expect(service.validateEvaluationResult(invalid)).toBe(false);
    });

    it('should return false for invalid miss tag', () => {
      const invalid = {
        ...validResult,
        missTags: ['invalid-tag'] as unknown as MissTag[],
      };
      expect(service.validateEvaluationResult(invalid)).toBe(false);
    });

    it('should return true for empty miss tags array', () => {
      const valid = { ...validResult, missTags: [] };
      expect(service.validateEvaluationResult(valid)).toBe(true);
    });

    it('should return true for all valid miss tags', () => {
      const valid = {
        ...validResult,
        missTags: ['edge-cases', 'complexity-analysis', 'incorrect-approach', 'incomplete-solution'] as MissTag[],
      };
      expect(service.validateEvaluationResult(valid)).toBe(true);
    });
  });

  describe('extractMissTags', () => {
    it('should return miss tags from evaluation result', () => {
      const result: EvaluationResult = {
        verdict: 'Borderline',
        scores: { approach: 3, completeness: 2, complexity: 2, communication: 3 },
        feedback: { strengths: ['OK'], improvements: ['More'] },
        idealSolution: 'solution()',
        missTags: ['edge-cases', 'complexity-analysis'],
      };

      expect(service.extractMissTags(result)).toEqual(['edge-cases', 'complexity-analysis']);
    });

    it('should return empty array when no miss tags', () => {
      const result: EvaluationResult = {
        verdict: 'Pass',
        scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
        feedback: { strengths: ['Perfect'], improvements: ['None'] },
        idealSolution: 'solution()',
        missTags: [],
      };

      expect(service.extractMissTags(result)).toEqual([]);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(evaluationService).toBeInstanceOf(EvaluationService);
    });
  });
});


describe('getEvaluationWithRetry', () => {
  it('should return result on first successful parse', async () => {
    const validJson = JSON.stringify({
      verdict: 'Pass',
      scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
      feedback: { strengths: ['Great'], improvements: ['Minor'] },
      idealSolution: 'solution()',
      missTags: [],
    });

    const callLLM = vi.fn().mockResolvedValue(validJson);

    const result = await getEvaluationWithRetry({
      callLLM,
      prompt: 'Evaluate this',
    });

    expect(result.verdict).toBe('Pass');
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  it('should retry once on parse failure', async () => {
    const invalidJson = 'Not valid JSON';
    const validJson = JSON.stringify({
      verdict: 'Borderline',
      scores: { approach: 3, completeness: 3, complexity: 3, communication: 3 },
      feedback: { strengths: ['OK'], improvements: ['Better'] },
      idealSolution: 'solution()',
      missTags: [],
    });

    const callLLM = vi.fn()
      .mockResolvedValueOnce(invalidJson)
      .mockResolvedValueOnce(validJson);

    const result = await getEvaluationWithRetry({
      callLLM,
      prompt: 'Evaluate this',
    });

    expect(result.verdict).toBe('Borderline');
    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(callLLM.mock.calls[1][0]).toContain('IMPORTANT: Respond with ONLY valid JSON');
  });

  it('should throw after retry fails', async () => {
    const invalidJson = 'Not valid JSON';

    const callLLM = vi.fn().mockResolvedValue(invalidJson);

    await expect(getEvaluationWithRetry({
      callLLM,
      prompt: 'Evaluate this',
    })).rejects.toThrow(EvaluationParseError);

    expect(callLLM).toHaveBeenCalledTimes(2);
  });

  it('should not retry for non-parse errors', async () => {
    const callLLM = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(getEvaluationWithRetry({
      callLLM,
      prompt: 'Evaluate this',
    })).rejects.toThrow('Network error');

    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  it('should retry when idealSolution is missing', async () => {
    const missingIdeal = JSON.stringify({
      verdict: 'Pass',
      scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
      feedback: { strengths: ['Great'], improvements: ['Minor'] },
      missTags: [],
    });
    const validJson = JSON.stringify({
      verdict: 'Pass',
      scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
      feedback: { strengths: ['Great'], improvements: ['Minor'] },
      idealSolution: 'solution()',
      missTags: [],
    });

    const callLLM = vi.fn()
      .mockResolvedValueOnce(missingIdeal)
      .mockResolvedValueOnce(validJson);

    const result = await getEvaluationWithRetry({
      callLLM,
      prompt: 'Evaluate this',
    });

    expect(result.idealSolution).toBe('solution()');
    expect(callLLM).toHaveBeenCalledTimes(2);
  });
});
