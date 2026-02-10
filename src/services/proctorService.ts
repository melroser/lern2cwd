/**
 * ProctorService - Handles AI proctor interactions
 * 
 * This service manages all interactions with the AI proctor including:
 * - Generating problem introductions
 * - Responding to user questions during the session
 * - Evaluating code submissions
 * 
 * Supports two modes:
 * - Live LLM mode: Uses real API calls when an API key is configured
 * - Mock mode: Returns hardcoded responses for testing when no API key is available
 * 
 * Requirements: 3.2, 4.1
 */

import type {
  Problem,
  SessionContext,
  ChatMessage,
  EvaluationResult,
  ProctorService as IProctorService,
  MissTag,
} from '../types';
import { getStoredApiKey, hasApiKey } from '../utils/apiKeyStorage';
import {
  buildLiveChatPrompt,
  buildEvaluationPrompt,
} from '../prompts/proctorPrompts';
import { evaluationService, EvaluationParseError } from './evaluationService';

// =============================================================================
// Constants
// =============================================================================

/**
 * OpenAI API endpoint for chat completions
 */
const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

/**
 * Default model to use for LLM calls
 */
const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Request timeout in milliseconds
 */
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Maximum retry attempts for API calls
 */
const MAX_RETRIES = 2;

/**
 * Delay between retries in milliseconds
 */
const RETRY_DELAY_MS = 1000;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Simulates API latency for realistic UI testing in mock mode
 * @param minMs Minimum delay in milliseconds
 * @param maxMs Maximum delay in milliseconds
 */
function simulateLatency(minMs: number = 500, maxMs: number = 1000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Derive miss tags from scores when LLM omits them
 * 
 * Fallback rules from design.md:
 * - completeness ≤ 2 → edge-cases or incomplete-solution
 * - complexity ≤ 2 → complexity-analysis
 * - communication ≤ 2 → unclear-communication
 * - approach ≤ 2 → incorrect-approach
 */
function deriveMissTagsFromScores(scores: EvaluationResult['scores']): MissTag[] {
  const tags: MissTag[] = [];

  if (scores.completeness <= 2) {
    tags.push('edge-cases');
    if (scores.completeness <= 1) {
      tags.push('incomplete-solution');
    }
  }

  if (scores.complexity <= 2) {
    tags.push('complexity-analysis');
  }

  if (scores.communication <= 2) {
    tags.push('unclear-communication');
  }

  if (scores.approach <= 2) {
    tags.push('incorrect-approach');
  }

  // Return max 4 tags
  return tags.slice(0, 4);
}

// =============================================================================
// LLM API Client
// =============================================================================

/**
 * Error class for LLM API errors
 */
export class LLMApiError extends Error {
  public readonly statusCode?: number;
  public readonly isRetryable: boolean;

  constructor(message: string, statusCode?: number, isRetryable: boolean = false) {
    super(message);
    this.name = 'LLMApiError';
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
  }
}

/**
 * Call the OpenAI API with the given prompts
 * 
 * @param systemPrompt - The system prompt
 * @param userPrompt - The user prompt
 * @param apiKey - The API key to use
 * @param signal - Optional AbortSignal for cancellation
 * @returns The LLM response content
 */
async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(OPENAI_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    
    // Determine if error is retryable
    const isRetryable = response.status === 429 || // Rate limit
                        response.status === 500 || // Server error
                        response.status === 502 || // Bad gateway
                        response.status === 503 || // Service unavailable
                        response.status === 504;   // Gateway timeout

    throw new LLMApiError(
      `OpenAI API error: ${response.status} - ${errorBody}`,
      response.status,
      isRetryable
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new LLMApiError('Empty response from OpenAI API');
  }

  return content;
}

/**
 * Call the LLM API with retry logic
 * 
 * @param systemPrompt - The system prompt
 * @param userPrompt - The user prompt
 * @param apiKey - The API key to use
 * @param signal - Optional AbortSignal for cancellation
 * @returns The LLM response content
 */
async function callLLMWithRetry(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Create a timeout controller
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

      // Set up abort handling for external signal
      const handleExternalAbort = () => timeoutController.abort();
      if (signal) {
        signal.addEventListener('abort', handleExternalAbort);
      }

      try {
        const result = await callOpenAI(systemPrompt, userPrompt, apiKey, timeoutController.signal);
        clearTimeout(timeoutId);
        return result;
      } finally {
        clearTimeout(timeoutId);
        if (signal) {
          signal.removeEventListener('abort', handleExternalAbort);
        }
      }
    } catch (error) {
      lastError = error as Error;

      // Don't retry if aborted by user
      if (signal?.aborted) {
        throw error;
      }

      // Check if error is retryable
      if (error instanceof LLMApiError && !error.isRetryable) {
        throw error;
      }

      // Wait before retrying (except on last attempt)
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1)); // Exponential backoff
      }
    }
  }

  throw lastError || new LLMApiError('Failed after max retries');
}

