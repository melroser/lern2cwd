/**
 * Tests for Proctor Prompts
 * 
 * Validates that the prompt generation functions work correctly
 * and produce prompts that meet the requirements.
 * 
 * Requirements: 3.2, 3.3, 3.4, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 9.2
 */

import { describe, it, expect } from 'vitest';
import {
  getLiveChatSystemPrompt,
  getLiveChatUserPrompt,
  getEvaluationSystemPrompt,
  getEvaluationUserPrompt,
  truncateChatHistory,
  formatChatHistory,
  buildLiveChatPrompt,
  buildEvaluationPrompt,
  type LiveChatPromptParams,
  type EvaluationPromptParams,
} from '../proctorPrompts';
import type { Problem, ChatMessage } from '../../types';

// =============================================================================
// Test Fixtures
// =============================================================================

const mockProblem: Problem = {
  id: 'two-sum',
  language: 'javascript',
  title: 'Two Sum',
  difficulty: 'easy',
  timeLimit: 30,
  prompt: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
  constraints: [
    '2 <= nums.length <= 10^4',
    '-10^9 <= nums[i] <= 10^9',
    'Only one valid answer exists',
  ],
  scaffold: 'function twoSum(nums, target) {\n  // Your code here\n}',
  examples: [
    { input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: 'Because nums[0] + nums[1] == 9' },
  ],
  expectedApproach: 'Use a hash map to store seen numbers and their indices',
  commonPitfalls: ['Using nested loops (O(n²))', 'Not handling duplicate values'],
  idealSolutionOutline: 'Single pass with hash map lookup for complement',
  evaluationNotes: 'Look for understanding of hash map optimization',
};

const mockPythonProblem: Problem = {
  ...mockProblem,
  id: 'two-sum-python',
  language: 'python',
  scaffold: 'def two_sum(nums, target):\n    # Your code here\n    pass',
};

const mockTypeScriptProblem: Problem = {
  ...mockProblem,
  id: 'two-sum-ts',
  language: 'typescript',
  scaffold: 'function twoSum(nums: number[], target: number): number[] {\n  // Your code here\n}',
};

const mockChatHistory: ChatMessage[] = [
  { id: '1', role: 'proctor', content: 'Welcome! Let\'s work on Two Sum.', timestamp: 1000 },
  { id: '2', role: 'user', content: 'Can I use a hash map?', timestamp: 2000 },
  { id: '3', role: 'proctor', content: 'Yes, that\'s a great approach!', timestamp: 3000 },
];

const mockCode = `function twoSum(nums, target) {
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) {
      return [map.get(complement), i];
    }
    map.set(nums[i], i);
  }
}`;

// =============================================================================
// Live Chat System Prompt Tests
// =============================================================================

describe('getLiveChatSystemPrompt', () => {
  it('should include the correct language in the prompt', () => {
    const prompt = getLiveChatSystemPrompt('javascript');
    expect(prompt).toContain('JavaScript');
    expect(prompt).toContain('coding assessment simulator');
  });

  it('should include Python language when specified', () => {
    const prompt = getLiveChatSystemPrompt('python');
    expect(prompt).toContain('Python');
  });

  it('should include TypeScript language when specified', () => {
    const prompt = getLiveChatSystemPrompt('typescript');
    expect(prompt).toContain('TypeScript');
  });

  it('should include friendly interviewer behavior instructions', () => {
    const prompt = getLiveChatSystemPrompt('javascript');
    expect(prompt).toContain('friendly, supportive interviewer');
    expect(prompt).toContain('Help the candidate succeed');
  });

  it('should include hint ladder instructions', () => {
    const prompt = getLiveChatSystemPrompt('javascript');
    expect(prompt).toContain('hint ladder');
    expect(prompt).toContain('high-level approach');
    expect(prompt).toContain('key insight');
    expect(prompt).toContain('edge cases');
    expect(prompt).toContain('pseudocode snippet');
  });

  it('should include max 1 clarifying question rule', () => {
    const prompt = getLiveChatSystemPrompt('javascript');
    expect(prompt).toContain('at most ONE clarifying question');
  });

  it('should include no full solutions rule', () => {
    const prompt = getLiveChatSystemPrompt('javascript');
    expect(prompt).toContain('Do NOT write the complete solution');
  });

  it('should include time management guidance rule', () => {
    const prompt = getLiveChatSystemPrompt('javascript');
    expect(prompt).toContain('under 5 minutes');
    expect(prompt).toContain('time management');
  });

  it('should include tone guidelines', () => {
    const prompt = getLiveChatSystemPrompt('javascript');
    expect(prompt).toContain('calm, encouraging');
    expect(prompt).toContain('not overly formal');
  });

  it('should not be pedantic about syntax', () => {
    const prompt = getLiveChatSystemPrompt('javascript');
    expect(prompt).toContain('Never be pedantic about tiny syntax');
  });
});

