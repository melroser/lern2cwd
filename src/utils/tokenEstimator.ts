/**
 * Token Estimation and Context Truncation Utilities
 * 
 * Provides utilities for estimating token counts and truncating context
 * to fit within LLM context window limits.
 * 
 * Requirements: 3.2 - Token management for LLM context
 */

import type { ChatMessage, TokenBudget } from '../types';

// =============================================================================
// Constants
// =============================================================================

/**
 * Characters per token heuristic (conservative for code)
 * This is a rough estimate - actual tokenization varies by model
 */
const CHARS_PER_TOKEN = 4;

/**
 * Default token limits for different prompt types
 */
export const TOKEN_LIMITS = {
  CHAT_PROMPT: 6000,
  EVALUATION_PROMPT: 8000,
} as const;

/**
 * Default token budget allocation
 */
export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  systemPrompt: 500,    // ~500 tokens (fixed)
  problemMetadata: 300, // ~300 tokens (varies by problem)
  code: 2000,           // variable, cap at 2000 tokens
  chat: 3000,           // variable, cap at 3000 tokens
  response: 1000,       // reserve 1000 tokens for response
};

/**
 * Maximum lines of code to keep when truncating
 */
const MAX_CODE_LINES = 200;

// =============================================================================
// Token Estimation
// =============================================================================

/**
 * Estimate the number of tokens in a text string.
 * Uses ~4 characters per token heuristic (conservative for code).
 * 
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens for an array of chat messages.
 * 
 * @param messages - Array of chat messages
 * @returns Total estimated token count
 */
export function estimateChatTokens(messages: ChatMessage[]): number {
  if (!messages || messages.length === 0) {
    return 0;
  }
  
  return messages.reduce((total, message) => {
    // Account for role prefix and message content
    const roleTokens = estimateTokens(message.role);
    const contentTokens = estimateTokens(message.content);
    // Add small overhead for message structure
    return total + roleTokens + contentTokens + 4;
  }, 0);
}

// =============================================================================
// Truncation Functions
// =============================================================================

/**
 * Truncate chat history to fit within token budget.
 * Strategy: Keep first message (intro) + last N messages, drop middle.
 * 
 * @param messages - Array of chat messages
 * @param maxTokens - Maximum tokens allowed for chat
 * @returns Truncated array of chat messages
 */
export function truncateChat(
  messages: ChatMessage[],
  maxTokens: number
): ChatMessage[] {
  if (!messages || messages.length === 0) {
    return [];
  }
  
  // If already within budget, return as-is
  const currentTokens = estimateChatTokens(messages);
  if (currentTokens <= maxTokens) {
    return messages;
  }
  
  // Always keep the first message (intro from proctor)
  const firstMessage = messages[0];
  const firstMessageTokens = estimateChatTokens([firstMessage]);
  
  // If even the first message exceeds budget, return just it (truncated content if needed)
  if (firstMessageTokens >= maxTokens) {
    return [firstMessage];
  }
  
  // Calculate remaining budget for other messages
  const remainingBudget = maxTokens - firstMessageTokens;
  
  // Build from the end, keeping most recent messages
  const result: ChatMessage[] = [firstMessage];
  const recentMessages: ChatMessage[] = [];
  let recentTokens = 0;
  
  // Iterate from the end, adding messages until we exceed budget
  for (let i = messages.length - 1; i > 0; i--) {
    const message = messages[i];
    const messageTokens = estimateChatTokens([message]);
    
    if (recentTokens + messageTokens <= remainingBudget) {
      recentMessages.unshift(message);
      recentTokens += messageTokens;
    } else {
      break;
    }
  }
  
  // Combine first message with recent messages
  return [...result, ...recentMessages];
}

/**
 * Truncate code to keep only the last N lines.
 * Strategy: Keep last N lines (most recent work).
 * 
 * @param code - The code string to truncate
 * @param maxLines - Maximum number of lines to keep (default: 200)
 * @returns Truncated code string
 */
