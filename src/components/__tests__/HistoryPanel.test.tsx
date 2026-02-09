import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { 
  HistoryPanel, 
  formatDate, 
  formatTime, 
  formatDuration, 
  getMissTagLabel, 
  aggregateMissTags, 
  calculateStats,
  analyzeMissTagTrends,
  generateRecommendations,
  getSpecificAdvice,
} from '../HistoryPanel';
import type { SessionRecord } from '../../types';

/**
 * Test suite for HistoryPanel component
 * 
 * Requirements:
 * - 9.3: WHEN the user clicks "Review", THE System SHALL display past session results and identified patterns
 */

// Helper function to create a mock session record
function createMockSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    problemId: 'fizzbuzz',
    problemTitle: 'FizzBuzz',
    timestamp: Date.now(),
    duration: 600, // 10 minutes
    finalCode: 'function fizzBuzz(n) { /* solution */ }',
    chatTranscript: [],
    evaluation: {
      verdict: 'Pass',
      scores: {
        approach: 4,
        completeness: 3,
        complexity: 3,
        communication: 4,
      },
      feedback: {
        strengths: ['Good approach'],
        improvements: ['Consider edge cases'],
      },
      idealSolution: 'function fizzBuzz(n) { /* ideal */ }',
      missTags: [],
    },
    ...overrides,
  };
}

