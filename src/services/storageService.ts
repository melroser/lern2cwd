/**
 * StorageService - Handles localStorage persistence with quota management
 * 
 * Features:
 * - Save, retrieve, and clear session records
 * - Monitor storage usage and warn at 80% capacity
 * - Auto-prune oldest sessions when quota exceeded (LRU strategy)
 * - Validate JSON on load, skip corrupted records gracefully
 * - Do NOT store system prompts (reconstruct from problem metadata)
 * 
 * Requirements: 9.1, 9.4, 9.5
 */

import type { 
  SessionRecord, 
  StorageServiceInterface, 
  StorageUsage,
  ChatMessage,
  RubricScores,
  Verdict,
  MissTag,
  EvaluationResult,
  EvaluationAnnotation,
  SessionProblemSnapshot,
} from '../types';

// Storage key for sessions array
const STORAGE_KEY = 'coding-interview-sessions';

// Approximate localStorage limit (5MB in most browsers)
const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

// Warning threshold percentage
const WARNING_THRESHOLD = 0.8;

// Minimum sessions to keep during pruning
const MIN_SESSIONS_TO_KEEP = 10;

/**
 * Validates that a value is a valid ChatMessage
 */
function isValidChatMessage(msg: unknown): msg is ChatMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    (m.role === 'user' || m.role === 'proctor') &&
    typeof m.content === 'string' &&
    typeof m.timestamp === 'number'
  );
}

/**
 * Validates that a value is a valid RubricScores object
 */
function isValidRubricScores(scores: unknown): scores is RubricScores {
  if (!scores || typeof scores !== 'object') return false;
  const s = scores as Record<string, unknown>;
  return (
    typeof s.approach === 'number' && s.approach >= 0 && s.approach <= 4 &&
    typeof s.completeness === 'number' && s.completeness >= 0 && s.completeness <= 4 &&
    typeof s.complexity === 'number' && s.complexity >= 0 && s.complexity <= 4 &&
    typeof s.communication === 'number' && s.communication >= 0 && s.communication <= 4
  );
}

/**
 * Validates that a value is a valid Verdict
 */
function isValidVerdict(verdict: unknown): verdict is Verdict {
  return verdict === 'Pass' || verdict === 'Borderline' || verdict === 'No Pass';
}

/**
 * Validates that a value is a valid MissTag array
 */
function isValidMissTags(tags: unknown): tags is MissTag[] {
  if (!Array.isArray(tags)) return false;
  const validTags: readonly string[] = [
    'edge-cases',
    'complexity-analysis',
    'incorrect-approach',
    'incomplete-solution',
    'unclear-communication',
    'wrong-data-structure',
    'off-by-one',
    'constraints-missed',
    'testing-mentality',
  ];
  return tags.every(tag => typeof tag === 'string' && validTags.includes(tag));
}

function isValidEvaluationAnnotations(annotations: unknown): annotations is EvaluationAnnotation[] {
  if (annotations === undefined) return true;
  if (!Array.isArray(annotations)) return false;

  return annotations.every((annotation) => {
    if (!annotation || typeof annotation !== 'object') return false;
    const a = annotation as Record<string, unknown>;
    return (
      (a.target === 'candidate' || a.target === 'ideal') &&
      typeof a.line === 'number' &&
      Number.isInteger(a.line) &&
      a.line >= 1 &&
      typeof a.message === 'string' &&
      a.message.trim().length > 0 &&
      (a.severity === 'info' || a.severity === 'warning' || a.severity === 'error')
    );
  });
}

function isValidProblemSnapshot(snapshot: unknown): snapshot is SessionProblemSnapshot {
  if (snapshot === undefined) return true;
  if (!snapshot || typeof snapshot !== 'object') return false;

  const s = snapshot as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.title === 'string' &&
    (
      s.language === 'javascript' ||
      s.language === 'python' ||
      s.language === 'typescript' ||
      s.language === 'sql' ||
      s.language === 'yaml' ||
      s.language === 'dockerfile'
    ) &&
    (s.difficulty === 'easy' || s.difficulty === 'medium' || s.difficulty === 'hard') &&
    typeof s.timeLimit === 'number' &&
    typeof s.prompt === 'string' &&
    Array.isArray(s.constraints) &&
    s.constraints.every((value) => typeof value === 'string') &&
    Array.isArray(s.examples)
  );
}

/**
 * Validates that a value is a valid EvaluationResult
 */
function isValidEvaluationResult(eval_: unknown): eval_ is EvaluationResult {
  if (!eval_ || typeof eval_ !== 'object') return false;
  const e = eval_ as Record<string, unknown>;
  
  if (!isValidVerdict(e.verdict)) return false;
  if (!isValidRubricScores(e.scores)) return false;
  
  // Validate feedback
  if (!e.feedback || typeof e.feedback !== 'object') return false;
  const feedback = e.feedback as Record<string, unknown>;
  if (!Array.isArray(feedback.strengths) || !feedback.strengths.every(s => typeof s === 'string')) return false;
  if (!Array.isArray(feedback.improvements) || !feedback.improvements.every(s => typeof s === 'string')) return false;
  
  if (typeof e.idealSolution !== 'string') return false;
  if (!isValidMissTags(e.missTags)) return false;
  if (!isValidEvaluationAnnotations(e.annotations)) return false;
  
  return true;
}

/**
 * Validates that a value is a valid SessionRecord
 */