export function truncateCode(code: string, maxLines: number = MAX_CODE_LINES): string {
  if (!code) {
    return '';
  }
  
  const lines = code.split('\n');
  
  if (lines.length <= maxLines) {
    return code;
  }
  
  // Keep the last maxLines lines
  const truncatedLines = lines.slice(-maxLines);
  
  // Add a comment indicating truncation
  const truncationNotice = '// ... (earlier code truncated) ...\n';
  
  return truncationNotice + truncatedLines.join('\n');
}

// =============================================================================
// Context Preparation
// =============================================================================

/**
 * Options for preparing context
 */
export interface PrepareContextOptions {
  code: string;
  chatHistory: ChatMessage[];
  maxTotalTokens: number;
  tokenBudget?: Partial<TokenBudget>;
}

/**
 * Result of context preparation
 */
export interface PrepareContextResult {
  code: string;
  chat: ChatMessage[];
  withinBudget: boolean;
  estimatedTokens: {
    code: number;
    chat: number;
    total: number;
  };
}

/**
 * Prepare context for LLM prompt within token budget.
 * 
 * Strategy:
 * 1. Estimate current token usage
 * 2. If over budget, truncate chat first (keep first + last N)
 * 3. If still over budget, truncate code (keep last 200 lines)
 * 4. Problem metadata is never truncated (essential for evaluation)
 * 
 * @param options - Context preparation options
 * @returns Prepared context with truncated code and chat
 */
export function prepareContext(options: PrepareContextOptions): PrepareContextResult {
  const {
    code,
    chatHistory,
    maxTotalTokens,
    tokenBudget = DEFAULT_TOKEN_BUDGET,
  } = options;
  
  // Merge with defaults
  const budget: TokenBudget = {
    ...DEFAULT_TOKEN_BUDGET,
    ...tokenBudget,
  };
  
  // Calculate available tokens for code and chat
  // Reserve tokens for system prompt, problem metadata, and response
  const reservedTokens = budget.systemPrompt + budget.problemMetadata + budget.response;
  const availableTokens = maxTotalTokens - reservedTokens;
  
  // Initial estimates
  let currentCode = code;
  let currentChat = chatHistory;
  let codeTokens = estimateTokens(currentCode);
  let chatTokens = estimateChatTokens(currentChat);
  
  // Step 1: Check if we're within budget
  if (codeTokens + chatTokens <= availableTokens) {
    return {
      code: currentCode,
      chat: currentChat,
      withinBudget: true,
      estimatedTokens: {
        code: codeTokens,
        chat: chatTokens,
        total: codeTokens + chatTokens + reservedTokens,
      },
    };
  }
  
  // Step 2: Truncate chat first (keep first + last N messages)
  // Allocate remaining budget after code cap
  const maxCodeTokens = Math.min(codeTokens, budget.code);
  const maxChatTokens = Math.min(availableTokens - maxCodeTokens, budget.chat);
  
  currentChat = truncateChat(chatHistory, maxChatTokens);
  chatTokens = estimateChatTokens(currentChat);
  
  // Step 3: If code exceeds budget, truncate to last 200 lines
  if (codeTokens > budget.code) {
    currentCode = truncateCode(code, MAX_CODE_LINES);
    codeTokens = estimateTokens(currentCode);
  }
  
  // Final check
  const totalTokens = codeTokens + chatTokens + reservedTokens;
  const withinBudget = totalTokens <= maxTotalTokens;
  
  return {
    code: currentCode,
    chat: currentChat,
    withinBudget,
    estimatedTokens: {
      code: codeTokens,
      chat: chatTokens,
      total: totalTokens,
    },
  };
}

/**
 * Prepare context specifically for chat prompts (6000 token limit)
 */
export function prepareContextForChat(
  code: string,
  chatHistory: ChatMessage[]
): PrepareContextResult {
  return prepareContext({
    code,
    chatHistory,
    maxTotalTokens: TOKEN_LIMITS.CHAT_PROMPT,
  });
}

/**
 * Prepare context specifically for evaluation prompts (8000 token limit)
 */
export function prepareContextForEvaluation(
  code: string,
  chatHistory: ChatMessage[]
): PrepareContextResult {
  return prepareContext({
    code,
    chatHistory,
    maxTotalTokens: TOKEN_LIMITS.EVALUATION_PROMPT,
  });
}
