import { describe, it, expect, beforeEach } from 'vitest';
import { ProctorService } from '../proctorService';
import type { Problem, SessionContext } from '../../types';

const twoSumSortedProblem: Problem = {
  id: 'neet-two-sum-ii-input-array-sorted',
  language: 'python',
  title: 'Two Sum II Input Array Sorted',
  difficulty: 'easy',
  timeLimit: 20,
  prompt: 'Given a sorted array `numbers` and an integer `target`, return the 1-indexed positions `[i, j]` of the two values whose sum is `target`. In Python, access `numbers` normally with 0-based indexing; only the returned positions are 1-indexed.',
  constraints: [
    '2 <= len(numbers) <= 100000',
    'Input array is sorted in non-decreasing order',
    'Exactly one solution exists; return 1-indexed positions, not 0-indexed Python offsets',
  ],
  scaffold: 'def two_sum_ii_input_array_sorted(numbers: list[int], target: int) -> list[int]:\n    pass',
  examples: [
    {
      input: 'numbers = [2,7,11,15], target = 9',
      output: '[1,2]',
      explanation: '2 + 7 = 9, so return positions 1 and 2.',
    },
  ],
  expectedApproach: 'Use two pointers and return 1-indexed positions.',
  commonPitfalls: [
    'Mixing up 0-based Python indexing with 1-based returned positions',
  ],
  idealSolutionOutline: 'Use left/right pointers and return [left + 1, right + 1].',
  evaluationNotes: 'Reward correct two-pointer reasoning.',
  assessmentType: 'coding',
  domain: 'neetcode-50',
};

const createContext = (currentCode = twoSumSortedProblem.scaffold): SessionContext => ({
  problem: twoSumSortedProblem,
  currentCode,
  chatHistory: [],
  timeRemaining: 900,
});

const behavioralProblem: Problem = {
  id: 'behavioral-defining-success-metrics',
  language: 'python',
  title: 'Behavioral Interview: Defining Success Metrics',
  difficulty: 'medium',
  timeLimit: 20,
  prompt: 'Describe how you define success metrics before building. Answer naturally (paragraph or structured format), and show ownership, decision quality, and impact.',
  constraints: [
    'Any clear format is acceptable (paragraph or structured).',
    'Be specific about what you did and why.',
    'Include outcome and impact; measurable signals help when available.',
    'Close with what you learned or would do differently.',
  ],
  scaffold: '# Write your response here.\n# Any clear format is acceptable (paragraph or structured).\n# Include decision, action, impact, and what you learned.',
  examples: [
    {
      input: 'Describe how you define success metrics before building.',
      output: 'Strong behavioral response (clear decision, action, and outcome).',
      explanation: 'Strong answers are concrete, credible, and reflective; STAR is optional.',
    },
  ],
  expectedApproach: 'Use one real example, explain the decision, and show impact.',
  commonPitfalls: [
    'Staying abstract and never naming a specific example or result.',
  ],
  idealSolutionOutline: 'A concise story with context, decision, measurable outcome, and reflection.',
  evaluationNotes: 'Reward specificity, ownership, and measurable impact.',
  assessmentType: 'behavioral',
  domain: 'behavioral-software-engineering',
};

const createBehavioralContext = (currentCode = behavioralProblem.scaffold): SessionContext => ({
  problem: behavioralProblem,
  currentCode,
  chatHistory: [],
  timeRemaining: 900,
});

describe('ProctorService grounding', () => {
  let service: ProctorService;

  beforeEach(() => {
    service = new ProctorService();
  });

  it('explains 1-indexing as a return-value detail instead of shifting Python list access', async () => {
    const response = await service.respondToQuestion('what does it mean by 1-indexed?', createContext());

    expect(response).toMatch(/returned positions|return.*1-indexed|left \+ 1|right \+ 1/i);
    expect(response).toMatch(/0-based indexing|access .*0-based|python list/i);
    expect(response).not.toMatch(/left should start at 1/i);
  });

  it('explains two pointers in Python as integer indices and why sorted order helps', async () => {
    const response = await service.respondToQuestion(
      "well there arent pointers in python so what are you talking about?",
      createContext()
    );

    expect(response).toMatch(/integer indices|left.*right/i);
    expect(response).toMatch(/sorted/i);
    expect(response).toMatch(/increase|decrease/i);
  });

  it('grounds review feedback in the visible code instead of asking the user to paste it again', async () => {
    const currentCode = `def two_sum_ii_input_array_sorted(numbers: list[int], target: int) -> list[int]:
    left = 1
    right = len(numbers)

    while left < right:
        total = numbers[left] + numbers[right - 1]
        if total == target:
            return [left, right]
        if total < target:
            left += 1
        else:
            right -= 1
`;

    const response = await service.respondToQuestion(
      'thats literally what i did. cant you see??',
      createContext(currentCode)
    );

    expect(response).toMatch(/0-based|left = 0|right = len\(numbers\) - 1|return \[left \+ 1, right \+ 1\]/i);
    expect(response).not.toMatch(/show me|can you show|share your|paste/i);
  });

  it('prefers two pointers over a hashmap for the sorted two-sum variant', async () => {
    const response = await service.respondToQuestion(
      'which data structure should i use?',
      createContext()
    );

    expect(response).toMatch(/two pointers|left.*right/i);
    expect(response).not.toMatch(/hash map from value to index/i);
  });

  it('reviews a behavioral draft directly when the candidate asks "how is that?"', async () => {
    const response = await service.respondToQuestion(
      'how is that?',
      createBehavioralContext(`# Write your response here.
# Any clear format is acceptable (paragraph or structured).
# Include decision, action, impact, and what you learned.

I define success metrics with whoever I'm working with, but on my own I try to focus on what gets shipped, seen by customers, and moves a real needle.
On a recent project I used PostHog to measure signups and engagement before we rolled the feature out.`)
    );

    expect(response).not.toMatch(/coding problem|algorithm|function signature|two-pointer|big o/i);
    expect(response).toMatch(/good start|working|believable|specific/i);
    expect(response).toMatch(/project|decision|outcome|metric|learned/i);
  });

  it('overrides a bad llm-style coding reply when the assessment is behavioral', () => {
    const response = (service as unknown as {
      enforceCriticalCoaching: (question: string, context: SessionContext, llmResponse: string) => string;
    }).enforceCriticalCoaching(
      'how is that?',
      createBehavioralContext(`I used PostHog to measure signups before launch and aligned on that metric with product.`),
      "It looks like you're still working on the coding problem. Could you share your updated loop structure?"
    );

    expect(response).not.toMatch(/coding problem|loop structure/i);
    expect(response).toMatch(/working|interview-ready|metric|outcome|learned/i);
  });
});
