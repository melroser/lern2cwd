/**
 * Unit tests for ProblemService
 * 
 * Tests the problem bank management functionality:
 * - loadProblems(): Returns all problems
 * - getRandomProblem(excludeIds): Returns a random problem not in the exclusion list
 * - getProblemById(id): Returns problem by id or null
 * 
 * Requirements: 8.3, 8.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProblemService } from '../problemService';
import { problems } from '../../data/problems';

describe('ProblemService', () => {
  let service: ProblemService;

  beforeEach(() => {
    service = new ProblemService();
  });

  describe('loadProblems', () => {
    it('should return all problems from the problem bank', async () => {
      const loadedProblems = await service.loadProblems();
      
      expect(loadedProblems).toHaveLength(problems.length);
      expect(loadedProblems).toEqual(problems);
    });

    it('should return problems with all required fields', async () => {
      const loadedProblems = await service.loadProblems();
      
      loadedProblems.forEach((problem) => {
        expect(problem).toHaveProperty('id');
        expect(problem).toHaveProperty('language');
        expect(problem).toHaveProperty('title');
        expect(problem).toHaveProperty('difficulty');
        expect(problem).toHaveProperty('timeLimit');
        expect(problem).toHaveProperty('prompt');
        expect(problem).toHaveProperty('constraints');
        expect(problem).toHaveProperty('scaffold');
        expect(problem).toHaveProperty('examples');
        expect(problem).toHaveProperty('expectedApproach');
        expect(problem).toHaveProperty('commonPitfalls');
        expect(problem).toHaveProperty('idealSolutionOutline');
        expect(problem).toHaveProperty('evaluationNotes');
      });
    });
  });

  describe('getRandomProblem', () => {
    it('should return a problem when no exclusion list is provided', async () => {
      await service.loadProblems();
      
      const problem = service.getRandomProblem();
      
      expect(problem).toBeDefined();
      expect(problem.id).toBeDefined();
      expect(problems.some((p) => p.id === problem.id)).toBe(true);
    });

    it('should return a problem when exclusion list is empty', async () => {
      await service.loadProblems();
      
      const problem = service.getRandomProblem([]);
      
      expect(problem).toBeDefined();
      expect(problem.id).toBeDefined();
    });

    it('should not return a problem in the exclusion list', async () => {
      await service.loadProblems();
      
      // Exclude all but one problem
      const excludeIds = problems.slice(0, -1).map((p) => p.id);
      const problem = service.getRandomProblem(excludeIds);
      
      expect(problem).toBeDefined();
      expect(excludeIds).not.toContain(problem.id);
    });

    it('should return any problem when all problems are excluded', async () => {
      await service.loadProblems();
      
      // Exclude all problems
      const excludeIds = problems.map((p) => p.id);
      const problem = service.getRandomProblem(excludeIds);
      
      // Should still return a problem (fallback behavior)
      expect(problem).toBeDefined();
      expect(problem.id).toBeDefined();
    });

    it('should work without calling loadProblems first', () => {
      // Don't call loadProblems - service should load on demand
      const problem = service.getRandomProblem();
      
      expect(problem).toBeDefined();
      expect(problem.id).toBeDefined();
    });

    it('should return different problems over multiple calls (statistical test)', async () => {
      await service.loadProblems();
      
      // If we have multiple problems, calling getRandomProblem many times
      // should eventually return different problems
      if (problems.length > 1) {
        const selectedIds = new Set<string>();
        
        // Call 50 times to increase chance of getting different problems
        for (let i = 0; i < 50; i++) {
          const problem = service.getRandomProblem();
          selectedIds.add(problem.id);
        }
        
        // With 5 problems and 50 calls, we should get at least 2 different problems
        expect(selectedIds.size).toBeGreaterThan(1);
      }
    });
  });

  describe('getProblemById', () => {
    it('should return the correct problem for a valid id', async () => {
      await service.loadProblems();
      
      const problem = service.getProblemById('fizzbuzz');
      
      expect(problem).toBeDefined();
      expect(problem?.id).toBe('fizzbuzz');
      expect(problem?.title).toBe('FizzBuzz');
    });

    it('should return null for an invalid id', async () => {
      await service.loadProblems();
      
      const problem = service.getProblemById('non-existent-problem');
      
      expect(problem).toBeNull();
    });

    it('should return null for an empty id', async () => {
      await service.loadProblems();
      
      const problem = service.getProblemById('');
      
      expect(problem).toBeNull();
    });

    it('should work without calling loadProblems first', () => {
      // Don't call loadProblems - service should load on demand
      const problem = service.getProblemById('two-sum');
      
      expect(problem).toBeDefined();
      expect(problem?.id).toBe('two-sum');
    });

    it('should return all known problems by their ids', async () => {
      await service.loadProblems();
      
      const knownIds = ['fizzbuzz', 'two-sum', 'valid-parentheses', 'reverse-string', 'palindrome-number'];
      
      knownIds.forEach((id) => {
        const problem = service.getProblemById(id);
        expect(problem).toBeDefined();
        expect(problem?.id).toBe(id);
      });
    });
  });
});
