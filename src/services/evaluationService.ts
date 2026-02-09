/**
 * EvaluationService - Validation and fallback logic for LLM evaluation responses
 * 
 * Features:
 * - Parse and validate LLM evaluation JSON responses
 * - Extract JSON from plain text, fenced code blocks, or extra text
 * - Clamp scores to 0-4 range
 * - Validate verdict is one of Pass, Borderline, No Pass
 * - Fallback verdict computation when LLM verdict is missing/invalid
 * - MissTag allowlist enforcement (max 4 tags, deduplicated)
 * - Retry once with stricter prompt on parse failure
 * 
 * AUTHORITY MODEL:
 * - LLM verdict is authoritative when present and valid
 * - Fallback is ONLY used if verdict field is missing, empty, or invalid
 * 
 * Requirements: 4.2, 4.3, 9.2
 */

import type {
  EvaluationResult,
  EvaluationServiceInterface,
  MissTag,
  RubricScores,
  Verdict,
} from '../types';

// Valid verdicts
const VERDICTS: readonly Verdict[] = ['Pass', 'Borderline', 'No Pass'] as const;

// Valid miss tags (allowlist)
const MISS_TAGS: readonly MissTag[] = [
  'edge-cases',
  'complexity-analysis',
  'incorrect-approach',
  'incomplete-solution',
  'unclear-communication',
  'wrong-data-structure',
  'off-by-one',
  'constraints-missed',
  'testing-mentality',
] as const;

const MISS_TAG_SET = new Set<string>(MISS_TAGS);

/**
 * Custom error for evaluation parsing failures
 * Includes the raw LLM response for debugging
 */
export class EvaluationParseError extends Error {
  public readonly raw: string;
  
  constructor(message: string, raw: string) {
    super(message);
    this.name = 'EvaluationParseError';
    this.raw = raw;
  }
}

/**
 * Clamp a value to an integer within a range
 * Returns fallback if value is not a finite number
 */
function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  const r = Math.round(x);
  return Math.min(max, Math.max(min, r));
}

/**
 * Convert unknown value to string array
 * Filters out empty strings after trimming
 */
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x : String(x)))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Get first N non-empty strings from array
 */
function firstNonEmpty(arr: string[], maxItems: number): string[] {
  return arr
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, maxItems);
}

/**
 * Isolate JSON object from text by finding first { and last }
 */
function isolateBraces(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

/**
 * Extract the first JSON object from a string.
 * Supports:
 * - plain JSON
 * - ```json ... ``` fenced output
 * - extra text before/after by slicing from first "{" to last "}"
 */
function extractJsonObject(text: string): string | null {
  const t = text.trim();

  // Try to extract from ```json ... ``` fenced code block
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    const inner = fenceMatch[1].trim();
    return isolateBraces(inner) ?? inner;
  }

  return isolateBraces(t);
}

/**
 * EvaluationService implementation
 */
export class EvaluationService implements EvaluationServiceInterface {
  /**
   * Parse and validate LLM evaluation JSON into a safe EvaluationResult.
   * 
   * Features:
   * - Strict JSON parsing (with salvage of fenced/extra text)
   * - Score clamp (0–4)
   * - MissTags allowlist + 1–4 max + de-dupe
   * - Verdict enum validation w/ fallback computation
   * - Requires feedback + idealSolution (throws if missing → triggers retry)
   * 
   * @throws EvaluationParseError if JSON cannot be parsed or required fields are missing
   */
  parseEvaluationResponse(llmResponse: string): EvaluationResult {
    const jsonStr = extractJsonObject(llmResponse);
    if (!jsonStr) {
      throw new EvaluationParseError('Could not find JSON object in LLM output.', llmResponse);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new EvaluationParseError('Invalid JSON in LLM output.', llmResponse);
    }

    // Parse and clamp scores
    const rawScores = (parsed?.scores ?? {}) as Record<string, unknown>;
    const scores: RubricScores = {
      approach: clampInt(rawScores.approach, 0, 4, 0),
      completeness: clampInt(rawScores.completeness, 0, 4, 0),
      complexity: clampInt(rawScores.complexity, 0, 4, 0),
      communication: clampInt(rawScores.communication, 0, 4, 0),
    };

    // Parse verdict with fallback
    const rawVerdict = typeof parsed?.verdict === 'string' ? parsed.verdict.trim() : '';
    const verdict: Verdict = (VERDICTS as readonly string[]).includes(rawVerdict)
      ? (rawVerdict as Verdict)
      : this.calculateFallbackVerdict(scores);

    // Parse feedback
    const fb = (parsed?.feedback ?? {}) as Record<string, unknown>;
    const strengths = firstNonEmpty(asStringArray(fb.strengths), 8);
    const improvements = firstNonEmpty(asStringArray(fb.improvements), 8);

    // Parse ideal solution
    const idealSolution =
      typeof parsed?.idealSolution === 'string' ? parsed.idealSolution.trim() : '';

    // Parse and validate miss tags
    const rawTags = asStringArray(parsed?.missTags);
    const missTags: MissTag[] = Array.from(
      new Set(rawTags.filter((t) => MISS_TAG_SET.has(t)).slice(0, 4))
    ) as MissTag[];

    // Enforce minimum useful payload (so we can retry once)
    if (!idealSolution) {
      throw new EvaluationParseError('Missing idealSolution in evaluation JSON.', llmResponse);
    }
    if (strengths.length === 0 && improvements.length === 0) {
      throw new EvaluationParseError('Missing feedback strengths/improvements.', llmResponse);
    }

    return {
      verdict,
      scores,
      feedback: { strengths, improvements },
      idealSolution,
      missTags,
    };
  }

