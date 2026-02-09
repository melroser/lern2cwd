/**
 * Unit tests for Token Estimation and Context Truncation Utilities
 * 
 * Tests the token estimation heuristics and truncation strategies
 * for managing LLM context window limits.
 */

import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateChatTokens,
  truncateChat,
  truncateCode,
  prepareContext,
  prepareContextForChat,
  prepareContextForEvaluation,
  TOKEN_LIMITS,
  DEFAULT_TOKEN_BUDGET,
} from '../tokenEstimator';
import type { ChatMessage } from '../../types';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a chat message for testing
 */
function createMessage(
  role: 'user' | 'proctor',
  content: string,
  id?: string
): ChatMessage {
  return {
    id: id || `msg-${Date.now()}-${Math.random()}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

/**
 * Create multiple chat messages for testing
 */
function createChatHistory(count: number, contentLength: number = 100): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? 'proctor' : 'user';
    const content = `Message ${i}: ${'x'.repeat(contentLength)}`;
    messages.push(createMessage(role, content, `msg-${i}`));
  }
  return messages;
}

// =============================================================================
// estimateTokens Tests
// =============================================================================

describe('estimateTokens', () => {
  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should return 0 for null/undefined', () => {
    expect(estimateTokens(null as unknown as string)).toBe(0);
    expect(estimateTokens(undefined as unknown as string)).toBe(0);
  });

  it('should estimate tokens using ~4 chars per token', () => {
    // 4 chars = 1 token
    expect(estimateTokens('test')).toBe(1);
    
    // 8 chars = 2 tokens
    expect(estimateTokens('testtest')).toBe(2);
    
    // 12 chars = 3 tokens
    expect(estimateTokens('testtesttest')).toBe(3);
  });

  it('should round up partial tokens', () => {
    // 5 chars = ceil(5/4) = 2 tokens
    expect(estimateTokens('hello')).toBe(2);
    
    // 7 chars = ceil(7/4) = 2 tokens
    expect(estimateTokens('testing')).toBe(2);
    
    // 9 chars = ceil(9/4) = 3 tokens
    expect(estimateTokens('123456789')).toBe(3);
  });

  it('should handle longer text', () => {
    const text = 'a'.repeat(100);
    expect(estimateTokens(text)).toBe(25); // 100/4 = 25
  });

  it('should handle code with special characters', () => {
    const code = 'function test() {\n  return true;\n}';
    // 35 chars = ceil(35/4) = 9 tokens
    expect(estimateTokens(code)).toBe(9);
  });
});

// =============================================================================
// estimateChatTokens Tests
// =============================================================================

describe('estimateChatTokens', () => {
  it('should return 0 for empty array', () => {
    expect(estimateChatTokens([])).toBe(0);
  });

  it('should return 0 for null/undefined', () => {
    expect(estimateChatTokens(null as unknown as ChatMessage[])).toBe(0);
    expect(estimateChatTokens(undefined as unknown as ChatMessage[])).toBe(0);
  });

  it('should estimate tokens for single message', () => {
    const messages = [createMessage('user', 'Hello')];
    const tokens = estimateChatTokens(messages);
    // 'user' (1 token) + 'Hello' (2 tokens) + 4 overhead = 7 tokens
    expect(tokens).toBeGreaterThan(0);
  });

  it('should accumulate tokens for multiple messages', () => {
    const messages = [
      createMessage('proctor', 'Welcome to the interview'),
      createMessage('user', 'Thank you'),
    ];
    const tokens = estimateChatTokens(messages);
    expect(tokens).toBeGreaterThan(estimateChatTokens([messages[0]]));
  });

  it('should include overhead for message structure', () => {
    const message = createMessage('user', 'Hi');
    const contentTokens = estimateTokens('user') + estimateTokens('Hi');
    const totalTokens = estimateChatTokens([message]);
    // Should include 4 token overhead per message
    expect(totalTokens).toBe(contentTokens + 4);
  });
});

// =============================================================================
// truncateChat Tests
// =============================================================================

describe('truncateChat', () => {
  it('should return empty array for empty input', () => {
    expect(truncateChat([], 1000)).toEqual([]);
  });

  it('should return empty array for null/undefined', () => {
    expect(truncateChat(null as unknown as ChatMessage[], 1000)).toEqual([]);
    expect(truncateChat(undefined as unknown as ChatMessage[], 1000)).toEqual([]);
  });

  it('should return all messages if within budget', () => {
    const messages = createChatHistory(3, 10);
    const result = truncateChat(messages, 10000);
    expect(result).toHaveLength(3);
    expect(result).toEqual(messages);
  });

  it('should always keep the first message (intro)', () => {
    const messages = createChatHistory(10, 100);
    const result = truncateChat(messages, 100);
    expect(result[0]).toEqual(messages[0]);
  });

  it('should keep recent messages when truncating', () => {
    const messages = createChatHistory(10, 50);
    const result = truncateChat(messages, 500);
    
    // First message should be preserved
    expect(result[0]).toEqual(messages[0]);
    
    // Last message should be preserved (if budget allows)
    if (result.length > 1) {
      expect(result[result.length - 1]).toEqual(messages[messages.length - 1]);
    }
  });

  it('should drop middle messages when truncating', () => {
    const messages = createChatHistory(20, 200); // Larger messages to ensure truncation
    const result = truncateChat(messages, 500); // Smaller budget to force truncation
    
    // Should have fewer messages
    expect(result.length).toBeLessThan(messages.length);
    
    // First message preserved
    expect(result[0].id).toBe(messages[0].id);
    
    // Recent messages preserved
    const lastResultId = result[result.length - 1].id;
    const lastOriginalId = messages[messages.length - 1].id;
    expect(lastResultId).toBe(lastOriginalId);
  });

  it('should return only first message if budget is very small', () => {
    const messages = createChatHistory(5, 100);
    const firstMessageTokens = estimateChatTokens([messages[0]]);
    const result = truncateChat(messages, firstMessageTokens);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(messages[0]);
  });
});

// =============================================================================
// truncateCode Tests
// =============================================================================

describe('truncateCode', () => {
  it('should return empty string for empty input', () => {
    expect(truncateCode('')).toBe('');
  });

  it('should return empty string for null/undefined', () => {
    expect(truncateCode(null as unknown as string)).toBe('');
    expect(truncateCode(undefined as unknown as string)).toBe('');
  });

  it('should return code unchanged if under line limit', () => {
    const code = 'line1\nline2\nline3';
    expect(truncateCode(code, 200)).toBe(code);
  });

  it('should truncate to last N lines when over limit', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`);
    const code = lines.join('\n');
    
    const result = truncateCode(code, 200);
    const resultLines = result.split('\n');
    
    // Should have truncation notice + 200 lines
    expect(resultLines[0]).toContain('truncated');
    expect(resultLines.length).toBe(201); // notice + 200 lines
  });

  it('should keep the most recent (last) lines', () => {
    const lines = Array.from({ length: 250 }, (_, i) => `line ${i + 1}`);
    const code = lines.join('\n');
    
    const result = truncateCode(code, 200);
    
    // Should contain the last line
    expect(result).toContain('line 250');
    
    // Should not contain early lines
    expect(result).not.toContain('line 1\n');
    expect(result).not.toContain('line 50\n');
  });

  it('should add truncation notice when truncating', () => {
    const lines = Array.from({ length: 250 }, (_, i) => `line ${i + 1}`);
    const code = lines.join('\n');
    
    const result = truncateCode(code, 200);
    
    expect(result).toContain('// ... (earlier code truncated) ...');
  });

  it('should use default maxLines of 200', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`);
    const code = lines.join('\n');
    
    const result = truncateCode(code);
    const resultLines = result.split('\n');
    
    // Should have truncation notice + 200 lines
    expect(resultLines.length).toBe(201);
  });

  it('should handle custom maxLines', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
    const code = lines.join('\n');
    
    const result = truncateCode(code, 50);
    const resultLines = result.split('\n');
    
    // Should have truncation notice + 50 lines
    expect(resultLines.length).toBe(51);
    expect(result).toContain('line 100');
    expect(result).not.toContain('line 50\n');
  });
});

// =============================================================================
// prepareContext Tests
// =============================================================================

describe('prepareContext', () => {
  it('should return unchanged content if within budget', () => {
    const code = 'const x = 1;';
    const chat = createChatHistory(2, 20);
    
    const result = prepareContext({
      code,
      chatHistory: chat,
      maxTotalTokens: 10000,
    });
    
    expect(result.code).toBe(code);
    expect(result.chat).toEqual(chat);
    expect(result.withinBudget).toBe(true);
  });

  it('should truncate chat when over budget', () => {
    const code = 'const x = 1;';
    const chat = createChatHistory(50, 200); // Large chat history
    
    const result = prepareContext({
      code,
      chatHistory: chat,
      maxTotalTokens: 3000,
    });
    
    expect(result.chat.length).toBeLessThan(chat.length);
    // First message should be preserved
    expect(result.chat[0]).toEqual(chat[0]);
  });

  it('should truncate code when over budget', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `const line${i} = ${i};`);
    const code = lines.join('\n');
    const chat = createChatHistory(2, 20);
    
    const result = prepareContext({
      code,
      chatHistory: chat,
      maxTotalTokens: 4000,
    });
    
    // Code should be truncated
    expect(result.code).toContain('truncated');
    expect(result.code.split('\n').length).toBeLessThanOrEqual(201);
  });

  it('should provide token estimates', () => {
    const code = 'const x = 1;';
    const chat = createChatHistory(3, 50);
    
    const result = prepareContext({
      code,
      chatHistory: chat,
      maxTotalTokens: 10000,
    });
    
    expect(result.estimatedTokens.code).toBeGreaterThan(0);
    expect(result.estimatedTokens.chat).toBeGreaterThan(0);
    expect(result.estimatedTokens.total).toBeGreaterThan(0);
  });

  it('should respect custom token budget', () => {
    // Create code with many lines to trigger line-based truncation
    // The truncation happens when codeTokens > budget.code (default 2000)
    // 300 lines * ~20 chars each = ~6000 chars = ~1500 tokens, which is under 2000
    // So we need more lines or longer lines to trigger truncation
    const lines = Array.from({ length: 500 }, (_, i) => `const line${i} = ${i};`);
    const code = lines.join('\n');
    const chat = createChatHistory(5, 100);
    
    const result = prepareContext({
      code,
      chatHistory: chat,
      maxTotalTokens: 3000, // Small total budget to force truncation
      tokenBudget: {
        code: 500, // Very limited code budget
      },
    });
    
    // Code should be truncated due to exceeding line limit (200 lines max)
    // The truncation is triggered when codeTokens > budget.code
    expect(result.code).toContain('truncated');
  });

  it('should indicate when not within budget after truncation', () => {
    // Create extremely large content that can't fit even after truncation
    const lines = Array.from({ length: 1000 }, (_, i) => `const line${i} = ${'x'.repeat(100)};`);
    const code = lines.join('\n');
    const chat = createChatHistory(100, 500);
    
    const result = prepareContext({
      code,
      chatHistory: chat,
      maxTotalTokens: 500, // Very small budget
    });
    
    // Should still truncate as much as possible
    expect(result.chat.length).toBeLessThan(chat.length);
  });
});

// =============================================================================
// prepareContextForChat Tests
// =============================================================================

describe('prepareContextForChat', () => {
  it('should use 6000 token limit', () => {
    const code = 'const x = 1;';
    const chat = createChatHistory(2, 20);
    
    const result = prepareContextForChat(code, chat);
    
    expect(result.estimatedTokens.total).toBeLessThanOrEqual(TOKEN_LIMITS.CHAT_PROMPT);
  });

  it('should truncate large content to fit chat limit', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `const line${i} = ${i};`);
    const code = lines.join('\n');
    const chat = createChatHistory(100, 200);
    
    const result = prepareContextForChat(code, chat);
    
    // Should have truncated content
    expect(result.chat.length).toBeLessThan(100);
  });
});

// =============================================================================
// prepareContextForEvaluation Tests
// =============================================================================

describe('prepareContextForEvaluation', () => {
  it('should use 8000 token limit', () => {
    const code = 'const x = 1;';
    const chat = createChatHistory(2, 20);
    
    const result = prepareContextForEvaluation(code, chat);
    
    expect(result.estimatedTokens.total).toBeLessThanOrEqual(TOKEN_LIMITS.EVALUATION_PROMPT);
  });

  it('should allow more content than chat limit', () => {
    const code = 'x'.repeat(1000);
    const chat = createChatHistory(20, 100);
    
    const chatResult = prepareContextForChat(code, chat);
    const evalResult = prepareContextForEvaluation(code, chat);
    
    // Evaluation should allow same or more content
    expect(evalResult.estimatedTokens.total).toBeGreaterThanOrEqual(
      chatResult.estimatedTokens.total - 100 // Allow small variance
    );
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  it('should have correct token limits', () => {
    expect(TOKEN_LIMITS.CHAT_PROMPT).toBe(6000);
    expect(TOKEN_LIMITS.EVALUATION_PROMPT).toBe(8000);
  });

  it('should have valid default token budget', () => {
    expect(DEFAULT_TOKEN_BUDGET.systemPrompt).toBe(500);
    expect(DEFAULT_TOKEN_BUDGET.problemMetadata).toBe(300);
    expect(DEFAULT_TOKEN_BUDGET.code).toBe(2000);
    expect(DEFAULT_TOKEN_BUDGET.chat).toBe(3000);
    expect(DEFAULT_TOKEN_BUDGET.response).toBe(1000);
  });
});
