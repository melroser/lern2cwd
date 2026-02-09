/**
 * Proctor Prompts for LLM Integration
 * 
 * This module contains the prompt templates for the AI proctor:
 * - Live Chat Prompt: Used for every user message during the session
 * - Evaluation Prompt: Called once when user clicks "I'm Done" or timer expires
 * 
 * Requirements: 3.2, 3.3, 3.4, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 9.2
 */

import type { Problem, ChatMessage } from '../types';

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximum number of chat turns to include in prompts for efficiency
 */
const MAX_CHAT_TURNS = 12;

/**
 * Language display names for prompts
 */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
};

// =============================================================================
// Live Chat Prompt (Turn-by-Turn)
// =============================================================================

/**
 * System prompt for live chat interactions.
 * 
 * The proctor behaves as a friendly, supportive interviewer who:
 * - Helps the candidate succeed without giving away the full solution
 * - Focuses on intent and logic, not syntax
 * - Accepts pseudocode as valid
 * - Uses a hint ladder approach when candidate is stuck
 * - Asks at most ONE clarifying question at a time
 * 
 * Requirements: 3.2, 3.3, 3.4, 5.1, 5.2, 5.3, 5.4
 * 
 * @param language - The programming language for the problem
 * @returns The system prompt string
 */
export function getLiveChatSystemPrompt(language: string): string {
  const languageName = LANGUAGE_DISPLAY_NAMES[language] || language;
  
  return `You are the Proctor in a timed ${languageName} coding assessment simulator.
Your job:
- Behave like a friendly, supportive interviewer.
- Help the candidate succeed without giving away the full solution.
- Focus on intent and logic, not syntax.
- Accept pseudocode as valid.
- Never be pedantic about tiny syntax issues.

Rules:
1) Do NOT write the complete solution code unless the candidate explicitly clicks "I'm done" (evaluation phase).
2) If the candidate is stuck, give a hint ladder:
   - (a) high-level approach
   - (b) key insight or data structure
   - (c) edge cases to consider
   - (d) small pseudocode snippet (not full solution)
3) Ask at most ONE clarifying question at a time, and only when needed.
4) Keep responses short and practical (aim for 4–10 sentences).
5) If the candidate's current direction is wrong, gently redirect with a hint rather than saying "wrong".
6) If time remaining is under 5 minutes, add one sentence of time management guidance.

Tone:
- calm, encouraging, human interviewer vibe
- not overly formal
- not overly enthusiastic`;
}

/**
 * Parameters for generating a live chat user prompt
 */
export interface LiveChatPromptParams {
  problem: Problem;
  currentCode: string;
  chatHistory: ChatMessage[];
  timeRemaining: number;
  candidateMessage: string;
}

/**
 * Generate the user prompt for live chat interactions.
 * 
 * Includes:
 * - Problem title and prompt
 * - Constraints/notes
 * - Current editor text
 * - Chat history (truncated to last 12 turns)
 * - Time remaining
 * - Candidate's message
 * 
 * @param params - The parameters for generating the prompt
 * @returns The formatted user prompt string
 */
export function getLiveChatUserPrompt(params: LiveChatPromptParams): string {
  const {
    problem,
    currentCode,
    chatHistory,
    timeRemaining,
    candidateMessage,
  } = params;

  // Format constraints
  const constraintsText = problem.constraints.length > 0
    ? problem.constraints.map(c => `- ${c}`).join('\n')
    : 'None specified';

  // Truncate chat history to last 12 turns for efficiency
  const truncatedHistory = truncateChatHistory(chatHistory, MAX_CHAT_TURNS);
  const chatHistoryText = formatChatHistory(truncatedHistory);

  return `PROBLEM: ${problem.title}
${problem.prompt}

CONSTRAINTS / NOTES:
${constraintsText}

CANDIDATE'S CURRENT EDITOR TEXT:
${currentCode || '(empty)'}

CHAT HISTORY (most recent last):
${chatHistoryText || '(no previous messages)'}

TIME REMAINING (seconds): ${timeRemaining}

CANDIDATE MESSAGE:
${candidateMessage}

Respond as the Proctor.`;
}

// =============================================================================
// Evaluation Prompt (Rubric + Coaching)
// =============================================================================

/**
 * System prompt for evaluation.
 * 
 * The proctor evaluates the candidate's solution using:
 * - Rubric scoring (0-4) for approach, completeness, complexity, communication
 * - Verdict rules: Pass (≥13, no category <3), Borderline (9-12), No Pass (≤8 or approach ≤1)
 * - Miss tags for tracking weaknesses
 * - Ideal solution in the problem's language
 * 
 * Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 9.2
 * 
 * @param language - The programming language for the problem
 * @returns The system prompt string
 */