function isValidSessionRecord(record: unknown): record is SessionRecord {
  if (!record || typeof record !== 'object') return false;
  const r = record as Record<string, unknown>;
  
  // Check required string fields
  if (typeof r.id !== 'string' || r.id.length === 0) return false;
  if (typeof r.problemId !== 'string' || r.problemId.length === 0) return false;
  if (typeof r.problemTitle !== 'string') return false;
  
  // Check required number fields
  if (typeof r.timestamp !== 'number' || !Number.isFinite(r.timestamp)) return false;
  if (typeof r.duration !== 'number' || !Number.isFinite(r.duration)) return false;
  
  // Check finalCode
  if (typeof r.finalCode !== 'string') return false;
  
  // Check chatTranscript
  if (!Array.isArray(r.chatTranscript)) return false;
  if (!r.chatTranscript.every(isValidChatMessage)) return false;
  
  // Check evaluation
  if (!isValidEvaluationResult(r.evaluation)) return false;
  if (!isValidProblemSnapshot(r.problemSnapshot)) return false;
  
  return true;
}

/**
 * StorageService implementation
 */
export class StorageService implements StorageServiceInterface {
  private warningCallback?: (usage: StorageUsage) => void;

  /**
   * Set a callback to be called when storage usage exceeds 80%
   */
  setWarningCallback(callback: (usage: StorageUsage) => void): void {
    this.warningCallback = callback;
  }

  /**
   * Save a session record to localStorage
   * Auto-prunes if quota is exceeded
   */
  saveSession(session: SessionRecord): void {
    const sessions = this.getSessions();
    
    // Check if session already exists (update) or is new (add)
    const existingIndex = sessions.findIndex(s => s.id === session.id);
    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      sessions.push(session);
    }
    
    // Sort by timestamp (newest first) for consistent ordering
    sessions.sort((a, b) => b.timestamp - a.timestamp);
    
    // Try to save, auto-prune if quota exceeded
    this.saveSessionsWithQuotaHandling(sessions);
    
    // Check and warn if usage is high
    this.checkAndWarnUsage();
  }

  /**
   * Get all session records from localStorage
   * Validates JSON and skips corrupted records
   */
  getSessions(): SessionRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) {
        console.warn('StorageService: Sessions data is not an array, returning empty');
        return [];
      }
      
      // Filter out corrupted records
      const validSessions: SessionRecord[] = [];
      for (const record of parsed) {
        if (isValidSessionRecord(record)) {
          validSessions.push(record);
        } else {
          console.warn('StorageService: Skipping corrupted session record:', record?.id || 'unknown');
        }
      }
      
      return validSessions;
    } catch (error) {
      console.warn('StorageService: Failed to parse sessions from localStorage:', error);
      return [];
    }
  }

  /**
   * Get a specific session by ID
   */
  getSession(id: string): SessionRecord | null {
    const sessions = this.getSessions();
    return sessions.find(s => s.id === id) || null;
  }

  /**
   * Clear all session records from localStorage
   */
  clearSessions(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('StorageService: Failed to clear sessions:', error);
    }
  }

  /**
   * Get current storage usage information
   */
  getStorageUsage(): StorageUsage {
    let used = 0;
    
    try {
      // Calculate total localStorage usage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            // Each character is 2 bytes in JavaScript strings (UTF-16)
            used += (key.length + value.length) * 2;
          }
        }
      }
    } catch (error) {
      console.warn('StorageService: Failed to calculate storage usage:', error);
    }
    
    return {
      used,
      limit: STORAGE_LIMIT_BYTES,
      percentage: used / STORAGE_LIMIT_BYTES,
    };
  }

  /**
   * Prune old sessions using LRU strategy (delete oldest completed sessions)
   * @param keepCount Number of most recent sessions to keep
   */
  pruneOldSessions(keepCount: number): void {
    const sessions = this.getSessions();
    
    if (sessions.length <= keepCount) {
      return; // Nothing to prune
    }
    
    // Sessions are already sorted by timestamp (newest first)
    // Keep only the most recent `keepCount` sessions
    const sessionsToKeep = sessions.slice(0, keepCount);
    
    this.saveSessions(sessionsToKeep);
  }

  /**
   * Internal method to save sessions array to localStorage
   */
  private saveSessions(sessions: SessionRecord[]): void {
    try {
      const data = JSON.stringify(sessions);
      localStorage.setItem(STORAGE_KEY, data);
    } catch (error) {
      // Re-throw quota errors for handling
      if (this.isQuotaError(error)) {
        throw error;
      }
      console.warn('StorageService: Failed to save sessions:', error);
    }
  }

  /**
   * Save sessions with automatic quota handling
   * If quota is exceeded, prune oldest sessions and retry
   */
  private saveSessionsWithQuotaHandling(sessions: SessionRecord[]): void {
    try {
      this.saveSessions(sessions);
    } catch (error) {
      if (this.isQuotaError(error)) {
        console.warn('StorageService: Quota exceeded, pruning old sessions');
        
        // Prune to minimum sessions and retry
        const prunedSessions = sessions.slice(0, MIN_SESSIONS_TO_KEEP);
        
        try {
          this.saveSessions(prunedSessions);
        } catch (retryError) {
          // If still failing, try with even fewer sessions
          if (this.isQuotaError(retryError) && prunedSessions.length > 1) {
            console.warn('StorageService: Still over quota, keeping only most recent session');
            this.saveSessions(prunedSessions.slice(0, 1));
          } else {
            throw retryError;
          }
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Check if an error is a quota exceeded error
   */
  private isQuotaError(error: unknown): boolean {
    if (error instanceof DOMException) {
      // Different browsers use different error names/codes
      return (
        error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22 // Legacy quota exceeded code
      );
    }
    return false;
  }

  /**
   * Check storage usage and call warning callback if over threshold
   */
  private checkAndWarnUsage(): void {
    const usage = this.getStorageUsage();
    
    if (usage.percentage >= WARNING_THRESHOLD && this.warningCallback) {
      this.warningCallback(usage);
    }
  }
}

// Export singleton instance for convenience
export const storageService = new StorageService();
