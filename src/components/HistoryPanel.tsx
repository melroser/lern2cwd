import React, { useMemo, useState } from 'react';
import type { HistoryPanelProps, SessionRecord, MissTag, Verdict } from '../types';

/**
 * HistoryPanel component - Displays past session results and identified patterns
 * 
 * Requirements:
 * - 9.3: WHEN the user clicks "Review", THE System SHALL display past session results and identified patterns
 * 
 * Features:
 * - List of past sessions with problem title, date, verdict, and scores
 * - Miss tags for each session
 * - Patterns in weaknesses (aggregate miss tags across sessions)
 * - Ability to select a session to view details
 * - Close button to return to home view
 */

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1e1e2e',
    color: '#cdd6f4',
    overflow: 'hidden',
  },
  header: {
    padding: '24px',
    borderBottom: '1px solid #45475a',
    backgroundColor: '#181825',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#89b4fa',
  },
  closeButton: {
    padding: '10px 20px',
    fontSize: '0.9rem',
    fontWeight: 500,
    color: '#cdd6f4',
    backgroundColor: '#313244',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  closeButtonHover: {
    backgroundColor: '#45475a',
  },
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  mainSection: {
    flex: 2,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRight: '1px solid #45475a',
  },
  sideSection: {
    flex: 1,
    minWidth: '280px',
    maxWidth: '350px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '20px',
  },
  sessionList: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sessionCard: {
    padding: '16px',
    backgroundColor: '#313244',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: '2px solid transparent',
  },
  sessionCardHover: {
    backgroundColor: '#45475a',
    borderColor: '#89b4fa',
  },
  sessionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  sessionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#cdd6f4',
    margin: 0,
  },
  verdictBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
  verdictPass: {
    backgroundColor: '#a6e3a1',
    color: '#1e1e2e',
  },
  verdictBorderline: {
    backgroundColor: '#f9e2af',
    color: '#1e1e2e',
  },
  verdictNoPass: {
    backgroundColor: '#f38ba8',
    color: '#1e1e2e',
  },
  sessionMeta: {
    display: 'flex',
    gap: '16px',
    fontSize: '0.8rem',
    color: '#a6adc8',
    marginBottom: '12px',
  },
  scoresRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  scoreChip: {
    padding: '4px 8px',
    backgroundColor: '#45475a',
    borderRadius: '4px',
    fontSize: '0.7rem',
    color: '#cdd6f4',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  missTagsRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
  },
  missTag: {
    padding: '4px 10px',
    backgroundColor: 'rgba(243, 139, 168, 0.15)',
    borderRadius: '12px',
    fontSize: '0.7rem',
    fontWeight: 500,
    color: '#f38ba8',
  },
  patternSection: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#89b4fa',
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  patternCard: {
    backgroundColor: '#313244',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
  },
  patternItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #45475a',
  },
  patternItemLast: {
    borderBottom: 'none',
  },
  patternName: {
    fontSize: '0.85rem',
    color: '#cdd6f4',
    textTransform: 'capitalize' as const,
  },
  patternCount: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  patternBar: {
    width: '60px',
    height: '6px',
    backgroundColor: '#45475a',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  patternBarFill: {
    height: '100%',
    backgroundColor: '#f38ba8',
    borderRadius: '3px',
  },
  patternNumber: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#f38ba8',
    minWidth: '24px',
    textAlign: 'right' as const,
  },
  statsCard: {
    backgroundColor: '#313244',
    borderRadius: '12px',
    padding: '16px',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #45475a',
  },
  statRowLast: {
    borderBottom: 'none',
  },
  statLabel: {
    fontSize: '0.85rem',
    color: '#a6adc8',
  },
  statValue: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#cdd6f4',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px',
    textAlign: 'center' as const,
  },
  emptyStateIcon: {
    fontSize: '3rem',
    marginBottom: '16px',
  },
  emptyStateText: {
    fontSize: '1.125rem',
    color: '#6c7086',
    marginBottom: '8px',
  },
  emptyStateSubtext: {
    fontSize: '0.9rem',
    color: '#585b70',
  },
  recommendationSection: {
    marginBottom: '24px',
  },
  recommendationCard: {
    backgroundColor: '#313244',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
  },
  recommendationItem: {
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '8px',
    backgroundColor: '#45475a',
  },
  recommendationItemLast: {
    marginBottom: 0,
  },
  recommendationPriorityHigh: {
    borderLeft: '3px solid #f38ba8',
  },
  recommendationPriorityMedium: {
    borderLeft: '3px solid #f9e2af',
  },
  recommendationPriorityLow: {
    borderLeft: '3px solid #a6e3a1',
  },
  recommendationTitle: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#cdd6f4',
    marginBottom: '6px',
  },
  recommendationDescription: {
    fontSize: '0.8rem',
    color: '#a6adc8',
    lineHeight: 1.4,
  },
  trendIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '0.7rem',
    fontWeight: 500,
    padding: '2px 6px',
    borderRadius: '4px',
    marginLeft: '8px',
  },
  trendImproving: {
    backgroundColor: 'rgba(166, 227, 161, 0.2)',
    color: '#a6e3a1',
  },
  trendWorsening: {
    backgroundColor: 'rgba(243, 139, 168, 0.2)',
    color: '#f38ba8',
  },
  trendNew: {
    backgroundColor: 'rgba(249, 226, 175, 0.2)',
    color: '#f9e2af',
  },
  trendStable: {
    backgroundColor: 'rgba(166, 173, 200, 0.2)',
    color: '#a6adc8',
  },
  sideSectionScrollable: {
    flex: 1,
    overflowY: 'auto',
  },
};

