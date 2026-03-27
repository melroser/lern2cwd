import { describe, it, expect } from 'vitest';
import { ProblemService } from '../problemService';

describe('Python Fundamentals problem set', () => {
  it('appears in available problem sets with the expected question count', () => {
    const service = new ProblemService();

    const setOption = service.getAvailableProblemSets().find((set) => set.id === 'python-fundamentals');

    expect(setOption).toBeDefined();
    expect(setOption?.label).toBe('Python Fundamentals');
    expect(setOption?.questionCount).toBe(12);
  });

  it('loads only python fundamentals problems when selected explicitly', async () => {
    const service = new ProblemService();

    const problems = await service.loadProblems(['python-fundamentals']);

    expect(problems).toHaveLength(12);
    expect(problems.every((problem) => problem.problemSetId === 'python-fundamentals')).toBe(true);
    expect(problems.every((problem) => problem.language === 'python')).toBe(true);
    expect(problems.some((problem) => problem.id === 'fde-csv-min-max-scanner')).toBe(true);
    expect(problems.some((problem) => problem.id === 'fde-dp-table-grid-paths')).toBe(true);
  });
});