describe('HistoryPanel', () => {
  describe('Empty State', () => {
    it('should render empty state when no sessions provided', () => {
      const onSelectSession = vi.fn();
      const onClose = vi.fn();

      render(
        <HistoryPanel
          sessions={[]}
          onSelectSession={onSelectSession}
          onClose={onClose}
        />
      );

      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No sessions yet')).toBeInTheDocument();
    });

    it('should still show close button in empty state', () => {
      const onSelectSession = vi.fn();
      const onClose = vi.fn();

      render(
        <HistoryPanel
          sessions={[]}
          onSelectSession={onSelectSession}
          onClose={onClose}
        />
      );

      const closeButton = screen.getByTestId('close-button');
      expect(closeButton).toBeInTheDocument();
      
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Session List', () => {
    it('should render session cards for each session', () => {
      const sessions = [
        createMockSession({ id: 'session-1', problemTitle: 'FizzBuzz' }),
        createMockSession({ id: 'session-2', problemTitle: 'Two Sum' }),
      ];
      const onSelectSession = vi.fn();
      const onClose = vi.fn();

      render(
        <HistoryPanel
          sessions={sessions}
          onSelectSession={onSelectSession}
          onClose={onClose}
        />
      );

      expect(screen.getByTestId('session-card-session-1')).toBeInTheDocument();
      expect(screen.getByTestId('session-card-session-2')).toBeInTheDocument();
      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.getByText('Two Sum')).toBeInTheDocument();
    });

    it('should display verdict badge for each session', () => {
      const sessions = [
        createMockSession({ 
          id: 'session-1', 
          evaluation: { 
            ...createMockSession().evaluation, 
            verdict: 'Pass' 
          } 
        }),
        createMockSession({ 
          id: 'session-2', 
          evaluation: { 
            ...createMockSession().evaluation, 
            verdict: 'Borderline' 
          } 
        }),
        createMockSession({ 
          id: 'session-3', 
          evaluation: { 
            ...createMockSession().evaluation, 
            verdict: 'No Pass' 
          } 
        }),
      ];
      const onSelectSession = vi.fn();
      const onClose = vi.fn();

      render(
        <HistoryPanel
          sessions={sessions}
          onSelectSession={onSelectSession}
          onClose={onClose}
        />
      );

      expect(screen.getByTestId('verdict-session-1')).toHaveTextContent('Pass');
      expect(screen.getByTestId('verdict-session-2')).toHaveTextContent('Borderline');
      expect(screen.getByTestId('verdict-session-3')).toHaveTextContent('No Pass');
    });

    it('should display scores for each session', () => {
      const session = createMockSession({
        id: 'session-1',
        evaluation: {
          ...createMockSession().evaluation,
          scores: {
            approach: 4,
            completeness: 3,
            complexity: 2,
            communication: 4,
          },
        },
      });
      const onSelectSession = vi.fn();
      const onClose = vi.fn();

      render(
        <HistoryPanel
          sessions={[session]}
          onSelectSession={onSelectSession}
          onClose={onClose}
        />
      );

      const scoresElement = screen.getByTestId('scores-session-1');
      expect(scoresElement).toHaveTextContent('Approach: 4/4');
      expect(scoresElement).toHaveTextContent('Completeness: 3/4');
      expect(scoresElement).toHaveTextContent('Complexity: 2/4');
      expect(scoresElement).toHaveTextContent('Communication: 4/4');
    });

    it('should display miss tags for sessions that have them', () => {
      const session = createMockSession({
        id: 'session-1',
        evaluation: {
          ...createMockSession().evaluation,
          missTags: ['edge-cases', 'complexity-analysis'],
        },
      });
      const onSelectSession = vi.fn();
      const onClose = vi.fn();

      render(
        <HistoryPanel
          sessions={[session]}
          onSelectSession={onSelectSession}
          onClose={onClose}
        />
      );

      const missTagsElement = screen.getByTestId('miss-tags-session-1');
      expect(missTagsElement).toBeInTheDocument();
      // Use specific test IDs to avoid matching patterns section
      expect(screen.getByTestId('miss-tag-session-1-0')).toHaveTextContent('Edge Cases');
      expect(screen.getByTestId('miss-tag-session-1-1')).toHaveTextContent('Complexity Analysis');
    });

    it('should call onSelectSession when a session card is clicked', () => {
      const session = createMockSession({ id: 'session-1' });
      const onSelectSession = vi.fn();
      const onClose = vi.fn();

      render(
        <HistoryPanel
          sessions={[session]}
          onSelectSession={onSelectSession}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByTestId('session-card-session-1'));
      expect(onSelectSession).toHaveBeenCalledWith('session-1');
    });
  });

  describe('Weakness Patterns', () => {
    it('should display aggregated miss tag patterns', () => {
      const sessions = [
        createMockSession({
          id: 'session-1',
          evaluation: {
            ...createMockSession().evaluation,
            missTags: ['edge-cases', 'complexity-analysis'],
          },
        }),
        createMockSession({
          id: 'session-2',
          evaluation: {
            ...createMockSession().evaluation,
            missTags: ['edge-cases', 'incorrect-approach'],
          },
        }),
        createMockSession({
          id: 'session-3',
          evaluation: {
            ...createMockSession().evaluation,
            missTags: ['edge-cases'],
          },
        }),
      ];
      const onSelectSession = vi.fn();
      const onClose = vi.fn();

      render(
        <HistoryPanel
          sessions={sessions}
          onSelectSession={onSelectSession}
          onClose={onClose}
        />
      );

      const patternsSection = screen.getByTestId('patterns-section');
      expect(patternsSection).toBeInTheDocument();
      
      // edge-cases appears 3 times
      const edgeCasesPattern = screen.getByTestId('pattern-edge-cases');
      expect(edgeCasesPattern).toBeInTheDocument();
      expect(edgeCasesPattern).toHaveTextContent('3');
    });

    it('should not display patterns section when no miss tags exist', () => {
      const sessions = [
        createMockSession({
          id: 'session-1',
          evaluation: {
            ...createMockSession().evaluation,
            missTags: [],
          },
        }),
      ];
      const onSelectSession = vi.fn();
      const onClose = vi.fn();

      render(
        <HistoryPanel
          sessions={sessions}
          onSelectSession={onSelectSession}
          onClose={onClose}
        />
      );

      expect(screen.queryByTestId('patterns-section')).not.toBeInTheDocument();
    });
  });

  describe('Statistics', () => {
    it('should display overall statistics', () => {
      const sessions = [
        createMockSession({
          id: 'session-1',
          duration: 600,
          evaluation: {
            ...createMockSession().evaluation,
            verdict: 'Pass',
            scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
          },
        }),
        createMockSession({
          id: 'session-2',
          duration: 900,
          evaluation: {
            ...createMockSession().evaluation,
            verdict: 'No Pass',
            scores: { approach: 2, completeness: 2, complexity: 2, communication: 2 },
          },
        }),
      ];
      const onSelectSession = vi.fn();
      const onClose = vi.fn();

      render(
        <HistoryPanel
          sessions={sessions}
          onSelectSession={onSelectSession}
          onClose={onClose}
        />
      );

      expect(screen.getByTestId('stats-section')).toBeInTheDocument();
      expect(screen.getByTestId('stat-total-sessions')).toHaveTextContent('2');
      expect(screen.getByTestId('stat-pass-rate')).toHaveTextContent('50%');
    });
  });

  describe('Close Button', () => {
    it('should call onClose when close button is clicked', () => {
      const session = createMockSession({ id: 'session-1' });
      const onSelectSession = vi.fn();
      const onClose = vi.fn();

      render(
        <HistoryPanel
          sessions={[session]}
          onSelectSession={onSelectSession}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByTestId('close-button'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Utility Functions', () => {
  describe('formatDate', () => {
    it('should format timestamp to readable date', () => {
      // Use a fixed timestamp for consistent testing
      const timestamp = new Date('2024-01-15T10:30:00').getTime();
      const result = formatDate(timestamp);
      expect(result).toContain('Jan');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });
  });

  describe('formatTime', () => {
    it('should format timestamp to readable time', () => {
      const timestamp = new Date('2024-01-15T10:30:00').getTime();
      const result = formatTime(timestamp);
      expect(result).toMatch(/10:30/);
    });
  });

  describe('formatDuration', () => {
    it('should format seconds to minutes and seconds', () => {
      expect(formatDuration(600)).toBe('10m 0s');
      expect(formatDuration(125)).toBe('2m 5s');
      expect(formatDuration(45)).toBe('45s');
    });
  });

  describe('getMissTagLabel', () => {
    it('should return human-readable labels for miss tags', () => {
      expect(getMissTagLabel('edge-cases')).toBe('Edge Cases');
      expect(getMissTagLabel('complexity-analysis')).toBe('Complexity Analysis');
      expect(getMissTagLabel('incorrect-approach')).toBe('Incorrect Approach');
      expect(getMissTagLabel('incomplete-solution')).toBe('Incomplete Solution');
      expect(getMissTagLabel('unclear-communication')).toBe('Unclear Communication');
      expect(getMissTagLabel('wrong-data-structure')).toBe('Wrong Data Structure');
      expect(getMissTagLabel('off-by-one')).toBe('Off-by-One Errors');
      expect(getMissTagLabel('constraints-missed')).toBe('Constraints Missed');
      expect(getMissTagLabel('testing-mentality')).toBe('Testing Mentality');
    });
  });

  describe('aggregateMissTags', () => {
    it('should count occurrences of each miss tag across sessions', () => {
      const sessions: SessionRecord[] = [
        createMockSession({
          evaluation: {
            ...createMockSession().evaluation,
            missTags: ['edge-cases', 'complexity-analysis'],
          },
        }),
        createMockSession({
          evaluation: {
            ...createMockSession().evaluation,
            missTags: ['edge-cases', 'incorrect-approach'],
          },
        }),
      ];

      const result = aggregateMissTags(sessions);
      
      expect(result.get('edge-cases')).toBe(2);
      expect(result.get('complexity-analysis')).toBe(1);
      expect(result.get('incorrect-approach')).toBe(1);
    });

    it('should return empty map for sessions with no miss tags', () => {
      const sessions: SessionRecord[] = [
        createMockSession({
          evaluation: {
            ...createMockSession().evaluation,
            missTags: [],
          },
        }),
      ];

      const result = aggregateMissTags(sessions);
      expect(result.size).toBe(0);
    });
  });

  describe('calculateStats', () => {
    it('should calculate correct statistics', () => {
      const sessions: SessionRecord[] = [
        createMockSession({
          duration: 600,
          evaluation: {
            ...createMockSession().evaluation,
            verdict: 'Pass',
            scores: { approach: 4, completeness: 4, complexity: 4, communication: 4 },
          },
        }),
        createMockSession({
          duration: 900,
          evaluation: {
            ...createMockSession().evaluation,
            verdict: 'No Pass',
            scores: { approach: 2, completeness: 2, complexity: 2, communication: 2 },
          },
        }),
      ];

      const stats = calculateStats(sessions);
      
      expect(stats.totalSessions).toBe(2);
      expect(stats.passRate).toBe(50);
      expect(stats.avgScore).toBe(12); // (16 + 8) / 2
      expect(stats.avgDuration).toBe(750); // (600 + 900) / 2
    });

    it('should return zeros for empty sessions array', () => {
      const stats = calculateStats([]);
      
      expect(stats.totalSessions).toBe(0);
      expect(stats.passRate).toBe(0);
      expect(stats.avgScore).toBe(0);
      expect(stats.avgDuration).toBe(0);
    });
  });
});


describe('Miss Tag Analysis Functions', () => {
  describe('analyzeMissTagTrends', () => {
    it('should return empty array for empty sessions', () => {
      const result = analyzeMissTagTrends([]);
      expect(result).toEqual([]);
    });

    it('should identify stable trends when not enough history', () => {
      // Only 2 sessions - not enough to determine trend
      const sessions: SessionRecord[] = [
        createMockSession({
          id: 'session-1',
          timestamp: Date.now(),
          evaluation: {
            ...createMockSession().evaluation,
            missTags: ['edge-cases'],
          },
        }),
        createMockSession({
          id: 'session-2',
          timestamp: Date.now() - 1000,
          evaluation: {
            ...createMockSession().evaluation,
            missTags: ['edge-cases'],
          },
        }),
      ];

      const result = analyzeMissTagTrends(sessions);
      
      expect(result.length).toBe(1);
      expect(result[0].tag).toBe('edge-cases');
      expect(result[0].totalCount).toBe(2);
      expect(result[0].trend).toBe('stable');
    });

    it('should identify improving trends', () => {
      // Older sessions have more issues than recent ones
      const now = Date.now();
      const sessions: SessionRecord[] = [
        // Recent sessions (last 3) - no edge-cases
        createMockSession({
          id: 'session-1',
          timestamp: now,
          evaluation: { ...createMockSession().evaluation, missTags: [] },
        }),
        createMockSession({
          id: 'session-2',
          timestamp: now - 1000,
          evaluation: { ...createMockSession().evaluation, missTags: [] },
        }),
        createMockSession({
          id: 'session-3',
          timestamp: now - 2000,
          evaluation: { ...createMockSession().evaluation, missTags: [] },
        }),
        // Older sessions - have edge-cases
        createMockSession({
          id: 'session-4',
          timestamp: now - 10000,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
        createMockSession({
          id: 'session-5',
          timestamp: now - 20000,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
      ];

      const result = analyzeMissTagTrends(sessions);
      
      const edgeCasesTrend = result.find(t => t.tag === 'edge-cases');
      expect(edgeCasesTrend).toBeDefined();
      expect(edgeCasesTrend?.trend).toBe('improving');
      expect(edgeCasesTrend?.recentCount).toBe(0);
      expect(edgeCasesTrend?.olderCount).toBe(2);
    });

    it('should identify worsening trends', () => {
      // Recent sessions have more issues than older ones
      const now = Date.now();
      const sessions: SessionRecord[] = [
        // Recent sessions (last 3) - have edge-cases
        createMockSession({
          id: 'session-1',
          timestamp: now,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
        createMockSession({
          id: 'session-2',
          timestamp: now - 1000,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
        createMockSession({
          id: 'session-3',
          timestamp: now - 2000,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
        // Older sessions - no edge-cases
        createMockSession({
          id: 'session-4',
          timestamp: now - 10000,
          evaluation: { ...createMockSession().evaluation, missTags: [] },
        }),
        createMockSession({
          id: 'session-5',
          timestamp: now - 20000,
          evaluation: { ...createMockSession().evaluation, missTags: [] },
        }),
      ];

      const result = analyzeMissTagTrends(sessions);
      
      const edgeCasesTrend = result.find(t => t.tag === 'edge-cases');
      expect(edgeCasesTrend).toBeDefined();
      expect(edgeCasesTrend?.trend).toBe('new'); // New because older count is 0
    });

    it('should identify new issues', () => {
      const now = Date.now();
      const sessions: SessionRecord[] = [
        // Recent sessions - have new issue
        createMockSession({
          id: 'session-1',
          timestamp: now,
          evaluation: { ...createMockSession().evaluation, missTags: ['complexity-analysis'] },
        }),
        createMockSession({
          id: 'session-2',
          timestamp: now - 1000,
          evaluation: { ...createMockSession().evaluation, missTags: [] },
        }),
        createMockSession({
          id: 'session-3',
          timestamp: now - 2000,
          evaluation: { ...createMockSession().evaluation, missTags: [] },
        }),
        // Older sessions - different issue
        createMockSession({
          id: 'session-4',
          timestamp: now - 10000,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
      ];

      const result = analyzeMissTagTrends(sessions);
      
      const complexityTrend = result.find(t => t.tag === 'complexity-analysis');
      expect(complexityTrend).toBeDefined();
      expect(complexityTrend?.trend).toBe('new');
    });

    it('should sort trends by total count descending', () => {
      const now = Date.now();
      const sessions: SessionRecord[] = [
        createMockSession({
          id: 'session-1',
          timestamp: now,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases', 'complexity-analysis'] },
        }),
        createMockSession({
          id: 'session-2',
          timestamp: now - 1000,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
      ];

      const result = analyzeMissTagTrends(sessions);
      
      expect(result[0].tag).toBe('edge-cases');
      expect(result[0].totalCount).toBe(2);
      expect(result[1].tag).toBe('complexity-analysis');
      expect(result[1].totalCount).toBe(1);
    });
  });

  describe('generateRecommendations', () => {
    it('should return empty array for empty sessions', () => {
      const result = generateRecommendations([], []);
      expect(result).toEqual([]);
    });

    it('should generate high priority recommendation for worsening trends', () => {
      const now = Date.now();
      const sessions: SessionRecord[] = [
        createMockSession({
          id: 'session-1',
          timestamp: now,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
        createMockSession({
          id: 'session-2',
          timestamp: now - 1000,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
        createMockSession({
          id: 'session-3',
          timestamp: now - 2000,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
        createMockSession({
          id: 'session-4',
          timestamp: now - 10000,
          evaluation: { ...createMockSession().evaluation, missTags: [] },
        }),
      ];

      const trends = analyzeMissTagTrends(sessions);
      const recommendations = generateRecommendations(trends, sessions);
      
      // Should have recommendation for new issue (edge-cases appeared in recent but not older)
      const newIssueRec = recommendations.find(r => r.title.includes('New Areas'));
      expect(newIssueRec).toBeDefined();
      expect(newIssueRec?.priority).toBe('medium');
    });

    it('should generate recommendation for high-frequency issues', () => {
      const now = Date.now();
      // All sessions have edge-cases (100% frequency)
      const sessions: SessionRecord[] = [
        createMockSession({
          id: 'session-1',
          timestamp: now,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
        createMockSession({
          id: 'session-2',
          timestamp: now - 1000,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
      ];

      const trends = analyzeMissTagTrends(sessions);
      const recommendations = generateRecommendations(trends, sessions);
      
      const recurringRec = recommendations.find(r => r.title.includes('Recurring Issue'));
      expect(recurringRec).toBeDefined();
      expect(recurringRec?.priority).toBe('high');
      expect(recurringRec?.relatedTags).toContain('edge-cases');
    });

    it('should generate low priority recommendation for improving areas', () => {
      const now = Date.now();
      const sessions: SessionRecord[] = [
        // Recent sessions - no issues
        createMockSession({
          id: 'session-1',
          timestamp: now,
          evaluation: { ...createMockSession().evaluation, missTags: [] },
        }),
        createMockSession({
          id: 'session-2',
          timestamp: now - 1000,
          evaluation: { ...createMockSession().evaluation, missTags: [] },
        }),
        createMockSession({
          id: 'session-3',
          timestamp: now - 2000,
          evaluation: { ...createMockSession().evaluation, missTags: [] },
        }),
        // Older sessions - had issues
        createMockSession({
          id: 'session-4',
          timestamp: now - 10000,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
        createMockSession({
          id: 'session-5',
          timestamp: now - 20000,
          evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
        }),
      ];

      const trends = analyzeMissTagTrends(sessions);
      const recommendations = generateRecommendations(trends, sessions);
      
      const improvingRec = recommendations.find(r => r.title.includes('Improving'));
      expect(improvingRec).toBeDefined();
      expect(improvingRec?.priority).toBe('low');
    });
  });

  describe('getSpecificAdvice', () => {
    it('should return specific advice for each miss tag', () => {
      expect(getSpecificAdvice('edge-cases')).toContain('edge cases');
      expect(getSpecificAdvice('complexity-analysis')).toContain('Big-O');
      expect(getSpecificAdvice('incorrect-approach')).toContain('understanding the problem');
      expect(getSpecificAdvice('incomplete-solution')).toContain('completing');
      expect(getSpecificAdvice('unclear-communication')).toContain('explaining');
      expect(getSpecificAdvice('wrong-data-structure')).toContain('data structures');
      expect(getSpecificAdvice('off-by-one')).toContain('loop boundaries');
      expect(getSpecificAdvice('constraints-missed')).toContain('constraints');
      expect(getSpecificAdvice('testing-mentality')).toContain('test cases');
    });
  });
});

describe('HistoryPanel Recommendations UI', () => {
  it('should display recommendations section when recommendations exist', () => {
    const now = Date.now();
    // Create sessions that will generate recommendations
    const sessions: SessionRecord[] = [
      createMockSession({
        id: 'session-1',
        timestamp: now,
        evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
      }),
      createMockSession({
        id: 'session-2',
        timestamp: now - 1000,
        evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
      }),
    ];

    render(
      <HistoryPanel
        sessions={sessions}
        onSelectSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('recommendations-section')).toBeInTheDocument();
  });

  it('should display trend indicators for non-stable trends', () => {
    const now = Date.now();
    const sessions: SessionRecord[] = [
      // Recent sessions with new issue
      createMockSession({
        id: 'session-1',
        timestamp: now,
        evaluation: { ...createMockSession().evaluation, missTags: ['complexity-analysis'] },
      }),
      createMockSession({
        id: 'session-2',
        timestamp: now - 1000,
        evaluation: { ...createMockSession().evaluation, missTags: [] },
      }),
      createMockSession({
        id: 'session-3',
        timestamp: now - 2000,
        evaluation: { ...createMockSession().evaluation, missTags: [] },
      }),
      // Older session with different issue
      createMockSession({
        id: 'session-4',
        timestamp: now - 10000,
        evaluation: { ...createMockSession().evaluation, missTags: ['edge-cases'] },
      }),
    ];

    render(
      <HistoryPanel
        sessions={sessions}
        onSelectSession={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Should show NEW indicator for complexity-analysis
    expect(screen.getByTestId('trend-complexity-analysis')).toHaveTextContent('NEW');
  });
});
