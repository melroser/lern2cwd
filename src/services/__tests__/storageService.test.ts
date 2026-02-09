/**
 * Unit tests for StorageService
 * 
 * Tests localStorage persistence with quota management:
 * - saveSession: Save session records
 * - getSessions: Retrieve all sessions with validation
 * - getSession: Retrieve specific session by ID
 * - clearSessions: Remove all sessions
 * - getStorageUsage: Check localStorage quota usage
 * - pruneOldSessions: LRU eviction strategy
 * 
 * Requirements: 9.1, 9.4, 9.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageService } from '../storageService';
import type { SessionRecord } from '../../types';

// Helper to create a valid session record
function createValidSessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    problemId: 'fizzbuzz',
    problemTitle: 'FizzBuzz',
    timestamp: Date.now(),
    duration: 300,
    finalCode: 'function fizzBuzz(n) { return n; }',
    chatTranscript: [
      {
        id: 'msg-1',
        role: 'proctor',
        content: 'Welcome to the assessment!',
        timestamp: Date.now() - 1000,
      },
      {
        id: 'msg-2',
        role: 'user',
        content: 'Thanks!',
        timestamp: Date.now(),
      },
    ],
    evaluation: {
      verdict: 'Pass',
      scores: {
        approach: 4,
        completeness: 3,
        complexity: 3,
        communication: 4,
      },
      feedback: {
        strengths: ['Good approach', 'Clear code'],
        improvements: ['Consider edge cases'],
      },
      idealSolution: 'function fizzBuzz(n) { /* ideal */ }',
      missTags: ['edge-cases'],
    },
    ...overrides,
  };
}

