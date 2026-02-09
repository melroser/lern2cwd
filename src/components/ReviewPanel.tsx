import React from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-typescript';
import type { ReviewPanelProps, Verdict } from '../types';

/**
 * ReviewPanel component - Displays evaluation results after session completion
 * 
 * Requirements:
 * - 4.3: THE Proctor SHALL provide a Verdict of "Pass", "Borderline", or "No Pass" based on the scores
 * - 4.6: THE Proctor SHALL provide 2-3 targeted improvements, not exhaustive nitpicks
 * - 4.7: WHEN feedback is complete, THE Proctor SHALL provide one ideal answer showing the improved solution
 */

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1e1e2e',
    color: '#cdd6f4',
    overflowY: 'auto',
  },
  header: {
    padding: '24px',
    borderBottom: '1px solid #45475a',
    backgroundColor: '#181825',
    textAlign: 'center' as const,
  },
  headerTitle: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#89b4fa',
    marginBottom: '16px',
  },
  verdictContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
  },
  verdictBadge: {
    padding: '12px 32px',
    borderRadius: '8px',
    fontSize: '1.25rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
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
  content: {
    flex: 1,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  section: {
    backgroundColor: '#313244',
    borderRadius: '12px',
    padding: '20px',
  },
  sectionTitle: {
    margin: '0 0 16px 0',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#89b4fa',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  scoresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
  },
  scoreItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  scoreLabel: {
    fontSize: '0.875rem',
    color: '#a6adc8',
    textTransform: 'capitalize' as const,
  },
  scoreBarContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  scoreBar: {
    flex: 1,
    height: '8px',
    backgroundColor: '#45475a',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  scoreValue: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#cdd6f4',
    minWidth: '32px',
    textAlign: 'right' as const,
  },
  feedbackList: {
    margin: 0,
    padding: '0 0 0 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  feedbackItem: {
    fontSize: '0.9rem',
    lineHeight: 1.6,
    color: '#cdd6f4',
  },
  strengthItem: {
    color: '#a6e3a1',
  },
  improvementItem: {
    color: '#f9e2af',
  },
  codeBlock: {
    backgroundColor: '#1e1e2e',
    borderRadius: '8px',
    padding: '16px',
    overflow: 'auto',
    fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
    fontSize: '0.875rem',
    lineHeight: 1.6,
    maxHeight: '400px',
  },
  missTagsContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  missTag: {
    padding: '6px 12px',
    backgroundColor: '#45475a',
    borderRadius: '16px',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: '#f38ba8',
    textTransform: 'lowercase' as const,
  },
  footer: {
    padding: '24px',
    borderTop: '1px solid #45475a',
    backgroundColor: '#181825',
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
  },
  button: {
    padding: '14px 28px',
    fontSize: '1rem',
    fontWeight: 600,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  nextButton: {
    backgroundColor: '#89b4fa',
    color: '#1e1e2e',
  },
  nextButtonHover: {
    backgroundColor: '#b4befe',
    transform: 'translateY(-1px)',
  },
  historyButton: {
    backgroundColor: '#45475a',
    color: '#cdd6f4',
  },
  historyButtonHover: {
    backgroundColor: '#585b70',
    transform: 'translateY(-1px)',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '48px',
    textAlign: 'center' as const,
  },
  emptyStateText: {
    fontSize: '1.125rem',
    color: '#6c7086',
    marginBottom: '24px',
  },
};

/**
 * Get the color for a score bar based on the score value (0-4)
 */
function getScoreColor(score: number): string {
  if (score >= 4) return '#a6e3a1'; // Green - excellent
  if (score >= 3) return '#94e2d5'; // Teal - good
  if (score >= 2) return '#f9e2af'; // Yellow - borderline
  return '#f38ba8'; // Red - needs improvement
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
 * Syntax highlighting function using Prism.js
 */
function highlightCode(code: string): string {
  // Try to detect language from common patterns
  let grammar = Prism.languages.javascript;
  let language = 'javascript';

  // Check for Python-specific patterns
  if (code.includes('def ') || code.includes('print(') || code.includes('elif ') || code.includes('self.')) {
    grammar = Prism.languages.python;
    language = 'python';
  }
  // Check for TypeScript-specific patterns
  else if (code.includes(': string') || code.includes(': number') || code.includes('interface ') || code.includes('<T>')) {
    grammar = Prism.languages.typescript;
    language = 'typescript';
  }

  return Prism.highlight(code, grammar, language);
}

/**
 * Score display component
 */
interface ScoreItemProps {
  label: string;
  score: number;
  maxScore?: number;
}

const ScoreItem: React.FC<ScoreItemProps> = ({ label, score, maxScore = 4 }) => {
  const percentage = (score / maxScore) * 100;
  const color = getScoreColor(score);

  return (
    <div style={styles.scoreItem} data-testid={`score-${label.toLowerCase()}`}>
      <span style={styles.scoreLabel}>{label}</span>
      <div style={styles.scoreBarContainer}>
        <div style={styles.scoreBar}>
          <div
            style={{
              ...styles.scoreBarFill,
              width: `${percentage}%`,
              backgroundColor: color,
            }}
            data-testid={`score-bar-${label.toLowerCase()}`}
          />
        </div>
        <span style={styles.scoreValue}>{score}/{maxScore}</span>
      </div>
    </div>
  );
};

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  evaluation,
  onNextProblem,
  onViewHistory,
}) => {
  const [isNextHovered, setIsNextHovered] = React.useState(false);
  const [isHistoryHovered, setIsHistoryHovered] = React.useState(false);

  // Handle empty evaluation state
  if (!evaluation) {
    return (
      <div style={styles.container} data-testid="review-panel">
        <div style={styles.emptyState} data-testid="empty-state">
          <p style={styles.emptyStateText}>
            No evaluation results available. Complete a session to see your results.
          </p>
          <button
            onClick={onNextProblem}
            style={{
              ...styles.button,
              ...styles.nextButton,
            }}
            data-testid="start-session-button"
          >
            Start New Session
          </button>
        </div>
      </div>
    );
  }

  const { verdict, scores, feedback, idealSolution, missTags } = evaluation;

  return (
    <div style={styles.container} data-testid="review-panel">
      {/* Header with Verdict */}
      <div style={styles.header}>
        <h2 style={styles.headerTitle}>Evaluation Results</h2>
        <div style={styles.verdictContainer}>
          <span
            style={{
              ...styles.verdictBadge,
              ...getVerdictStyle(verdict),
            }}
            data-testid="verdict-badge"
          >
            {verdict}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* Rubric Scores Section */}
        <div style={styles.section} data-testid="scores-section">
          <h3 style={styles.sectionTitle}>Rubric Scores</h3>
          <div style={styles.scoresGrid}>
            <ScoreItem label="Approach" score={scores.approach} />
            <ScoreItem label="Completeness" score={scores.completeness} />
            <ScoreItem label="Complexity" score={scores.complexity} />
            <ScoreItem label="Communication" score={scores.communication} />
          </div>
        </div>

        {/* Feedback Section */}
        <div style={styles.section} data-testid="feedback-section">
          <h3 style={styles.sectionTitle}>Feedback</h3>
          
          {/* Strengths */}
          {feedback.strengths.length > 0 && (
            <div data-testid="strengths-section">
              <h4 style={{ ...styles.scoreLabel, marginBottom: '8px', color: '#a6e3a1' }}>
                Strengths
              </h4>
              <ul style={styles.feedbackList}>
                {feedback.strengths.map((strength, index) => (
                  <li
                    key={index}
                    style={{ ...styles.feedbackItem, ...styles.strengthItem }}
                    data-testid={`strength-${index}`}
                  >
                    {strength}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {feedback.improvements.length > 0 && (
            <div data-testid="improvements-section" style={{ marginTop: feedback.strengths.length > 0 ? '16px' : 0 }}>
              <h4 style={{ ...styles.scoreLabel, marginBottom: '8px', color: '#f9e2af' }}>
                Areas for Improvement
              </h4>
              <ul style={styles.feedbackList}>
                {feedback.improvements.map((improvement, index) => (
                  <li
                    key={index}
                    style={{ ...styles.feedbackItem, ...styles.improvementItem }}
                    data-testid={`improvement-${index}`}
                  >
                    {improvement}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Miss Tags Section */}
        {missTags.length > 0 && (
          <div style={styles.section} data-testid="miss-tags-section">
            <h3 style={styles.sectionTitle}>Areas to Focus On</h3>
            <div style={styles.missTagsContainer}>
              {missTags.map((tag, index) => (
                <span
                  key={index}
                  style={styles.missTag}
                  data-testid={`miss-tag-${index}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Ideal Solution Section */}
        {idealSolution && (
          <div style={styles.section} data-testid="ideal-solution-section">
            <h3 style={styles.sectionTitle}>Ideal Solution</h3>
            <pre
              style={styles.codeBlock}
              data-testid="ideal-solution-code"
              dangerouslySetInnerHTML={{ __html: highlightCode(idealSolution) }}
            />
          </div>
        )}
      </div>

      {/* Footer with Action Buttons */}
      <div style={styles.footer}>
        <button
          onClick={onNextProblem}
          onMouseEnter={() => setIsNextHovered(true)}
          onMouseLeave={() => setIsNextHovered(false)}
          style={{
            ...styles.button,
            ...styles.nextButton,
            ...(isNextHovered ? styles.nextButtonHover : {}),
          }}
          data-testid="next-problem-button"
          aria-label="Next problem"
        >
          Next Problem
        </button>
        <button
          onClick={onViewHistory}
          onMouseEnter={() => setIsHistoryHovered(true)}
          onMouseLeave={() => setIsHistoryHovered(false)}
          style={{
            ...styles.button,
            ...styles.historyButton,
            ...(isHistoryHovered ? styles.historyButtonHover : {}),
          }}
          data-testid="view-history-button"
          aria-label="View history"
        >
          View History
        </button>
      </div>
    </div>
  );
};

export default ReviewPanel;

// Export utility functions for testing
export { getScoreColor, getVerdictStyle, highlightCode };