// =============================================================================
// Live Chat User Prompt Tests
// =============================================================================

describe('getLiveChatUserPrompt', () => {
  const baseParams: LiveChatPromptParams = {
    problem: mockProblem,
    currentCode: mockCode,
    chatHistory: mockChatHistory,
    timeRemaining: 1500,
    candidateMessage: 'How do I handle edge cases?',
  };

  it('should include problem title and prompt', () => {
    const prompt = getLiveChatUserPrompt(baseParams);
    expect(prompt).toContain('PROBLEM: Two Sum');
    expect(prompt).toContain('Given an array of integers');
  });

  it('should include constraints', () => {
    const prompt = getLiveChatUserPrompt(baseParams);
    expect(prompt).toContain('CONSTRAINTS / NOTES:');
    expect(prompt).toContain('2 <= nums.length <= 10^4');
    expect(prompt).toContain('Only one valid answer exists');
  });

  it('should include current editor text', () => {
    const prompt = getLiveChatUserPrompt(baseParams);
    expect(prompt).toContain("CANDIDATE'S CURRENT EDITOR TEXT:");
    expect(prompt).toContain('const map = new Map()');
  });

  it('should include chat history', () => {
    const prompt = getLiveChatUserPrompt(baseParams);
    expect(prompt).toContain('CHAT HISTORY');
    expect(prompt).toContain('[PROCTOR]: Welcome!');
    expect(prompt).toContain('[CANDIDATE]: Can I use a hash map?');
  });

  it('should include time remaining', () => {
    const prompt = getLiveChatUserPrompt(baseParams);
    expect(prompt).toContain('TIME REMAINING (seconds): 1500');
  });

  it('should include candidate message', () => {
    const prompt = getLiveChatUserPrompt(baseParams);
    expect(prompt).toContain('CANDIDATE MESSAGE:');
    expect(prompt).toContain('How do I handle edge cases?');
  });

  it('should handle empty code', () => {
    const params = { ...baseParams, currentCode: '' };
    const prompt = getLiveChatUserPrompt(params);
    expect(prompt).toContain('(empty)');
  });

  it('should handle empty chat history', () => {
    const params = { ...baseParams, chatHistory: [] };
    const prompt = getLiveChatUserPrompt(params);
    expect(prompt).toContain('(no previous messages)');
  });

  it('should handle problem with no constraints', () => {
    const params = {
      ...baseParams,
      problem: { ...mockProblem, constraints: [] },
    };
    const prompt = getLiveChatUserPrompt(params);
    expect(prompt).toContain('None specified');
  });
});

// =============================================================================
// Evaluation System Prompt Tests
// =============================================================================

