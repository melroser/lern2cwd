import { describe, it, expect } from 'vitest';
import { ProblemService } from '../problemService';

describe('Imported interview problem sets', () => {
  it('registers the new problem sets with the expected counts', () => {
    const service = new ProblemService();
    const sets = service.getAvailableProblemSets();

    expect(sets.find((set) => set.id === 'outrival-experimentation-statistics')).toMatchObject({
      label: 'Outrival Experimentation & Statistics',
      questionCount: 20,
    });
    expect(sets.find((set) => set.id === 'outrival-platform-reliability')).toMatchObject({
      label: 'Outrival Platform Reliability',
      questionCount: 20,
    });
    expect(sets.find((set) => set.id === 'synthbee-william-screen')).toMatchObject({
      label: 'SynthBee William Screen',
      questionCount: 12,
    });
    expect(sets.find((set) => set.id === 'synthbee-conversational-screen')).toMatchObject({
      label: 'SynthBee Conversational Screen',
      questionCount: 6,
    });
  });

  it('loads the new Outrival sets with their expected assessment mix', async () => {
    const service = new ProblemService();

    const experimentation = await service.loadProblems(['outrival-experimentation-statistics']);
    const platform = await service.loadProblems(['outrival-platform-reliability']);

    expect(experimentation).toHaveLength(20);
    expect(experimentation.some((problem) => problem.assessmentType === 'math')).toBe(true);
    expect(experimentation.some((problem) => problem.assessmentType === 'behavioral')).toBe(true);
    expect(experimentation.every((problem) => problem.problemSetId === 'outrival-experimentation-statistics')).toBe(true);

    expect(platform).toHaveLength(20);
    expect(platform.some((problem) => problem.assessmentType === 'behavioral')).toBe(true);
    expect(platform.some((problem) => problem.assessmentType === 'system-design')).toBe(true);
    expect(platform.every((problem) => problem.problemSetId === 'outrival-platform-reliability')).toBe(true);
  });

  it('preserves custom behavioral scaffolds for imported SynthBee prompts', async () => {
    const service = new ProblemService();

    const william = await service.loadProblems(['synthbee-william-screen']);
    const conversational = await service.loadProblems(['synthbee-conversational-screen']);

    expect(william).toHaveLength(12);
    expect(conversational).toHaveLength(6);

    const williamIntro = william.find((problem) => problem.id === 'synthbee-william-screen-1');
    const conversationalIntro = conversational.find((problem) => problem.id === 'synthbee-conversational-screen-1');

    expect(williamIntro?.scaffold).toContain('# Focus on systems, product engineering, and AI-enabled workflows.');
    expect(conversationalIntro?.scaffold).toContain('# Cover background, strengths, recent direction, and role fit.');
    expect(williamIntro?.contract?.responseMode).toBe('narrative');
    expect(conversationalIntro?.contract?.responseMode).toBe('narrative');
  });
});