describe('StorageService', () => {
  let service: StorageService;
  const STORAGE_KEY = 'coding-interview-sessions';

  beforeEach(() => {
    service = new StorageService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveSession', () => {
    it('should save a session record to localStorage', () => {
      const session = createValidSessionRecord({ id: 'test-session-1' });
      
      service.saveSession(session);
      
      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).not.toBeNull();
      
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('test-session-1');
    });

    it('should update an existing session with the same ID', () => {
      const session1 = createValidSessionRecord({ 
        id: 'test-session-1',
        finalCode: 'original code',
      });
      const session2 = createValidSessionRecord({ 
        id: 'test-session-1',
        finalCode: 'updated code',
      });
      
      service.saveSession(session1);
      service.saveSession(session2);
      
      const sessions = service.getSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].finalCode).toBe('updated code');
    });

    it('should add multiple sessions with different IDs', () => {
      const session1 = createValidSessionRecord({ id: 'session-1', timestamp: 1000 });
      const session2 = createValidSessionRecord({ id: 'session-2', timestamp: 2000 });
      const session3 = createValidSessionRecord({ id: 'session-3', timestamp: 3000 });
      
      service.saveSession(session1);
      service.saveSession(session2);
      service.saveSession(session3);
      
      const sessions = service.getSessions();
      expect(sessions).toHaveLength(3);
    });

    it('should sort sessions by timestamp (newest first)', () => {
      const oldSession = createValidSessionRecord({ id: 'old', timestamp: 1000 });
      const newSession = createValidSessionRecord({ id: 'new', timestamp: 3000 });
      const midSession = createValidSessionRecord({ id: 'mid', timestamp: 2000 });
      
      service.saveSession(oldSession);
      service.saveSession(newSession);
      service.saveSession(midSession);
      
      const sessions = service.getSessions();
      expect(sessions[0].id).toBe('new');
      expect(sessions[1].id).toBe('mid');
      expect(sessions[2].id).toBe('old');
    });
  });

  describe('getSessions', () => {
    it('should return empty array when no sessions exist', () => {
      const sessions = service.getSessions();
      expect(sessions).toEqual([]);
    });

    it('should return all valid sessions', () => {
      const session1 = createValidSessionRecord({ id: 'session-1' });
      const session2 = createValidSessionRecord({ id: 'session-2' });
      
      service.saveSession(session1);
      service.saveSession(session2);
      
      const sessions = service.getSessions();
      expect(sessions).toHaveLength(2);
    });

    it('should skip corrupted records and return valid ones', () => {
      // Manually insert corrupted data
      const validSession = createValidSessionRecord({ id: 'valid-session' });
      const corruptedData = [
        validSession,
        { id: 'corrupted', problemId: 123 }, // Invalid: problemId should be string
        { id: 'missing-fields' }, // Invalid: missing required fields
      ];
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(corruptedData));
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sessions = service.getSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('valid-session');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should return empty array for invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not valid json {{{');
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sessions = service.getSessions();
      
      expect(sessions).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should return empty array if stored data is not an array', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ notAnArray: true }));
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sessions = service.getSessions();
      
      expect(sessions).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should validate chat transcript messages', () => {
      const sessionWithInvalidChat = {
        ...createValidSessionRecord({ id: 'test' }),
        chatTranscript: [
          { id: 'msg-1', role: 'invalid-role', content: 'test', timestamp: 123 },
        ],
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify([sessionWithInvalidChat]));
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sessions = service.getSessions();
      
      expect(sessions).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should validate evaluation scores are in range 0-4', () => {
      const sessionWithInvalidScores = {
        ...createValidSessionRecord({ id: 'test' }),
        evaluation: {
          ...createValidSessionRecord().evaluation,
          scores: {
            approach: 5, // Invalid: > 4
            completeness: 3,
            complexity: 3,
            communication: 3,
          },
        },
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify([sessionWithInvalidScores]));
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sessions = service.getSessions();
      
      expect(sessions).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should validate verdict is one of Pass, Borderline, No Pass', () => {
      const sessionWithInvalidVerdict = {
        ...createValidSessionRecord({ id: 'test' }),
        evaluation: {
          ...createValidSessionRecord().evaluation,
          verdict: 'Invalid Verdict',
        },
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify([sessionWithInvalidVerdict]));
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sessions = service.getSessions();
      
      expect(sessions).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should validate missTags are from allowed list', () => {
      const sessionWithInvalidTags = {
        ...createValidSessionRecord({ id: 'test' }),
        evaluation: {
          ...createValidSessionRecord().evaluation,
          missTags: ['invalid-tag'],
        },
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify([sessionWithInvalidTags]));
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sessions = service.getSessions();
      
      expect(sessions).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('getSession', () => {
    it('should return a session by ID', () => {
      const session = createValidSessionRecord({ id: 'target-session' });
      service.saveSession(session);
      
      const result = service.getSession('target-session');
      
      expect(result).not.toBeNull();
      expect(result?.id).toBe('target-session');
    });

    it('should return null for non-existent ID', () => {
      const session = createValidSessionRecord({ id: 'existing-session' });
      service.saveSession(session);
      
      const result = service.getSession('non-existent');
      
      expect(result).toBeNull();
    });

    it('should return null when no sessions exist', () => {
      const result = service.getSession('any-id');
      expect(result).toBeNull();
    });

    it('should return the correct session among multiple', () => {
      const session1 = createValidSessionRecord({ id: 'session-1', problemTitle: 'Problem 1' });
      const session2 = createValidSessionRecord({ id: 'session-2', problemTitle: 'Problem 2' });
      const session3 = createValidSessionRecord({ id: 'session-3', problemTitle: 'Problem 3' });
      
      service.saveSession(session1);
      service.saveSession(session2);
      service.saveSession(session3);
      
      const result = service.getSession('session-2');
      
      expect(result?.problemTitle).toBe('Problem 2');
    });
  });

  describe('clearSessions', () => {
    it('should remove all sessions from localStorage', () => {
      const session1 = createValidSessionRecord({ id: 'session-1' });
      const session2 = createValidSessionRecord({ id: 'session-2' });
      
      service.saveSession(session1);
      service.saveSession(session2);
      
      expect(service.getSessions()).toHaveLength(2);
      
      service.clearSessions();
      
      expect(service.getSessions()).toHaveLength(0);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('should not throw when no sessions exist', () => {
      expect(() => service.clearSessions()).not.toThrow();
    });
  });

  describe('getStorageUsage', () => {
    it('should return usage information', () => {
      const usage = service.getStorageUsage();
      
      expect(usage).toHaveProperty('used');
      expect(usage).toHaveProperty('limit');
      expect(usage).toHaveProperty('percentage');
      expect(typeof usage.used).toBe('number');
      expect(typeof usage.limit).toBe('number');
      expect(typeof usage.percentage).toBe('number');
    });

    it('should return approximately 5MB limit', () => {
      const usage = service.getStorageUsage();
      
      // 5MB = 5 * 1024 * 1024 bytes
      expect(usage.limit).toBe(5 * 1024 * 1024);
    });

    it('should increase used space after saving sessions', () => {
      const usageBefore = service.getStorageUsage();
      
      const session = createValidSessionRecord({ id: 'test-session' });
      service.saveSession(session);
      
      const usageAfter = service.getStorageUsage();
      
      expect(usageAfter.used).toBeGreaterThan(usageBefore.used);
    });

    it('should calculate percentage correctly', () => {
      const session = createValidSessionRecord({ id: 'test-session' });
      service.saveSession(session);
      
      const usage = service.getStorageUsage();
      
      expect(usage.percentage).toBeCloseTo(usage.used / usage.limit, 10);
    });
  });

  describe('pruneOldSessions', () => {
    it('should keep only the specified number of most recent sessions', () => {
      // Create sessions with different timestamps
      for (let i = 0; i < 5; i++) {
        const session = createValidSessionRecord({ 
          id: `session-${i}`,
          timestamp: 1000 + i * 1000, // Increasing timestamps
        });
        service.saveSession(session);
      }
      
      expect(service.getSessions()).toHaveLength(5);
      
      service.pruneOldSessions(3);
      
      const remaining = service.getSessions();
      expect(remaining).toHaveLength(3);
      
      // Should keep the 3 most recent (highest timestamps)
      expect(remaining.map(s => s.id)).toEqual(['session-4', 'session-3', 'session-2']);
    });

    it('should not prune if session count is below keepCount', () => {
      const session1 = createValidSessionRecord({ id: 'session-1' });
      const session2 = createValidSessionRecord({ id: 'session-2' });
      
      service.saveSession(session1);
      service.saveSession(session2);
      
      service.pruneOldSessions(5);
      
      expect(service.getSessions()).toHaveLength(2);
    });

    it('should handle keepCount of 0', () => {
      const session = createValidSessionRecord({ id: 'session-1' });
      service.saveSession(session);
      
      service.pruneOldSessions(0);
      
      expect(service.getSessions()).toHaveLength(0);
    });

    it('should handle empty sessions list', () => {
      expect(() => service.pruneOldSessions(5)).not.toThrow();
      expect(service.getSessions()).toHaveLength(0);
    });

    it('should use LRU strategy (delete oldest first)', () => {
      // Create sessions: oldest to newest
      const timestamps = [1000, 2000, 3000, 4000, 5000];
      timestamps.forEach((ts, i) => {
        service.saveSession(createValidSessionRecord({ 
          id: `session-${i}`,
          timestamp: ts,
        }));
      });
      
      service.pruneOldSessions(2);
      
      const remaining = service.getSessions();
      // Should keep session-4 (ts=5000) and session-3 (ts=4000)
      expect(remaining.map(s => s.id)).toEqual(['session-4', 'session-3']);
    });
  });

  describe('warning callback', () => {
    it('should call warning callback when usage exceeds 80%', () => {
      const warningCallback = vi.fn();
      service.setWarningCallback(warningCallback);
      
      // Mock getStorageUsage to return high usage
      vi.spyOn(service, 'getStorageUsage').mockReturnValue({
        used: 4.5 * 1024 * 1024, // 4.5MB
        limit: 5 * 1024 * 1024,
        percentage: 0.9, // 90%
      });
      
      const session = createValidSessionRecord({ id: 'test' });
      service.saveSession(session);
      
      expect(warningCallback).toHaveBeenCalled();
      expect(warningCallback).toHaveBeenCalledWith(expect.objectContaining({
        percentage: 0.9,
      }));
    });

    it('should not call warning callback when usage is below 80%', () => {
      const warningCallback = vi.fn();
      service.setWarningCallback(warningCallback);
      
      // Mock getStorageUsage to return low usage
      vi.spyOn(service, 'getStorageUsage').mockReturnValue({
        used: 1 * 1024 * 1024, // 1MB
        limit: 5 * 1024 * 1024,
        percentage: 0.2, // 20%
      });
      
      const session = createValidSessionRecord({ id: 'test' });
      service.saveSession(session);
      
      expect(warningCallback).not.toHaveBeenCalled();
    });
  });

  describe('session record validation', () => {
    it('should accept valid session with all verdicts', () => {
      const verdicts: Array<'Pass' | 'Borderline' | 'No Pass'> = ['Pass', 'Borderline', 'No Pass'];
      
      verdicts.forEach((verdict) => {
        const session = createValidSessionRecord({ 
          id: `session-${verdict}`,
          evaluation: {
            ...createValidSessionRecord().evaluation,
            verdict,
          },
        });
        service.saveSession(session);
      });
      
      const sessions = service.getSessions();
      expect(sessions).toHaveLength(3);
    });

    it('should accept valid session with all valid miss tags', () => {
      const validTags: Array<'edge-cases' | 'complexity-analysis' | 'incorrect-approach'> = [
        'edge-cases',
        'complexity-analysis',
        'incorrect-approach',
      ];
      
      const session = createValidSessionRecord({
        id: 'test-tags',
        evaluation: {
          ...createValidSessionRecord().evaluation,
          missTags: validTags,
        },
      });
      
      service.saveSession(session);
      
      const retrieved = service.getSession('test-tags');
      expect(retrieved?.evaluation.missTags).toEqual(validTags);
    });

    it('should accept session with empty chat transcript', () => {
      const session = createValidSessionRecord({
        id: 'empty-chat',
        chatTranscript: [],
      });
      
      service.saveSession(session);
      
      const retrieved = service.getSession('empty-chat');
      expect(retrieved?.chatTranscript).toEqual([]);
    });

    it('should accept session with empty missTags', () => {
      const session = createValidSessionRecord({
        id: 'no-tags',
        evaluation: {
          ...createValidSessionRecord().evaluation,
          missTags: [],
        },
      });
      
      service.saveSession(session);
      
      const retrieved = service.getSession('no-tags');
      expect(retrieved?.evaluation.missTags).toEqual([]);
    });

    it('should accept session with score values at boundaries (0 and 4)', () => {
      const session = createValidSessionRecord({
        id: 'boundary-scores',
        evaluation: {
          ...createValidSessionRecord().evaluation,
          scores: {
            approach: 0,
            completeness: 4,
            complexity: 0,
            communication: 4,
          },
        },
      });
      
      service.saveSession(session);
      
      const retrieved = service.getSession('boundary-scores');
      expect(retrieved?.evaluation.scores).toEqual({
        approach: 0,
        completeness: 4,
        complexity: 0,
        communication: 4,
      });
    });
  });

  describe('round-trip persistence', () => {
    it('should preserve all session data through save and load', () => {
      const originalSession = createValidSessionRecord({
        id: 'round-trip-test',
        problemId: 'two-sum',
        problemTitle: 'Two Sum',
        timestamp: 1234567890,
        duration: 1800,
        finalCode: 'function twoSum(nums, target) { /* solution */ }',
        chatTranscript: [
          { id: 'msg-1', role: 'proctor', content: 'Welcome!', timestamp: 1000 },
          { id: 'msg-2', role: 'user', content: 'Hello!', timestamp: 2000 },
          { id: 'msg-3', role: 'proctor', content: 'Good luck!', timestamp: 3000 },
        ],
        evaluation: {
          verdict: 'Borderline',
          scores: {
            approach: 3,
            completeness: 2,
            complexity: 3,
            communication: 4,
          },
          feedback: {
            strengths: ['Good communication', 'Correct approach'],
            improvements: ['Handle edge cases', 'Optimize time complexity'],
          },
          idealSolution: 'function twoSum(nums, target) { /* ideal */ }',
          missTags: ['edge-cases', 'complexity-analysis'],
        },
      });
      
      service.saveSession(originalSession);
      
      // Create new service instance to ensure we're reading from storage
      const newService = new StorageService();
      const loadedSession = newService.getSession('round-trip-test');
      
      expect(loadedSession).not.toBeNull();
      expect(loadedSession).toEqual(originalSession);
    });
  });
});