describe('getEvaluationSystemPrompt', () => {
  it('should include the correct language in the prompt', () => {
    const prompt = getEvaluationSystemPrompt('javascript');
    expect(prompt).toContain('JavaScript');
    expect(prompt).toContain('coding assessment simulator');
  });

  it('should include Python language when specified', () => {
    const prompt = getEvaluationSystemPrompt('python');
    expect(prompt).toContain('Python');
    expect(prompt).toContain('clean code in Python');
  });

  it('should include rubric scoring instructions (0-4)', () => {
    const prompt = getEvaluationSystemPrompt('javascript');
    expect(prompt).toContain('Rubric scoring (0–4 each)');
    expect(prompt).toContain('approach:');
    expect(prompt).toContain('completeness:');
    expect(prompt).toContain('complexity:');
    expect(prompt).toContain('communication:');
  });

  it('should include verdict rules', () => {
    const prompt = getEvaluationSystemPrompt('javascript');
    expect(prompt).toContain('Verdict rules:');
    expect(prompt).toContain('Pass: total >= 13 AND no category below 3');
    expect(prompt).toContain('Borderline: total 9–12');
    expect(prompt).toContain('No Pass: total <= 8 OR approach score is 0 or 1');
  });

  it('should include miss tags list', () => {
    const prompt = getEvaluationSystemPrompt('javascript');
    expect(prompt).toContain('Miss tags:');
    expect(prompt).toContain('edge-cases');
    expect(prompt).toContain('complexity-analysis');
    expect(prompt).toContain('incorrect-approach');
    expect(prompt).toContain('incomplete-solution');
    expect(prompt).toContain('unclear-communication');
    expect(prompt).toContain('wrong-data-structure');
    expect(prompt).toContain('off-by-one');
    expect(prompt).toContain('constraints-missed');
    expect(prompt).toContain('testing-mentality');
  });

  it('should require JSON output', () => {
    const prompt = getEvaluationSystemPrompt('javascript');
    expect(prompt).toContain('Output MUST be valid JSON and nothing else');
  });

  it('should include evaluation guidelines', () => {
    const prompt = getEvaluationSystemPrompt('javascript');
    expect(prompt).toContain('Evaluate intent and logic, not syntax');
    expect(prompt).toContain('Accept pseudocode as valid');
    expect(prompt).toContain('Infer missing minor syntax');
    expect(prompt).toContain('DO NOT invent missing logic');
  });

  it('should include feedback guidelines', () => {
    const prompt = getEvaluationSystemPrompt('javascript');
    expect(prompt).toContain('2–3 high-impact improvements');
    expect(prompt).toContain('First say what is correct');
    expect(prompt).toContain('do not shame');
  });

  it('should require ideal solution in the problem language', () => {
    const jsPrompt = getEvaluationSystemPrompt('javascript');
    expect(jsPrompt).toContain('clean code in JavaScript');

    const pyPrompt = getEvaluationSystemPrompt('python');
    expect(pyPrompt).toContain('clean code in Python');

    const tsPrompt = getEvaluationSystemPrompt('typescript');
    expect(tsPrompt).toContain('clean code in TypeScript');
  });
});

// =============================================================================
// Evaluation User Prompt Tests
// =============================================================================