// =============================================================================
// ProctorService Implementation
// =============================================================================

/**
 * ProctorService implementation with LLM integration and mock fallback
 * 
 * When an API key is configured, uses real LLM calls.
 * When no API key is available, falls back to mock responses.
 */
export class ProctorService implements IProctorService {
  private abortController: AbortController | null = null;

  /**
   * Check if LLM mode is available (API key is configured)
   */
  private isLLMAvailable(): boolean {
    return hasApiKey();
  }

  /**
   * Cancel any pending LLM request
   */
  cancelPendingRequest(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /**
   * Generate an introduction message for a problem
   * 
   * In LLM mode: Uses the live chat prompt to generate a personalized intro
   * In mock mode: Returns a template-based introduction
   * 
   * Requirements: 3.1 - WHEN an Assessment_Session begins, THE Proctor SHALL
   * introduce the problem and post the scaffold to the Code_Editor
   * 
   * @param problem The problem to introduce
   * @returns A friendly introduction message
   */
  async generateIntro(_problem: Problem): Promise<string> {
    // Realistic proctor intro - minimal and professional
    await simulateLatency(300, 600);

    return `Welcome to the assessment. When you're ready to begin, let me know.`;
  }

  /**
   * Respond to a user's question during the session
   * 
   * In LLM mode: Uses the live chat prompt to generate a contextual response
   * In mock mode: Returns pattern-matched responses
   * 
   * Requirements: 3.2, 3.3, 3.4
   * 
   * @param question The user's question
   * @param context The current session context
   * @returns A helpful response
   */
  async respondToQuestion(
      question: string,
      context: SessionContext
    ): Promise<string> {
      // Check if LLM mode is available
      if (this.isLLMAvailable()) {
        try {
          return await this.respondToQuestionLLM(question, context);
        } catch (error) {
          // If the API call fails for any reason, fall back to mock mode
          // This prevents the app from hanging on bad API keys or network errors
          console.warn('LLM chat call failed, falling back to mock mode:', error);
          return this.respondToQuestionMock(question, context);
        }
      }

      // Fall back to mock mode
      return this.respondToQuestionMock(question, context);
    }

  /**
   * Respond to a question using the LLM
   */
  private async respondToQuestionLLM(
    question: string,
    context: SessionContext
  ): Promise<string> {
    const apiKey = getStoredApiKey();
    if (!apiKey) {
      throw new LLMApiError('No API key configured');
    }

    // Build the prompt
    const { systemPrompt, userPrompt } = buildLiveChatPrompt({
      problem: context.problem,
      currentCode: context.currentCode,
      chatHistory: context.chatHistory,
      timeRemaining: context.timeRemaining,
      candidateMessage: question,
    });

    // Create abort controller for this request
    this.abortController = new AbortController();

    try {
      const response = await callLLMWithRetry(
        systemPrompt,
        userPrompt,
        apiKey,
        this.abortController.signal
      );
      return response;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Respond to a question using mock responses (fallback mode)
   */
  private async respondToQuestionMock(
      question: string,
      context: SessionContext
    ): Promise<string> {
      await simulateLatency();

      const questionLower = question.toLowerCase();
      const { currentCode, timeRemaining } = context;

      // Check if user has made progress
      const hasCode = currentCode && currentCode.trim().length > 50;
      const hasSignificantCode = currentCode && currentCode.trim().length > 200;

      // Time warning if under 5 minutes
      const timeWarning = timeRemaining < 300
        ? ` You have about ${Math.floor(timeRemaining / 60)} minutes left.`
        : '';

      // INTERVIEWER ROLE: Asking about approach/complexity/thinking
      
      // Candidate is narrating their approach
      if ((questionLower.includes('i think') || questionLower.includes('i\'m going to') ||
          questionLower.includes('i\'ll') || questionLower.includes('my plan')) && hasCode) {
        const responses = [
          'Sounds good. What\'s the complexity?',
          'Explain the idea.',
          'What are you watching for?',
          'Good. Keep going.',
        ];
        return responses[Math.floor(Math.random() * responses.length)];
      }

      // Candidate mentions an approach
      if (questionLower.includes('hashmap') || questionLower.includes('two pointer') ||
          questionLower.includes('sliding window') || questionLower.includes('prefix sum') ||
          questionLower.includes('dp') || questionLower.includes('bfs') || questionLower.includes('dfs')) {
        if (hasSignificantCode) {
          return 'Walk me through it.';
        }
        return 'What\'s your plan?';
      }

      // Candidate mentions complexity
      if (questionLower.includes('o(n)') || questionLower.includes('o(1)') ||
          questionLower.includes('time complexity') || questionLower.includes('space complexity')) {
        return 'Good.';
      }

      // Candidate is debugging/checking
      if (questionLower.includes('hidden test') || questionLower.includes('failed') ||
          questionLower.includes('bug') || questionLower.includes('error')) {
        const responses = [
          'What are you checking first?',
          'What\'s your hypothesis?',
          'That\'s a common one.',
        ];
        return responses[Math.floor(Math.random() * responses.length)];
      }

      // Candidate found something
      if (questionLower.includes('aha') || questionLower.includes('got it') ||
          questionLower.includes('i see') || questionLower.includes('makes sense')) {
        return 'Good catch.';
      }

      // PROCTOR ROLE: Clarifying questions and logistics

      // Clarifying questions about problem statement
      if (questionLower.includes('what does') || questionLower.includes('what is') || 
          questionLower.includes('does this mean') || questionLower.includes('clarify')) {
        return 'What specifically is unclear?';
      }

      // Can I assume / Is it okay to
      if (questionLower.includes('can i assume') || questionLower.includes('is it okay') ||
          questionLower.includes('should i') || questionLower.includes('do i need to')) {
        return 'That\'s up to you.';
      }

      // Asking for hints or help (proctor doesn't give these)
      if (questionLower.includes('hint') || questionLower.includes('help me') || 
          questionLower.includes('how do i') || questionLower.includes('how should i')) {
        if (!hasCode) {
          return `Can't give hints. What's your thinking?${timeWarning}`;
        }
        return `Can't help with approach. What have you tried?${timeWarning}`;
      }

      // Stuck / don't know what to do
      if (questionLower.includes('stuck') || questionLower.includes("don't know") ||
          questionLower.includes('not sure') || questionLower.includes('confused')) {
        if (!hasCode) {
          return `What's your plan?${timeWarning}`;
        }
        return `What have you tried?${timeWarning}`;
      }

      // Asking about approach or algorithm (interviewer asks back)
      if (questionLower.includes('which approach') || questionLower.includes('what algorithm') ||
          questionLower.includes('which data structure')) {
        return 'What are you thinking?';
      }

      // Is this right / correct
      if (questionLower.includes('is this right') || questionLower.includes('is this correct') ||
          questionLower.includes('does this work') || questionLower.includes('will this')) {
        return 'Test it with the examples.';
      }

      // Bathroom break / technical issues
      if (questionLower.includes('bathroom') || questionLower.includes('break') ||
          questionLower.includes('technical') || questionLower.includes('issue')) {
        return 'Sure. Timer keeps running.';
      }

      // Time check
      if (questionLower.includes('time') && (questionLower.includes('how much') || 
          questionLower.includes('left') || questionLower.includes('remaining'))) {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')} left.`;
      }

      // Candidate is narrating progress (proctor acknowledges)
      if (hasCode && (questionLower.includes('okay') || questionLower.includes('alright') ||
          questionLower.includes('done') || questionLower.includes('submitting'))) {
        const responses = [
          'Sounds good.',
          'Keep going.',
          'Alright.',
        ];
        return responses[Math.floor(Math.random() * responses.length)];
      }

      // Edge cases question
      if (questionLower.includes('edge case') || questionLower.includes('corner case')) {
        return 'What edge cases?';
      }

      // Complexity question (interviewer asks them to explain)
      if (questionLower.includes('complexity') || questionLower.includes('big o')) {
        return 'What do you think?';
      }

      // Default: Proctor stays neutral
      if (!hasCode) {
        return `Clarifying questions only.${timeWarning}`;
      }

      return 'Keep going.';
    }

  /**
   * Evaluate the user's code submission
   * 
   * In LLM mode: Uses the evaluation prompt to get rubric-based feedback
   * In mock mode: Returns analysis-based mock evaluation
   * 
   * Requirements: 4.1 - WHEN the user clicks "I'm done" or time expires,
   * THE Proctor SHALL evaluate the Code_Editor content using the Rubric
   * 
   * @param code The user's submitted code
   * @param problem The problem being solved
   * @param chatHistory The chat history from the session
   * @returns The evaluation result
   */
  async evaluate(
      code: string,
      problem: Problem,
      chatHistory: ChatMessage[]
    ): Promise<EvaluationResult> {
      // Check if LLM mode is available
      if (this.isLLMAvailable()) {
        try {
          return await this.evaluateLLM(code, problem, chatHistory);
        } catch (error) {
          // If the API call fails for any reason, fall back to mock mode
          // This prevents the app from freezing on bad API keys or network errors
          console.warn('LLM evaluation call failed, falling back to mock mode:', error);
          return this.evaluateMock(code, problem, chatHistory);
        }
      }

      // Fall back to mock mode
      return this.evaluateMock(code, problem, chatHistory);
    }

  /**
   * Evaluate using the LLM
   */
  private async evaluateLLM(
    code: string,
    problem: Problem,
    chatHistory: ChatMessage[]
  ): Promise<EvaluationResult> {
    const apiKey = getStoredApiKey();
    if (!apiKey) {
      throw new LLMApiError('No API key configured');
    }

    // Calculate duration (approximate - we don't have exact start time here)
    const durationSeconds = problem.timeLimit * 60;

    // Build the prompt
    const { systemPrompt, userPrompt } = buildEvaluationPrompt({
      problem,
      finalCode: code,
      chatHistory,
      durationSeconds,
    });

    // Create abort controller for this request
    this.abortController = new AbortController();

    try {
      // First attempt
      let llmResponse = await callLLMWithRetry(
        systemPrompt,
        userPrompt,
        apiKey,
        this.abortController.signal
      );

      try {
        const result = evaluationService.parseEvaluationResponse(llmResponse);
        
        // Apply fallback miss tag derivation if model omits tags
        if (result.missTags.length === 0) {
          result.missTags = deriveMissTagsFromScores(result.scores);
        }

        return result;
      } catch (parseError) {
        // Only retry for parse errors
        if (!(parseError instanceof EvaluationParseError)) {
          throw parseError;
        }

        // Retry with stricter prompt
        const retryPrompt = userPrompt +
          '\n\nIMPORTANT: Respond with ONLY valid JSON that matches the required schema exactly. No markdown, no code fences, no extra text.';

        llmResponse = await callLLMWithRetry(
          systemPrompt,
          retryPrompt,
          apiKey,
          this.abortController.signal
        );

        const result = evaluationService.parseEvaluationResponse(llmResponse);

        // Apply fallback miss tag derivation if model omits tags
        if (result.missTags.length === 0) {
          result.missTags = deriveMissTagsFromScores(result.scores);
        }

        return result;
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Evaluate using mock responses (fallback mode)
   */
  private async evaluateMock(
    code: string,
    problem: Problem,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _chatHistory: ChatMessage[]
  ): Promise<EvaluationResult> {
    await simulateLatency(800, 1500); // Slightly longer delay for evaluation

    // Analyze the code to provide somewhat realistic mock feedback
    const codeLength = code.trim().length;
    const hasImplementation = codeLength > problem.scaffold.length + 50;
    const hasComments = code.includes('#') || code.includes('//') || code.includes('/*') || code.includes('"""');
    const hasLoops = /\b(for|while|map|filter|reduce)\b/.test(code);
    const hasConditionals = /\b(if|elif|else)\b/.test(code);

    // Generate scores based on code analysis
    let approachScore = 2;
    let completenessScore = 2;
    let complexityScore = 2;
    let communicationScore = 2;

    if (hasImplementation) {
      approachScore = hasLoops && hasConditionals ? 3 : 2;
      completenessScore = codeLength > 200 ? 3 : 2;
    }

    if (hasComments) {
      communicationScore = 3;
    }

    // Adjust based on code patterns
    if (hasLoops && hasConditionals && hasImplementation) {
      approachScore = Math.min(4, approachScore + 1);
      complexityScore = 3;
    }

    // Calculate verdict based on scores
    const total = approachScore + completenessScore + complexityScore + communicationScore;
    const minScore = Math.min(approachScore, completenessScore, complexityScore, communicationScore);

    let verdict: 'Pass' | 'Borderline' | 'No Pass';
    if (total >= 13 && minScore >= 3) {
      verdict = 'Pass';
    } else if (total <= 8 || approachScore <= 1) {
      verdict = 'No Pass';
    } else {
      verdict = 'Borderline';
    }

    // Generate feedback
    const strengths: string[] = [];
    const improvements: string[] = [];

    if (hasImplementation) {
      strengths.push('You made a solid attempt at implementing a solution');
    }
    if (hasLoops) {
      strengths.push('Good use of iteration to process the input');
    }
    if (hasComments) {
      strengths.push('Nice job adding comments to explain your thinking');
    }
    if (hasConditionals) {
      strengths.push('Appropriate use of conditional logic');
    }

    // Add improvements based on common pitfalls
    if (problem.commonPitfalls.length > 0) {
      improvements.push(`Watch out for: ${problem.commonPitfalls[0]}`);
    }
    if (!hasComments) {
      improvements.push('Consider adding comments to explain your approach');
    }
    improvements.push('Think about edge cases and how your solution handles them');

    // Ensure we have at least 2 items in each array
    if (strengths.length === 0) {
      strengths.push('You attempted the problem within the time limit');
      strengths.push('Keep practicing to improve your problem-solving skills');
    }
    if (improvements.length < 2) {
      improvements.push('Practice breaking down problems into smaller steps');
    }

    // Generate miss tags using the fallback derivation
    const scores = {
      approach: approachScore,
      completeness: completenessScore,
      complexity: complexityScore,
      communication: communicationScore,
    };
    const missTags = deriveMissTagsFromScores(scores);

    // Generate ideal solution based on problem
    const idealSolution = this.generateIdealSolution(problem);

    return {
      verdict,
      scores,
      feedback: {
        strengths: strengths.slice(0, 3),
        improvements: improvements.slice(0, 3),
      },
      idealSolution,
      missTags,
    };
  }

  /**
   * Generate an ideal solution for a problem
   * 
   * @param problem The problem to generate a solution for
   * @returns A string containing the ideal solution code
   */
  private generateIdealSolution(problem: Problem): string {
      // Return problem-specific ideal solutions in Python
      switch (problem.id) {
        case 'fizzbuzz':
          return `def fizz_buzz(n: int) -> list[str]:
      result = []

      for i in range(1, n + 1):
          if i % 15 == 0:
              result.append("FizzBuzz")
          elif i % 3 == 0:
              result.append("Fizz")
          elif i % 5 == 0:
              result.append("Buzz")
          else:
              result.append(str(i))

      return result

  # Key insight: Check for divisibility by 15 first (or both 3 AND 5)
  # to handle the FizzBuzz case before checking individual divisibility.
  # Time complexity: O(n), Space complexity: O(n) for the result list.`;

        case 'two-sum':
          return `def two_sum(nums: list[int], target: int) -> list[int]:
      seen = {}

      for i, num in enumerate(nums):
          complement = target - num

          if complement in seen:
              return [seen[complement], i]

          seen[num] = i

      return []  # No solution found (shouldn't happen per constraints)

  # Key insight: Use a dictionary to store numbers we've seen and their indices.
  # For each number, check if its complement (target - current) exists in the dict.
  # Time complexity: O(n), Space complexity: O(n) for the dictionary.`;

        case 'valid-parentheses':
          return `def is_valid(s: str) -> bool:
      stack = []
      pairs = {")": "(", "]": "[", "}": "{"}

      for char in s:
          if char in pairs.values():
              stack.append(char)
          elif char in pairs:
              if not stack or stack.pop() != pairs[char]:
                  return False

      return len(stack) == 0

  # Key insight: Use a stack to track opening brackets.
  # When we see a closing bracket, the most recent opening bracket must match.
  # Time complexity: O(n), Space complexity: O(n) for the stack.`;

        case 'reverse-string':
          return `def reverse_string(s: list[str]) -> None:
      left = 0
      right = len(s) - 1

      while left < right:
          s[left], s[right] = s[right], s[left]
          left += 1
          right -= 1

  # Key insight: Use two pointers, one at each end, and swap characters
  # while moving toward the center. This achieves O(1) extra space.
  # Time complexity: O(n), Space complexity: O(1).`;

        case 'palindrome-number':
          return `def is_palindrome(x: int) -> bool:
      # Negative numbers are never palindromes
      if x < 0:
          return False

      # Numbers ending in 0 are only palindromes if they are 0
      if x != 0 and x % 10 == 0:
          return False

      reversed_num = 0
      original = x

      while x > 0:
          reversed_num = reversed_num * 10 + x % 10
          x //= 10

      return original == reversed_num

  # Key insight: Reverse the number mathematically and compare.
  # Handle edge cases: negative numbers and numbers ending in 0.
  # Time complexity: O(log n), Space complexity: O(1).`;

        default:
          // Generic ideal solution template
          return `# Ideal solution for ${problem.title}
  #
  # Approach: ${problem.expectedApproach}
  #
  # ${problem.idealSolutionOutline}
  #
  # Time complexity: Analyze based on the approach
  # Space complexity: Consider additional data structures used`;
      }
    }
}

// Export singleton instance for convenience
export const proctorService = new ProctorService();
