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
  sql: 'SQL',
  yaml: 'YAML',
  dockerfile: 'Dockerfile',
};

// =============================================================================
// Live Chat Prompt (Turn-by-Turn)
// =============================================================================

/**
 * System prompt for live chat interactions.
 * 
 * The proctor behaves like a real proctored assessment with TWO roles:
 * - Proctor: Monitors rules, answers clarifying questions
 * - Interviewer: Asks about approach/complexity, checks understanding (but doesn't give hints)
 * 
 * Requirements: 3.2, 3.3, 3.4, 5.1, 5.2, 5.3, 5.4
 * 
 * @param language - The programming language for the problem
 * @returns The system prompt string
 */
export function getLiveChatSystemPrompt(problem: Problem | string): string {
  const { languageName, assessmentType, domain } = resolvePromptContext(problem);

  const shared = `You are a friendly, supportive interviewer and proctor in a coding assessment simulator.
Help the candidate succeed while preserving interview integrity.

Behavior:
- Stay realistic, direct, and fair like a real interviewer/proctor.
- Ask at most ONE clarifying question at a time when the candidate is vague.
- Do not keep repeating the same follow-up question. If the candidate is confused, switch to plain-language explanation first.
- Use a hint ladder: high-level approach, then key insight, then edge cases, then a small pseudocode snippet.
- Do NOT write the complete solution.
- If asked about input/variable meaning, answer with the exact function contract from the prompt/editor.
- You can already see the candidate's current editor text. Do NOT ask them to paste, re-share, or restate code that is already visible.
- When the candidate asks "is this right?" or "can you see my code?", inspect the visible editor text and answer with concrete feedback about what is actually there.
- If the assessment mode is behavioral, math, or system design, treat the editor text as a draft answer and critique that draft directly when the candidate asks "how is that?" or "is this good?".
- In non-coding modes, answer draft-review requests in this shape: what is working, what is missing, and the single best next improvement. Do not reset the interview or ask them to restate the draft you can already see.
- Never call a non-coding assessment a "coding problem" or ask coding-specific follow-ups in behavioral/math/system-design mode.
- If the candidate says they do not understand the question, restate it plainly in one sentence and give one concrete true/false example.
- Never answer input-contract questions with uncertainty words like "typically", "maybe", or "probably".
- Never claim the prompt is missing parameters when a function signature is present.
- If a prompt asks for 1-indexed positions, that usually changes the returned answer positions, not how Python lists are accessed. Only say otherwise if the prompt explicitly defines an offset data structure.
- If under 5 minutes, give time management guidance and prioritize the critical path.
- Keep tone calm, encouraging, and not overly formal.
- Never be pedantic about tiny syntax mistakes.
- Prefer short, actionable responses (2-5 sentences unless asked for more).
- Push for reasoning quality, tradeoffs, and edge-case awareness.`;

  if (assessmentType === 'math') {
    return `${shared}

Assessment context:
- Domain: ${domain}
- Format: Quantitative/calculation interview

What to probe:
- Assumptions and unit consistency
- Formula selection and arithmetic correctness
- Sensitivity/range thinking
- Executive clarity in final takeaway`;
  }

  if (assessmentType === 'behavioral') {
    return `${shared}

Assessment context:
- Domain: ${domain}
- Format: Behavioral interview

What to probe:
- Situation clarity and ownership
- Decision quality and tradeoffs
- Impact/results with evidence
- Reflection and lessons learned`;
  }

  if (assessmentType === 'system-design') {
    return `${shared}

Assessment context:
- Domain: ${domain}
- Format: System design interview

What to probe:
- Requirements clarification
- Architecture decomposition and tradeoffs
- Scalability/reliability concerns
- Communication and prioritization`;
  }

  return `${shared}

Assessment context:
- Language: ${languageName}
- Domain: ${domain}
- Format: Coding interview

What to probe:
- Algorithm/data structure choice
- Correctness and edge-case handling
- Complexity and tradeoff reasoning
- Clear communication while coding`;
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
  const effectiveConstraints = problem.content?.constraints ?? problem.constraints;
  const effectivePrompt = problem.content?.description ?? problem.prompt;

  const constraintsText = effectiveConstraints.length > 0
    ? effectiveConstraints.map(c => `- ${c}`).join('\n')
    : 'None specified';

  // Truncate chat history to last 12 turns for efficiency
  const truncatedHistory = truncateChatHistory(chatHistory, MAX_CHAT_TURNS);
  const chatHistoryText = formatChatHistory(truncatedHistory);
  const functionSignature = problem.contract?.functionSignature ?? extractFunctionSignature(problem.scaffold);

  return `PROBLEM: ${problem.title}
${effectivePrompt}

ASSESSMENT MODE: ${problem.assessmentType ?? 'coding'}
DOMAIN: ${problem.domain ?? 'software-engineering'}

CONSTRAINTS / NOTES:
${constraintsText}

FUNCTION CONTRACT:
${functionSignature || '(not specified)'}

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
export function getEvaluationSystemPrompt(problem: Problem | string): string {
  const { languageName, assessmentType, domain } = resolvePromptContext(problem);

  const shared = `You are the Proctor evaluating a candidate in a coding assessment simulator.

You MUST:
- Evaluate reasoning quality, correctness, and communication.
- Be fair and consistent using the rubric.
- Provide 2–3 high-impact improvements (no exhaustive nitpicks).
- First say what is correct, then what is missing.
- do not shame.

Verdict rules:
- Pass: total >= 13 AND no category below 3
- Borderline: total 9–12 OR any category == 2 with otherwise strong work
- No Pass: total <= 8 OR approach score is 0 or 1

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

  if (assessmentType === 'math') {
return `${shared}

Assessment:
- Domain: ${domain}
- Type: Quantitative/calculation interview

Rubric scoring (0–4 each):
- approach: model/formula selection and assumption quality
- completeness: correctness of calculations and coverage of required outputs
- complexity: rigor, sensitivity analysis, and tradeoff depth
- communication: clarity of steps and executive-friendly conclusion

Ideal answer should be a structured model answer with formulas, computed values, and key caveats.`;
  }

  if (assessmentType === 'behavioral') {
    return `${shared}

Assessment:
- Domain: ${domain}
- Type: Behavioral interview

Rubric scoring (0–4 each):
- approach: framing quality and decision process
- completeness: covers context, action, result, and reflection
- complexity: depth of tradeoff/risk reasoning
- communication: concise, structured delivery with clear impact

Ideal answer should be a polished interview response (not code), typically STAR-like.`;
  }

  if (assessmentType === 'system-design') {
    return `${shared}

Assessment:
- Domain: ${domain}
- Type: System design interview

Rubric scoring (0–4 each):
- approach: architecture direction and requirement mapping
- completeness: core components, data flow, and failure scenarios
- complexity: tradeoffs across scale, consistency, reliability, and cost
- communication: clarity and structure of design explanation

Ideal answer should be a concise design walkthrough with key tradeoffs.`;
  }

  return `${shared}

Assessment:
- Domain: ${domain}
- Language: ${languageName}
- Type: Coding interview

You MUST:
- Evaluate intent and logic, not syntax.
- Accept pseudocode as valid if the algorithm is clear.
- Infer missing minor syntax when needed.
- DO NOT invent missing logic.

Rubric scoring (0–4 each):
- approach: correctness of the algorithm/strategy
- completeness: requirements and edge-case coverage
- complexity: time/space analysis and tradeoffs
- communication: clarity of explanation and code structure

Ideal answer should be clean code in ${languageName} with brief reasoning comments.`;
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
  const effectiveConstraints = problem.content?.constraints ?? problem.constraints;
  const effectivePrompt = problem.content?.description ?? problem.prompt;

  const constraintsText = effectiveConstraints.length > 0
    ? effectiveConstraints.map(c => `- ${c}`).join('\n')
    : 'None specified';

  // Format common pitfalls
  const pitfallsText = problem.commonPitfalls.length > 0
    ? problem.commonPitfalls.map(p => `- ${p}`).join('\n')
    : 'None specified';

  // Truncate chat history to last 12 turns for efficiency
  const truncatedHistory = truncateChatHistory(chatHistory, MAX_CHAT_TURNS);
  const chatHistoryText = formatChatHistory(truncatedHistory);
  const functionSignature = problem.contract?.functionSignature ?? extractFunctionSignature(problem.scaffold);

  return `PROBLEM: ${problem.title}
${effectivePrompt}

ASSESSMENT MODE: ${problem.assessmentType ?? 'coding'}
DOMAIN: ${problem.domain ?? 'software-engineering'}

CONSTRAINTS / NOTES:
${constraintsText}

FUNCTION CONTRACT:
${functionSignature || '(not specified)'}

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
  "missTags": ["edge-cases"],
  "annotations": [
    {
      "target": "candidate | ideal",
      "line": 1,
      "message": "Short line-level review comment",
      "severity": "info | warning | error"
    }
  ]
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

function extractFunctionSignature(scaffold: string): string | null {
  if (!scaffold) return null;
  const signatureLine = scaffold
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('def ') || line.startsWith('function '));
  return signatureLine ?? null;
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
    systemPrompt: getLiveChatSystemPrompt(params.problem),
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
    systemPrompt: getEvaluationSystemPrompt(params.problem),
    userPrompt: getEvaluationUserPrompt(params),
  };
}

type PromptContext = {
  languageName: string;
  assessmentType: Problem['assessmentType'];
  domain: string;
};

/**
 * Keeps backward compatibility with older callers that only passed a language string.
 */
function resolvePromptContext(problemOrLanguage: Problem | string): PromptContext {
  if (typeof problemOrLanguage === 'string') {
    return {
      languageName: LANGUAGE_DISPLAY_NAMES[problemOrLanguage] || problemOrLanguage,
      assessmentType: 'coding',
      domain: 'software-engineering',
    };
  }

  return {
    languageName: LANGUAGE_DISPLAY_NAMES[problemOrLanguage.language] || problemOrLanguage.language,
    assessmentType: problemOrLanguage.assessmentType ?? 'coding',
    domain: problemOrLanguage.domain ?? 'software-engineering',
  };
}