  /**
   * Validate that an EvaluationResult has all required fields with correct types and ranges
   */
  validateEvaluationResult(result: EvaluationResult): boolean {
    // Validate verdict
    if (!VERDICTS.includes(result.verdict)) {
      return false;
    }

    // Validate scores
    const { scores } = result;
    if (!scores || typeof scores !== 'object') {
      return false;
    }
    
    const scoreKeys: (keyof RubricScores)[] = ['approach', 'completeness', 'complexity', 'communication'];
    for (const key of scoreKeys) {
      const score = scores[key];
      if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 4) {
        return false;
      }
    }

    // Validate feedback
    const { feedback } = result;
    if (!feedback || typeof feedback !== 'object') {
      return false;
    }
    if (!Array.isArray(feedback.strengths) || !feedback.strengths.every(s => typeof s === 'string')) {
      return false;
    }
    if (!Array.isArray(feedback.improvements) || !feedback.improvements.every(s => typeof s === 'string')) {
      return false;
    }

    // Validate idealSolution
    if (typeof result.idealSolution !== 'string' || result.idealSolution.trim().length === 0) {
      return false;
    }

    // Validate missTags
    if (!Array.isArray(result.missTags)) {
      return false;
    }
    if (result.missTags.length > 4) {
      return false;
    }
    if (!result.missTags.every(tag => MISS_TAG_SET.has(tag))) {
      return false;
    }

    return true;
  }

  /**
   * Fallback verdict computation - ONLY used when LLM verdict is missing/invalid.
   * 
   * AUTHORITY MODEL:
   * - LLM verdict is authoritative when present and valid
   * - Fallback is ONLY used if verdict field is missing, empty, or not in ["Pass", "Borderline", "No Pass"]
   * - This allows LLM to make nuanced judgments (e.g., "Pass" for creative solutions with lower scores)
   * 
   * Fallback rules (mirror prompt for consistency):
   * - Pass: total >= 13 AND no category < 3
   * - No Pass: total <= 8 OR approach <= 1
   * - Borderline: everything else
   */
  calculateFallbackVerdict(scores: RubricScores): Verdict {
    const total =
      scores.approach + scores.completeness + scores.complexity + scores.communication;

    const minCategory = Math.min(
      scores.approach,
      scores.completeness,
      scores.complexity,
      scores.communication
    );

    if (total >= 13 && minCategory >= 3) return 'Pass';
    if (total <= 8 || scores.approach <= 1) return 'No Pass';
    return 'Borderline';
  }

  /**
   * Extract miss tags from an evaluation result
   * Returns the missTags array from the result (already validated)
   */
  extractMissTags(evaluation: EvaluationResult): MissTag[] {
    return evaluation.missTags;
  }
}

/**
 * Get evaluation with retry-once logic on parse failure
 * 
 * @param opts.callLLM - Function to call the LLM with a prompt
 * @param opts.prompt - The evaluation prompt to send
 * @returns Parsed and validated EvaluationResult
 * @throws EvaluationParseError if both attempts fail
 */
export async function getEvaluationWithRetry(opts: {
  callLLM: (prompt: string) => Promise<string>;
  prompt: string;
}): Promise<EvaluationResult> {
  const { callLLM, prompt } = opts;
  const service = new EvaluationService();

  const first = await callLLM(prompt);
  try {
    return service.parseEvaluationResponse(first);
  } catch (err) {
    // Only retry for parse/shape errors
    if (!(err instanceof EvaluationParseError)) throw err;

    const retryPrompt =
      prompt +
      '\n\nIMPORTANT: Respond with ONLY valid JSON that matches the required schema exactly. No markdown, no code fences, no extra text.';

    const second = await callLLM(retryPrompt);
    return service.parseEvaluationResponse(second);
  }
}

// Export singleton instance for convenience
export const evaluationService = new EvaluationService();