/**
 * Format a timestamp to a readable date string
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a timestamp to a readable time string
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format duration in seconds to a readable string
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

/**
 * Get the verdict badge style based on verdict type
 */
function getVerdictStyle(verdict: Verdict): React.CSSProperties {
  switch (verdict) {
    case 'Pass':
      return styles.verdictPass;
    case 'Borderline':
      return styles.verdictBorderline;
    case 'No Pass':
      return styles.verdictNoPass;
    default:
      return styles.verdictBorderline;
  }
}

/**
 * Get a human-readable label for a miss tag
 */
function getMissTagLabel(tag: MissTag): string {
  const labels: Record<MissTag, string> = {
    'edge-cases': 'Edge Cases',
    'complexity-analysis': 'Complexity Analysis',
    'incorrect-approach': 'Incorrect Approach',
    'incomplete-solution': 'Incomplete Solution',
    'unclear-communication': 'Unclear Communication',
    'wrong-data-structure': 'Wrong Data Structure',
    'off-by-one': 'Off-by-One Errors',
    'constraints-missed': 'Constraints Missed',
    'testing-mentality': 'Testing Mentality',
  };
  return labels[tag] || tag;
}

/**
 * Aggregate miss tags across all sessions and count occurrences
 */
function aggregateMissTags(sessions: SessionRecord[]): Map<MissTag, number> {
  const tagCounts = new Map<MissTag, number>();
  
  for (const session of sessions) {
    for (const tag of session.evaluation.missTags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  
  return tagCounts;
}

/**
 * Trend direction for miss tag analysis
 */
type TrendDirection = 'improving' | 'worsening' | 'stable' | 'new';

/**
 * Miss tag trend information
 */
interface MissTagTrend {
  tag: MissTag;
  totalCount: number;
  recentCount: number; // Count in recent sessions (last 3)
  olderCount: number;  // Count in older sessions
  trend: TrendDirection;
}

/**
 * Analyze miss tag trends by comparing recent sessions to older sessions
 * Requirements: 9.3 - Identify recurring patterns
 */
function analyzeMissTagTrends(sessions: SessionRecord[]): MissTagTrend[] {
  if (sessions.length === 0) return [];
  
  // Sort sessions by timestamp (newest first)
  const sortedSessions = [...sessions].sort((a, b) => b.timestamp - a.timestamp);
  
  // Split into recent (last 3) and older sessions
  const recentCount = Math.min(3, sortedSessions.length);
  const recentSessions = sortedSessions.slice(0, recentCount);
  const olderSessions = sortedSessions.slice(recentCount);
  
  // Count tags in each group
  const recentTags = new Map<MissTag, number>();
  const olderTags = new Map<MissTag, number>();
  
  for (const session of recentSessions) {
    for (const tag of session.evaluation.missTags) {
      recentTags.set(tag, (recentTags.get(tag) || 0) + 1);
    }
  }
  
  for (const session of olderSessions) {
    for (const tag of session.evaluation.missTags) {
      olderTags.set(tag, (olderTags.get(tag) || 0) + 1);
    }
  }
  
  // Combine all tags
  const allTags = new Set<MissTag>([...recentTags.keys(), ...olderTags.keys()]);
  
  // Calculate trends
  const trends: MissTagTrend[] = [];
  
  for (const tag of allTags) {
    const recent = recentTags.get(tag) || 0;
    const older = olderTags.get(tag) || 0;
    const total = recent + older;
    
    let trend: TrendDirection;
    
    if (olderSessions.length === 0) {
      // Not enough history to determine trend
      trend = 'stable';
    } else if (older === 0 && recent > 0) {
      // New issue appearing in recent sessions
      trend = 'new';
    } else {
      // Calculate rate per session for comparison
      const recentRate = recent / recentCount;
      const olderRate = older / olderSessions.length;
      
      if (recentRate < olderRate * 0.5) {
        trend = 'improving';
      } else if (recentRate > olderRate * 1.5) {
        trend = 'worsening';
      } else {
        trend = 'stable';
      }
    }
    
    trends.push({
      tag,
      totalCount: total,
      recentCount: recent,
      olderCount: older,
      trend,
    });
  }
  
  // Sort by total count descending
  return trends.sort((a, b) => b.totalCount - a.totalCount);
}

/**
 * Recommendation based on miss tag patterns
 */
interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  relatedTags: MissTag[];
}

/**
 * Generate recommendations based on recurring miss tag patterns
 * Requirements: 9.2, 9.3 - Identify specific weaknesses and patterns
 */
function generateRecommendations(
  trends: MissTagTrend[],
  sessions: SessionRecord[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  
  if (sessions.length === 0 || trends.length === 0) {
    return recommendations;
  }
  
  // Find high-frequency issues (appearing in >50% of sessions)
  const sessionCount = sessions.length;
  const highFrequencyTags = trends.filter(t => t.totalCount / sessionCount > 0.5);
  
  // Find worsening issues
  const worseningTags = trends.filter(t => t.trend === 'worsening');
  
  // Find new issues
  const newTags = trends.filter(t => t.trend === 'new');
  
  // Generate recommendations based on patterns
  
  // High priority: Worsening issues
  if (worseningTags.length > 0) {
    const tagNames = worseningTags.map(t => getMissTagLabel(t.tag)).join(', ');
    recommendations.push({
      priority: 'high',
      title: 'Focus Area: Worsening Patterns',
      description: `Your recent sessions show increased issues with: ${tagNames}. Consider reviewing these concepts before your next practice.`,
      relatedTags: worseningTags.map(t => t.tag),
    });
  }
  
  // High priority: Recurring high-frequency issues
  if (highFrequencyTags.length > 0) {
    const topTag = highFrequencyTags[0];
    const tagLabel = getMissTagLabel(topTag.tag);
    
    // Specific recommendations based on tag type
    const specificAdvice = getSpecificAdvice(topTag.tag);
    
    recommendations.push({
      priority: 'high',
      title: `Recurring Issue: ${tagLabel}`,
      description: specificAdvice,
      relatedTags: [topTag.tag],
    });
  }
  
  // Medium priority: New issues appearing
  if (newTags.length > 0) {
    const tagNames = newTags.map(t => getMissTagLabel(t.tag)).join(', ');
    recommendations.push({
      priority: 'medium',
      title: 'New Areas to Watch',
      description: `Recent sessions introduced new issues: ${tagNames}. Pay attention to these in upcoming practice.`,
      relatedTags: newTags.map(t => t.tag),
    });
  }
  
  // Low priority: Improving areas (positive reinforcement)
  const improvingTags = trends.filter(t => t.trend === 'improving');
  if (improvingTags.length > 0) {
    const tagNames = improvingTags.map(t => getMissTagLabel(t.tag)).join(', ');
    recommendations.push({
      priority: 'low',
      title: '✓ Improving Areas',
      description: `Great progress on: ${tagNames}. Keep up the good work!`,
      relatedTags: improvingTags.map(t => t.tag),
    });
  }
  
  return recommendations;
}

/**
 * Get specific advice for a miss tag
 */
function getSpecificAdvice(tag: MissTag): string {
  const advice: Record<MissTag, string> = {
    'edge-cases': 'Practice identifying edge cases before coding. Ask yourself: What happens with empty input? Maximum values? Negative numbers?',
    'complexity-analysis': 'Review Big-O notation. Practice analyzing time and space complexity for common algorithms and data structures.',
    'incorrect-approach': 'Before coding, spend more time understanding the problem. Consider multiple approaches and their trade-offs.',
    'incomplete-solution': 'Focus on completing your solution before optimizing. Ensure all requirements are addressed.',
    'unclear-communication': 'Practice explaining your thought process out loud. Structure your explanations: problem understanding → approach → implementation.',
    'wrong-data-structure': 'Review when to use arrays, hash maps, trees, and graphs. Match data structures to problem requirements.',
    'off-by-one': 'Pay extra attention to loop boundaries and array indices. Test with small examples to verify correctness.',
    'constraints-missed': 'Always read problem constraints carefully. They often hint at the expected time complexity.',
    'testing-mentality': 'Before submitting, trace through your code with test cases. Include edge cases in your mental testing.',
  };
  
  return advice[tag] || 'Review this area and practice related problems.';
}

/**
 * Calculate overall statistics from sessions
 */
function calculateStats(sessions: SessionRecord[]): {
  totalSessions: number;
  passRate: number;
  avgScore: number;
  avgDuration: number;
} {
  if (sessions.length === 0) {
    return { totalSessions: 0, passRate: 0, avgScore: 0, avgDuration: 0 };
  }
  
  const passCount = sessions.filter(s => s.evaluation.verdict === 'Pass').length;
  const passRate = (passCount / sessions.length) * 100;
  
  const totalScore = sessions.reduce((sum, s) => {
    const { approach, completeness, complexity, communication } = s.evaluation.scores;
    return sum + approach + completeness + complexity + communication;
  }, 0);
  const avgScore = totalScore / sessions.length;
  
  const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
  const avgDuration = totalDuration / sessions.length;
  
  return { totalSessions: sessions.length, passRate, avgScore, avgDuration };
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  sessions,
  onSelectSession,
  onClose,
}) => {
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);

  // Calculate aggregated miss tags (patterns in weaknesses)
  const missTagPatterns = useMemo(() => {
    const tagCounts = aggregateMissTags(sessions);
    // Sort by count descending
    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  // Analyze miss tag trends (comparing recent vs older sessions)
  const missTagTrends = useMemo(() => analyzeMissTagTrends(sessions), [sessions]);

  // Generate recommendations based on patterns
  const recommendations = useMemo(
    () => generateRecommendations(missTagTrends, sessions),
    [missTagTrends, sessions]
  );

  // Calculate overall statistics
  const stats = useMemo(() => calculateStats(sessions), [sessions]);

  // Get max count for pattern bar scaling
  const maxTagCount = useMemo(() => {
    if (missTagPatterns.length === 0) return 1;
    return missTagPatterns[0][1];
  }, [missTagPatterns]);

  // Handle empty state
  if (sessions.length === 0) {
    return (
      <div style={styles.container} data-testid="history-panel">
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>Session History</h2>
          <button
            onClick={onClose}
            onMouseEnter={() => setIsCloseHovered(true)}
            onMouseLeave={() => setIsCloseHovered(false)}
            style={{
              ...styles.closeButton,
              ...(isCloseHovered ? styles.closeButtonHover : {}),
            }}
            data-testid="close-button"
          >
            ← Back
          </button>
        </div>
        <div style={styles.emptyState} data-testid="empty-state">
          <div style={styles.emptyStateIcon}>📋</div>
          <p style={styles.emptyStateText}>No sessions yet</p>
          <p style={styles.emptyStateSubtext}>
            Complete a coding session to see your history and progress here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container} data-testid="history-panel">
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.headerTitle}>Session History</h2>
        <button
          onClick={onClose}
          onMouseEnter={() => setIsCloseHovered(true)}
          onMouseLeave={() => setIsCloseHovered(false)}
          style={{
            ...styles.closeButton,
            ...(isCloseHovered ? styles.closeButtonHover : {}),
          }}
          data-testid="close-button"
        >
          ← Back
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* Main Section - Session List */}
        <div style={styles.mainSection}>
          <div style={styles.sessionList} data-testid="session-list">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                onMouseEnter={() => setHoveredSessionId(session.id)}
                onMouseLeave={() => setHoveredSessionId(null)}
                style={{
                  ...styles.sessionCard,
                  ...(hoveredSessionId === session.id ? styles.sessionCardHover : {}),
                }}
                data-testid={`session-card-${session.id}`}
              >
                {/* Session Header */}
                <div style={styles.sessionHeader}>
                  <h3 style={styles.sessionTitle}>{session.problemTitle}</h3>
                  <span
                    style={{
                      ...styles.verdictBadge,
                      ...getVerdictStyle(session.evaluation.verdict),
                    }}
                    data-testid={`verdict-${session.id}`}
                  >
                    {session.evaluation.verdict}
                  </span>
                </div>

                {/* Session Meta */}
                <div style={styles.sessionMeta}>
                  <span data-testid={`date-${session.id}`}>
                    📅 {formatDate(session.timestamp)} at {formatTime(session.timestamp)}
                  </span>
                  <span data-testid={`duration-${session.id}`}>
                    ⏱️ {formatDuration(session.duration)}
                  </span>
                </div>

                {/* Scores Row */}
                <div style={styles.scoresRow} data-testid={`scores-${session.id}`}>
                  <span style={styles.scoreChip}>
                    Approach: {session.evaluation.scores.approach}/4
                  </span>
                  <span style={styles.scoreChip}>
                    Completeness: {session.evaluation.scores.completeness}/4
                  </span>
                  <span style={styles.scoreChip}>
                    Complexity: {session.evaluation.scores.complexity}/4
                  </span>
                  <span style={styles.scoreChip}>
                    Communication: {session.evaluation.scores.communication}/4
                  </span>
                </div>

                {/* Miss Tags */}
                {session.evaluation.missTags.length > 0 && (
                  <div style={styles.missTagsRow} data-testid={`miss-tags-${session.id}`}>
                    {session.evaluation.missTags.map((tag, index) => (
                      <span
                        key={index}
                        style={styles.missTag}
                        data-testid={`miss-tag-${session.id}-${index}`}
                      >
                        {getMissTagLabel(tag)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Side Section - Patterns, Recommendations & Stats */}
        <div style={styles.sideSection}>
          <div style={styles.sideSectionScrollable}>
            {/* Recommendations Section */}
            {recommendations.length > 0 && (
              <div style={styles.recommendationSection} data-testid="recommendations-section">
                <h3 style={styles.sectionTitle}>Recommendations</h3>
                <div style={styles.recommendationCard}>
                  {recommendations.map((rec, index) => (
                    <div
                      key={index}
                      style={{
                        ...styles.recommendationItem,
                        ...(index === recommendations.length - 1 ? styles.recommendationItemLast : {}),
                        ...(rec.priority === 'high' ? styles.recommendationPriorityHigh : {}),
                        ...(rec.priority === 'medium' ? styles.recommendationPriorityMedium : {}),
                        ...(rec.priority === 'low' ? styles.recommendationPriorityLow : {}),
                      }}
                      data-testid={`recommendation-${index}`}
                    >
                      <div style={styles.recommendationTitle}>{rec.title}</div>
                      <div style={styles.recommendationDescription}>{rec.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weakness Patterns with Trends */}
            {missTagTrends.length > 0 && (
              <div style={styles.patternSection} data-testid="patterns-section">
                <h3 style={styles.sectionTitle}>Weakness Patterns</h3>
                <div style={styles.patternCard}>
                  {missTagTrends.map((trend, index) => (
                    <div
                      key={trend.tag}
                      style={{
                        ...styles.patternItem,
                        ...(index === missTagTrends.length - 1 ? styles.patternItemLast : {}),
                      }}
                      data-testid={`pattern-${trend.tag}`}
                    >
                      <span style={styles.patternName}>
                        {getMissTagLabel(trend.tag)}
                        {trend.trend !== 'stable' && (
                          <span
                            style={{
                              ...styles.trendIndicator,
                              ...(trend.trend === 'improving' ? styles.trendImproving : {}),
                              ...(trend.trend === 'worsening' ? styles.trendWorsening : {}),
                              ...(trend.trend === 'new' ? styles.trendNew : {}),
                            }}
                            data-testid={`trend-${trend.tag}`}
                          >
                            {trend.trend === 'improving' && '↓'}
                            {trend.trend === 'worsening' && '↑'}
                            {trend.trend === 'new' && 'NEW'}
                          </span>
                        )}
                      </span>
                      <div style={styles.patternCount}>
                        <div style={styles.patternBar}>
                          <div
                            style={{
                              ...styles.patternBarFill,
                              width: `${(trend.totalCount / maxTagCount) * 100}%`,
                            }}
                          />
                        </div>
                        <span style={styles.patternNumber}>{trend.totalCount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overall Statistics */}
            <div style={styles.patternSection} data-testid="stats-section">
              <h3 style={styles.sectionTitle}>Overall Statistics</h3>
              <div style={styles.statsCard}>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Total Sessions</span>
                  <span style={styles.statValue} data-testid="stat-total-sessions">
                    {stats.totalSessions}
                  </span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Pass Rate</span>
                  <span
                    style={{
                      ...styles.statValue,
                      color: stats.passRate >= 70 ? '#a6e3a1' : stats.passRate >= 40 ? '#f9e2af' : '#f38ba8',
                    }}
                    data-testid="stat-pass-rate"
                  >
                    {stats.passRate.toFixed(0)}%
                  </span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Avg. Score</span>
                  <span style={styles.statValue} data-testid="stat-avg-score">
                    {stats.avgScore.toFixed(1)}/16
                  </span>
                </div>
                <div style={{ ...styles.statRow, ...styles.statRowLast }}>
                  <span style={styles.statLabel}>Avg. Duration</span>
                  <span style={styles.statValue} data-testid="stat-avg-duration">
                    {formatDuration(Math.round(stats.avgDuration))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoryPanel;

// Export utility functions for testing
export { 
  formatDate, 
  formatTime, 
  formatDuration, 
  getVerdictStyle, 
  getMissTagLabel, 
  aggregateMissTags, 
  calculateStats,
  analyzeMissTagTrends,
  generateRecommendations,
  getSpecificAdvice,
};

// Export types for testing
export type { MissTagTrend, Recommendation, TrendDirection };
