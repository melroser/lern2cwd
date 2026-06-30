import { describe, expect, it } from 'vitest';
import { ProblemService } from '../problemService';

describe('ProblemService', () => {
  it('loads the tutorial when no problem sets are selected', async () => {
    const service = new ProblemService();
    const problems = await service.loadProblems([]);

    expect(problems).toHaveLength(1);
    expect(problems[0].problemSetId).toBe('tutorial');
    expect(problems[0].title).toMatch(/tutorial question/i);
    expect(problems[0].tutorPlan?.openingPrompt).toMatch(/first impression/i);
    expect(problems[0].tutorPlan?.openingPrompt).not.toContain('measurable result');
  });

  it('loads only the selected problem sets', async () => {
    const service = new ProblemService();
    const problems = await service.loadProblems(['python-fundamentals']);

    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((problem) => problem.problemSetId === 'python-fundamentals')).toBe(true);
  });

  it('starts Python fundamentals with beginner list practice and plain tutor guidance', async () => {
    const service = new ProblemService();
    const problems = await service.loadProblems(['python-fundamentals']);

    expect(problems[0].title).toBe('Double Each Number');
    expect(problems[0].prompt).toMatch(/list of integers/i);
    expect(problems[0].prompt).not.toMatch(/csv|file path|column/i);
    expect(problems[0].tutorPlan?.openingPrompt).toBe(
      'Start by restating the input and output, then name the first Python step you would code.',
    );
    expect(problems[0].tutorPlan?.openingPrompt).not.toMatch(/complexity are you aiming/i);
  });

  it('returns metadata for all registered problem sets with counts', () => {
    const service = new ProblemService();
    const sets = service.getAvailableProblemSets();

    expect(sets.find((set) => set.id === 'tutorial')?.questionCount).toBe(1);
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

  it('returns the tutorial as the default random problem for a fresh service', () => {
    const service = new ProblemService();

    expect(service.getRandomProblem().problemSetId).toBe('tutorial');
  });
});