export function getEvaluationSystemPrompt(language: string): string {
  const languageName = LANGUAGE_DISPLAY_NAMES[language] || language;
  
  return `You are the Proctor evaluating a candidate's solution in a ${languageName} coding assessment simulator.

You MUST:
- Evaluate intent and logic, not syntax.
- Accept pseudocode as valid if the algorithm is clear.
- Infer missing minor syntax if needed, but DO NOT invent missing logic.
- Be fair and consistent using the rubric.
- Provide 2–3 high-impact improvements (no exhaustive nitpicks).
- First say what is correct, then what is missing.
- If the approach is incorrect, guide with hints and what to change; do not shame.
- After feedback, provide ONE ideal answer (clean code in ${languageName}) that demonstrates the improved solution.

Rubric scoring (0–4 each):
- approach: correctness of the chosen algorithm / strategy
- completeness: covers requirements and typical edge cases
- complexity: identifies reasonable time/space complexity and tradeoffs
- communication: clarity and structure of explanation / pseudocode / code

Verdict rules:
- Pass: total >= 13 AND no category below 3
- Borderline: total 9–12 OR any category == 2 with otherwise strong work
- No Pass: total <= 8 OR approach score is 0 or 1 (fundamental approach failure is auto-fail)

Miss tags: Return 1–4 tags from this list (only if applicable):
- edge-cases
- complexity-analysis
- incorrect-approach
- incomplete-solution
- unclear-communication
- wrong-data-structure
- off-by-one
- constraints-missed
- testing-mentality

Output MUST be valid JSON and nothing else.`;
}

/**
 * Parameters for generating an evaluation user prompt
 */
export interface EvaluationPromptParams {
  problem: Problem;
  finalCode: string;
  chatHistory: ChatMessage[];
  durationSeconds: number;
}

/**
 * Generate the user prompt for evaluation.
 * 
 * Includes:
 * - Problem title and prompt
 * - Constraints/notes
 * - Problem metadata (expected approach, common pitfalls, ideal solution outline)
 * - Final editor text
 * - Chat transcript (truncated to last 12 turns)
 * - Time spent
 * 
 * @param params - The parameters for generating the prompt
 * @returns The formatted user prompt string
 */
export function getEvaluationUserPrompt(params: EvaluationPromptParams): string {
  const {
    problem,
    finalCode,
    chatHistory,
    durationSeconds,
  } = params;

  // Format constraints
  const constraintsText = problem.constraints.length > 0
    ? problem.constraints.map(c => `- ${c}`).join('\n')
    : 'None specified';

  // Format common pitfalls
  const pitfallsText = problem.commonPitfalls.length > 0
    ? problem.commonPitfalls.map(p => `- ${p}`).join('\n')
    : 'None specified';

  // Truncate chat history to last 12 turns for efficiency
  const truncatedHistory = truncateChatHistory(chatHistory, MAX_CHAT_TURNS);
  const chatHistoryText = formatChatHistory(truncatedHistory);

  return `PROBLEM: ${problem.title}
${problem.prompt}

CONSTRAINTS / NOTES:
${constraintsText}

PROBLEM METADATA (for consistent evaluation):
Expected approach: ${problem.expectedApproach}
Common pitfalls:
${pitfallsText}
Ideal solution outline: ${problem.idealSolutionOutline}

CANDIDATE'S FINAL EDITOR TEXT:
${finalCode || '(empty)'}

CHAT TRANSCRIPT:
${chatHistoryText || '(no messages)'}

TIME SPENT (seconds): ${durationSeconds}

Now evaluate.`;
}

/**
 * Expected JSON output format for evaluation response.
 * This is provided as documentation and for validation purposes.
 */
export const EVALUATION_JSON_SCHEMA = `{
  "verdict": "Pass | Borderline | No Pass",
  "scores": {
    "approach": 0,
    "completeness": 0,
    "complexity": 0,
    "communication": 0
  },
  "feedback": {
    "strengths": ["..."],
    "improvements": ["..."]
  },
  "idealSolution": "string (clean code solution + brief explanation comments ok)",
  "missTags": ["edge-cases"]
}`;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Truncate chat history to the last N turns for efficiency.
 * A "turn" is a pair of user message + proctor response.
 * 
 * Strategy: Keep the first message (intro) + last N messages
 * 
 * @param messages - The full chat history
 * @param maxTurns - Maximum number of turns to keep (default: 12)
 * @returns Truncated chat history
 */
export function truncateChatHistory(
  messages: ChatMessage[],
  maxTurns: number = MAX_CHAT_TURNS
): ChatMessage[] {
  if (!messages || messages.length === 0) {
    return [];
  }

  // If within limit, return as-is
  if (messages.length <= maxTurns) {
    return messages;
  }

  // Keep first message (intro) + last (maxTurns - 1) messages
  const firstMessage = messages[0];
  const recentMessages = messages.slice(-(maxTurns - 1));

  return [firstMessage, ...recentMessages];
}

/**
 * Format chat history as a string for inclusion in prompts.
 * 
 * @param messages - The chat messages to format
 * @returns Formatted chat history string
 */
export function formatChatHistory(messages: ChatMessage[]): string {
  if (!messages || messages.length === 0) {
    return '';
  }

  return messages
    .map(msg => {
      const role = msg.role === 'user' ? 'CANDIDATE' : 'PROCTOR';
      return `[${role}]: ${msg.content}`;
    })
    .join('\n\n');
}

/**
 * Build complete live chat prompt (system + user).
 * Convenience function for generating the full prompt.
 * 
 * @param params - The parameters for generating the prompt
 * @returns Object containing system and user prompts
 */
export function buildLiveChatPrompt(params: LiveChatPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: getLiveChatSystemPrompt(params.problem.language),
    userPrompt: getLiveChatUserPrompt(params),
  };
}

/**
 * Build complete evaluation prompt (system + user).
 * Convenience function for generating the full prompt.
 * 
 * @param params - The parameters for generating the prompt
 * @returns Object containing system and user prompts
 */
export function buildEvaluationPrompt(params: EvaluationPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: getEvaluationSystemPrompt(params.problem.language),
    userPrompt: getEvaluationUserPrompt(params),
  };
}
