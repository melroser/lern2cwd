import { describe, it, expect } from 'vitest';
import { ProblemService } from '../problemService';

describe('Python Intermediate problem set', () => {
  it('appears in available problem sets with the expected question count', () => {
    const service = new ProblemService();

    const setOption = service.getAvailableProblemSets().find((set) => set.id === 'python-intermediate');

    expect(setOption).toBeDefined();
    expect(setOption?.label).toBe('Python Intermediate');
    expect(setOption?.questionCount).toBe(15);
  });

  it('loads python, sql, yaml, and dockerfile tasks for the set', async () => {
    const service = new ProblemService();

    const problems = await service.loadProblems(['python-intermediate']);

    expect(problems).toHaveLength(15);
    expect(problems.every((problem) => problem.problemSetId === 'python-intermediate')).toBe(true);
    expect(problems.some((problem) => problem.language === 'python')).toBe(true);
    expect(problems.some((problem) => problem.language === 'sql')).toBe(true);
    expect(problems.some((problem) => problem.language === 'yaml')).toBe(true);
    expect(problems.some((problem) => problem.language === 'dockerfile')).toBe(true);
    expect(problems.some((problem) => problem.id === 'fde2-fastapi-health-endpoint')).toBe(true);
    expect(problems.some((problem) => problem.id === 'fde2-compose-api-postgres')).toBe(true);
  });
});