describe('getEvaluationUserPrompt', () => {
  const baseParams: EvaluationPromptParams = {
    problem: mockProblem,
    finalCode: mockCode,
    chatHistory: mockChatHistory,
    durationSeconds: 1200,
  };

  it('should include problem title and prompt', () => {
    const prompt = getEvaluationUserPrompt(baseParams);
    expect(prompt).toContain('PROBLEM: Two Sum');
    expect(prompt).toContain('Given an array of integers');
  });

  it('should include constraints', () => {
    const prompt = getEvaluationUserPrompt(baseParams);
    expect(prompt).toContain('CONSTRAINTS / NOTES:');
    expect(prompt).toContain('2 <= nums.length <= 10^4');
  });

  it('should include problem metadata for consistent evaluation', () => {
    const prompt = getEvaluationUserPrompt(baseParams);
    expect(prompt).toContain('PROBLEM METADATA (for consistent evaluation)');
    expect(prompt).toContain('Expected approach: Use a hash map');
    expect(prompt).toContain('Common pitfalls:');
    expect(prompt).toContain('Using nested loops');
    expect(prompt).toContain('Ideal solution outline: Single pass with hash map');
  });

  it('should include final editor text', () => {
    const prompt = getEvaluationUserPrompt(baseParams);
    expect(prompt).toContain("CANDIDATE'S FINAL EDITOR TEXT:");
    expect(prompt).toContain('const map = new Map()');
  });

  it('should include chat transcript', () => {
    const prompt = getEvaluationUserPrompt(baseParams);
    expect(prompt).toContain('CHAT TRANSCRIPT:');
    expect(prompt).toContain('[PROCTOR]: Welcome!');
    expect(prompt).toContain('[CANDIDATE]: Can I use a hash map?');
  });

  it('should include time spent', () => {
    const prompt = getEvaluationUserPrompt(baseParams);
    expect(prompt).toContain('TIME SPENT (seconds): 1200');
  });

  it('should handle empty code', () => {
    const params = { ...baseParams, finalCode: '' };
    const prompt = getEvaluationUserPrompt(params);
    expect(prompt).toContain('(empty)');
  });

  it('should handle empty chat history', () => {
    const params = { ...baseParams, chatHistory: [] };
    const prompt = getEvaluationUserPrompt(params);
    expect(prompt).toContain('(no messages)');
  });

  it('should handle problem with no common pitfalls', () => {
    const params = {
      ...baseParams,
      problem: { ...mockProblem, commonPitfalls: [] },
    };
    const prompt = getEvaluationUserPrompt(params);
    expect(prompt).toContain('Common pitfalls:\nNone specified');
  });
});

// =============================================================================
// Chat History Truncation Tests
// =============================================================================

describe('truncateChatHistory', () => {
  it('should return empty array for empty input', () => {
    expect(truncateChatHistory([])).toEqual([]);
  });

  it('should return all messages if under limit', () => {
    const messages = mockChatHistory;
    const result = truncateChatHistory(messages, 12);
    expect(result).toEqual(messages);
  });

  it('should truncate to last N turns keeping first message', () => {
    // Create 15 messages
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 15; i++) {
      messages.push({
        id: String(i),
        role: i % 2 === 0 ? 'proctor' : 'user',
        content: `Message ${i}`,
        timestamp: i * 1000,
      });
    }

    const result = truncateChatHistory(messages, 12);
    
    // Should have 12 messages: first + last 11
    expect(result.length).toBe(12);
    expect(result[0].content).toBe('Message 0'); // First message preserved
    expect(result[result.length - 1].content).toBe('Message 14'); // Last message preserved
  });

  it('should handle exactly 12 messages', () => {
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 12; i++) {
      messages.push({
        id: String(i),
        role: i % 2 === 0 ? 'proctor' : 'user',
        content: `Message ${i}`,
        timestamp: i * 1000,
      });
    }

    const result = truncateChatHistory(messages, 12);
    expect(result.length).toBe(12);
    expect(result).toEqual(messages);
  });

  it('should use default max turns of 12', () => {
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push({
        id: String(i),
        role: i % 2 === 0 ? 'proctor' : 'user',
        content: `Message ${i}`,
        timestamp: i * 1000,
      });
    }

    const result = truncateChatHistory(messages);
    expect(result.length).toBe(12);
  });
});

// =============================================================================
// Chat History Formatting Tests
// =============================================================================

describe('formatChatHistory', () => {
  it('should return empty string for empty input', () => {
    expect(formatChatHistory([])).toBe('');
  });

  it('should format messages with correct role labels', () => {
    const result = formatChatHistory(mockChatHistory);
    expect(result).toContain('[PROCTOR]: Welcome!');
    expect(result).toContain('[CANDIDATE]: Can I use a hash map?');
    expect(result).toContain('[PROCTOR]: Yes, that\'s a great approach!');
  });

  it('should separate messages with double newlines', () => {
    const result = formatChatHistory(mockChatHistory);
    expect(result).toContain('\n\n');
  });
});

