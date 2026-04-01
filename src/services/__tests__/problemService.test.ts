import { describe, expect, it } from 'vitest';
import { ProblemService } from '../problemService';

describe('ProblemService', () => {
  it('loads only the selected problem sets', async () => {
    const service = new ProblemService();
    const problems = await service.loadProblems(['python-fundamentals']);

    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((problem) => problem.problemSetId === 'python-fundamentals')).toBe(true);
  });

  it('returns metadata for all registered problem sets with counts', () => {
    const service = new ProblemService();
    const sets = service.getAvailableProblemSets();

    expect(sets.find((set) => set.id === 'neetcode-50')?.questionCount).toBeGreaterThan(0);
    expect(sets.find((set) => set.id === 'python-intermediate')?.questionCount).toBeGreaterThan(0);
    expect(sets.find((set) => set.id === 'synthbee-conversational-screen')?.assessmentType).toBe('behavioral');
  });

  it('resolves known problems by id from the currently selected pool', async () => {
    const service = new ProblemService();
    await service.loadProblems(['neetcode-50']);

    const problem = service.getProblemById('neet-valid-sudoku');
    expect(problem?.id).toBe('neet-valid-sudoku');
    expect(problem?.problemSetId).toBe('neetcode-50');
  });

  it('returns a random problem outside the exclusion list when possible', async () => {
    const service = new ProblemService();
    const problems = await service.loadProblems(['python-fundamentals']);
    const excluded = problems.slice(0, Math.max(0, problems.length - 1)).map((problem) => problem.id);

    const randomProblem = service.getRandomProblem(excluded);
    expect(excluded.includes(randomProblem.id)).toBe(false);
  });
});