// =============================================================================
// Build Prompt Convenience Functions Tests
// =============================================================================

describe('buildLiveChatPrompt', () => {
  it('should return both system and user prompts', () => {
    const params: LiveChatPromptParams = {
      problem: mockProblem,
      currentCode: mockCode,
      chatHistory: mockChatHistory,
      timeRemaining: 1500,
      candidateMessage: 'Help!',
    };

    const result = buildLiveChatPrompt(params);
    
    expect(result).toHaveProperty('systemPrompt');
    expect(result).toHaveProperty('userPrompt');
    expect(result.systemPrompt).toContain('JavaScript');
    expect(result.userPrompt).toContain('Two Sum');
  });

  it('should use the problem language for system prompt', () => {
    const params: LiveChatPromptParams = {
      problem: mockPythonProblem,
      currentCode: '',
      chatHistory: [],
      timeRemaining: 1500,
      candidateMessage: 'Help!',
    };

    const result = buildLiveChatPrompt(params);
    expect(result.systemPrompt).toContain('Python');
  });
});

describe('buildEvaluationPrompt', () => {
  it('should return both system and user prompts', () => {
    const params: EvaluationPromptParams = {
      problem: mockProblem,
      finalCode: mockCode,
      chatHistory: mockChatHistory,
      durationSeconds: 1200,
    };

    const result = buildEvaluationPrompt(params);
    
    expect(result).toHaveProperty('systemPrompt');
    expect(result).toHaveProperty('userPrompt');
    expect(result.systemPrompt).toContain('JavaScript');
    expect(result.userPrompt).toContain('Two Sum');
  });

  it('should use the problem language for system prompt', () => {
    const params: EvaluationPromptParams = {
      problem: mockTypeScriptProblem,
      finalCode: '',
      chatHistory: [],
      durationSeconds: 1200,
    };

    const result = buildEvaluationPrompt(params);
    expect(result.systemPrompt).toContain('TypeScript');
    expect(result.systemPrompt).toContain('clean code in TypeScript');
  });
});

// =============================================================================
// Language-Specific Tests
// =============================================================================

describe('Language-specific prompt generation', () => {
  it('should generate JavaScript prompts correctly', () => {
    const systemPrompt = getLiveChatSystemPrompt('javascript');
    const evalPrompt = getEvaluationSystemPrompt('javascript');
    
    expect(systemPrompt).toContain('JavaScript');
    expect(evalPrompt).toContain('JavaScript');
    expect(evalPrompt).toContain('clean code in JavaScript');
  });

  it('should generate Python prompts correctly', () => {
    const systemPrompt = getLiveChatSystemPrompt('python');
    const evalPrompt = getEvaluationSystemPrompt('python');
    
    expect(systemPrompt).toContain('Python');
    expect(evalPrompt).toContain('Python');
    expect(evalPrompt).toContain('clean code in Python');
  });

  it('should generate TypeScript prompts correctly', () => {
    const systemPrompt = getLiveChatSystemPrompt('typescript');
    const evalPrompt = getEvaluationSystemPrompt('typescript');
    
    expect(systemPrompt).toContain('TypeScript');
    expect(evalPrompt).toContain('TypeScript');
    expect(evalPrompt).toContain('clean code in TypeScript');
  });

  it('should handle unknown languages gracefully', () => {
    const systemPrompt = getLiveChatSystemPrompt('rust');
    const evalPrompt = getEvaluationSystemPrompt('rust');
    
    // Should use the language name as-is
    expect(systemPrompt).toContain('rust');
    expect(evalPrompt).toContain('rust');
  });
});
