import React from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-docker';
import 'prismjs/themes/prism-tomorrow.css';
import type {
  EvaluationAnnotation,
  EvaluationAnnotationSeverity,
  ProgrammingLanguage,
  ReviewPanelProps,
  SessionProblemSnapshot,
  Verdict,
} from '../types';

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#0d1119',
    color: '#d6e2ff',
    overflowY: 'auto',
  },
  header: {
    padding: '24px',
    borderBottom: '1px solid rgba(137, 180, 250, 0.2)',
    backgroundColor: 'rgba(8, 12, 20, 0.96)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap',
  },
  headerTitle: {
    margin: 0,
    fontSize: '1.55rem',
    fontWeight: 700,
    color: '#9cc4ff',
  },
  headerMeta: {
    marginTop: '8px',
    fontSize: '0.95rem',
    color: 'rgba(214, 226, 255, 0.78)',
    maxWidth: '780px',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  verdictContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
  },
  verdictBadge: {
    padding: '12px 24px',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  verdictPass: {
    backgroundColor: '#a6e3a1',
    color: '#0d1119',
  },
  verdictBorderline: {
    backgroundColor: '#f9e2af',
    color: '#0d1119',
  },
  verdictNoPass: {
    backgroundColor: '#f38ba8',
    color: '#0d1119',
  },
  copyButton: {
    padding: '12px 18px',
    borderRadius: '8px',
    border: '1px solid rgba(137, 180, 250, 0.35)',
    backgroundColor: 'rgba(24, 32, 48, 0.96)',
    color: '#d6e2ff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  copyStatus: {
    fontSize: '0.85rem',
    color: '#94e2d5',
  },
  copyStatusError: {
    color: '#f38ba8',
  },
  content: {
    flex: 1,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  section: {
    backgroundColor: 'rgba(21, 28, 41, 0.94)',
    borderRadius: '14px',
    padding: '20px',
    border: '1px solid rgba(137, 180, 250, 0.14)',
  },
  sectionTitle: {
    margin: '0 0 16px 0',
    fontSize: '0.98rem',
    fontWeight: 700,
    color: '#9cc4ff',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.7px',
  },
  recapMeta: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap' as const,
    marginBottom: '12px',
  },
  recapPill: {
    padding: '6px 10px',
    borderRadius: '999px',
    backgroundColor: 'rgba(34, 45, 68, 0.92)',
    color: '#d6e2ff',
    fontSize: '0.78rem',
  },
  recapText: {
    fontSize: '0.98rem',
    lineHeight: 1.7,
    color: 'rgba(214, 226, 255, 0.9)',
    whiteSpace: 'pre-wrap' as const,
    margin: 0,
  },
  scoresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
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
    backgroundColor: '#1f2a3a',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: '4px',
  },
  scoreValue: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#d6e2ff',
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
    fontSize: '0.95rem',
    lineHeight: 1.6,
  },
  strengthItem: {
    color: '#a6e3a1',
  },
  improvementItem: {
    color: '#f9e2af',
  },
  missTagsContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  missTag: {
    padding: '6px 12px',
    backgroundColor: '#1f2a3a',
    borderRadius: '16px',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#f38ba8',
    textTransform: 'lowercase' as const,
  },
  codeBlock: {
    backgroundColor: '#0a0f18',
    borderRadius: '10px',
    border: '1px solid rgba(137, 180, 250, 0.14)',
    overflow: 'auto',
    maxHeight: '420px',
  },
  emptyCodeState: {
    padding: '18px 16px',
    color: 'rgba(214, 226, 255, 0.72)',
    fontSize: '0.95rem',
    lineHeight: 1.6,
  },
  codeRow: {
    display: 'grid',
    gridTemplateColumns: '56px 1fr',
    alignItems: 'stretch',
  },
  lineNumber: {
    padding: '0 12px',
    textAlign: 'right' as const,
    color: 'rgba(214, 226, 255, 0.4)',
    userSelect: 'none' as const,
    borderRight: '1px solid rgba(137, 180, 250, 0.1)',
    backgroundColor: 'rgba(14, 20, 31, 0.96)',
    fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
    fontSize: '0.84rem',
    lineHeight: 1.8,
    paddingTop: '2px',
    paddingBottom: '2px',
  },
  codeCell: {
    margin: 0,
    padding: '2px 16px',
    fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
    fontSize: '0.94rem',
    lineHeight: 1.8,
    whiteSpace: 'pre',
  },
  narrativeCodeCell: {
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  annotationRow: {
    display: 'grid',
    gridTemplateColumns: '56px 1fr',
  },
  annotationCell: {
    margin: 0,
    padding: '2px 16px',
    fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
    fontSize: '0.84rem',
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap' as const,
  },
  annotationInfo: {
    backgroundColor: 'rgba(148, 226, 213, 0.08)',
    color: '#94e2d5',
  },
  annotationWarning: {
    backgroundColor: 'rgba(249, 226, 175, 0.1)',
    color: '#f9e2af',
  },
  annotationError: {
    backgroundColor: 'rgba(243, 139, 168, 0.12)',
    color: '#f38ba8',
  },
  footer: {
    padding: '24px',
    borderTop: '1px solid rgba(137, 180, 250, 0.14)',
    backgroundColor: 'rgba(8, 12, 20, 0.96)',
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  button: {
    padding: '14px 28px',
    fontSize: '1rem',
    fontWeight: 700,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  nextButton: {
    backgroundColor: '#89b4fa',
    color: '#0d1119',
  },
  nextButtonHover: {
    backgroundColor: '#b4befe',
    transform: 'translateY(-1px)',
  },
  historyButton: {
    backgroundColor: '#2a3446',
    color: '#d6e2ff',
  },
  historyButtonHover: {
    backgroundColor: '#36445c',
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
    color: '#7e8aa3',
    marginBottom: '24px',
  },
};

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function getPrismLanguage(
  language?: ProgrammingLanguage,
  code: string = ''
): 'javascript' | 'python' | 'typescript' | 'sql' | 'yaml' | 'docker' {
  if (language === 'python') return 'python';
  if (language === 'typescript') return 'typescript';
  if (language === 'javascript') return 'javascript';
  if (language === 'sql') return 'sql';
  if (language === 'yaml') return 'yaml';
  if (language === 'dockerfile') return 'docker';

  if (code.includes('def ') || code.includes('elif ') || code.includes('self.')) {
    return 'python';
  }
  if (code.includes(': string') || code.includes(': number') || code.includes('interface ')) {
    return 'typescript';
  }
  return 'javascript';
}

function isNarrativeSnapshot(problemSnapshot?: SessionProblemSnapshot | null): boolean {
  if (!problemSnapshot) return false;
  if (problemSnapshot.contract?.responseMode === 'narrative') return true;
  return problemSnapshot.assessmentType === 'behavioral' || problemSnapshot.assessmentType === 'system-design' || problemSnapshot.assessmentType === 'math';
}

function getCommentPrefix(problemSnapshot?: SessionProblemSnapshot | null): string {
  if (isNarrativeSnapshot(problemSnapshot)) {
    return 'Note:';
  }
  if (problemSnapshot?.language === 'javascript' || problemSnapshot?.language === 'typescript') {
    return '// Review:';
  }
  if (problemSnapshot?.language === 'sql') {
    return '-- Review:';
  }
  return '# Review:';
}

/**
 * Get the color for a score bar based on the score value (0-4)
 */
function getScoreColor(score: number): string {
  if (score >= 4) return '#a6e3a1';
  if (score >= 3) return '#94e2d5';
  if (score >= 2) return '#f9e2af';
  return '#f38ba8';
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
function highlightCode(code: string, language?: ProgrammingLanguage): string {
  if (!code) return '';

  const prismLanguage = getPrismLanguage(language, code);
  const grammar = Prism.languages[prismLanguage] ?? Prism.languages.javascript;
  return Prism.highlight(code, grammar, prismLanguage);
}

interface RenderedRow {
  kind: 'code' | 'annotation';
  lineNumber: number;
  html: string;
  severity?: EvaluationAnnotationSeverity;
}

function buildRenderedRows(
  code: string,
  annotations: EvaluationAnnotation[],
  target: 'candidate' | 'ideal',
  problemSnapshot?: SessionProblemSnapshot | null
): RenderedRow[] {
  const lines = code.length > 0 ? code.split('\n') : [''];
  const grouped = new Map<number, EvaluationAnnotation[]>();

  for (const annotation of annotations.filter((entry) => entry.target === target)) {
    const line = Math.max(1, Math.min(lines.length, annotation.line));
    const current = grouped.get(line) ?? [];
    current.push(annotation);
    grouped.set(line, current);
  }

  const rows: RenderedRow[] = [];
  const prefix = getCommentPrefix(problemSnapshot);
  const narrative = isNarrativeSnapshot(problemSnapshot);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const lineAnnotations = grouped.get(lineNumber) ?? [];

    for (const annotation of lineAnnotations) {
      rows.push({
        kind: 'annotation',
        lineNumber,
        html: escapeHtml(`${prefix} ${annotation.message}`),
        severity: annotation.severity,
      });
    }

    rows.push({
      kind: 'code',
      lineNumber,
      html: narrative ? escapeHtml(line || ' ') : (line.length > 0 ? highlightCode(line, problemSnapshot?.language) : '&nbsp;'),
    });
  });

  return rows;
}

function getAnnotationStyle(severity: EvaluationAnnotationSeverity = 'info'): React.CSSProperties {
  if (severity === 'error') return styles.annotationError;
  if (severity === 'warning') return styles.annotationWarning;
  return styles.annotationInfo;
}

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

interface AnnotatedCodeBlockProps {
  title: string;
  code: string;
  annotations: EvaluationAnnotation[];
  target: 'candidate' | 'ideal';
  problemSnapshot?: SessionProblemSnapshot | null;
  testId: string;
}

const AnnotatedCodeBlock: React.FC<AnnotatedCodeBlockProps> = ({
  title,
  code,
  annotations,
  target,
  problemSnapshot,
  testId,
}) => {
  const narrative = isNarrativeSnapshot(problemSnapshot);
  if (!code) {
    return (
      <div style={styles.section} data-testid={`${testId}-section`}>
        <h3 style={styles.sectionTitle}>{title}</h3>
        <div style={styles.codeBlock} data-testid={`${testId}-code`}>
          <div style={styles.emptyCodeState}>No captured answer/code is available for this session.</div>
        </div>
      </div>
    );
  }

  const rows = buildRenderedRows(code, annotations, target, problemSnapshot);

  return (
    <div style={styles.section} data-testid={`${testId}-section`}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      <div style={styles.codeBlock} data-testid={`${testId}-code`}>
        {rows.map((row, index) => (
          row.kind === 'annotation' ? (
            <div key={`${target}-annotation-${index}`} style={styles.annotationRow}>
              <div style={styles.lineNumber}>{row.lineNumber}</div>
              <pre
                style={{
                  ...styles.annotationCell,
                  ...getAnnotationStyle(row.severity),
                }}
                dangerouslySetInnerHTML={{ __html: row.html }}
              />
            </div>
          ) : (
            <div key={`${target}-code-${index}`} style={styles.codeRow}>
              <div style={styles.lineNumber}>{row.lineNumber}</div>
              <pre
                style={{
                  ...styles.codeCell,
                  ...(narrative ? styles.narrativeCodeCell : {}),
                }}
                dangerouslySetInnerHTML={{ __html: row.html }}
              />
            </div>
          )
        ))}
      </div>
    </div>
  );
};

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  evaluation,
  candidateCode = '',
  problemSnapshot = null,
  onCopyContext,
  copyStatus = 'idle',
  onNextProblem,
  onViewHistory,
  nextActionLabel = 'Next Problem',
}) => {
  const [isNextHovered, setIsNextHovered] = React.useState(false);
  const [isHistoryHovered, setIsHistoryHovered] = React.useState(false);

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

  const { verdict, scores, feedback, idealSolution, missTags, annotations = [] } = evaluation;
  const description = problemSnapshot?.content?.description ?? problemSnapshot?.prompt ?? '';
  const narrative = isNarrativeSnapshot(problemSnapshot);

  return (
    <div style={styles.container} data-testid="review-panel">
      <div style={styles.header}>
        <div>
          <h2 style={styles.headerTitle}>Evaluation Results</h2>
          {problemSnapshot && (
            <div style={styles.headerMeta}>
              <strong>{problemSnapshot.title}</strong>
              {description ? `\n${description}` : ''}
            </div>
          )}
        </div>

        <div style={styles.headerActions}>
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
          {onCopyContext && (
            <button
              type="button"
              style={styles.copyButton}
              onClick={onCopyContext}
              data-testid="copy-review-context-button"
            >
              Copy Session Context
            </button>
          )}
          {copyStatus !== 'idle' && (
            <span
              style={{
                ...styles.copyStatus,
                ...(copyStatus === 'error' ? styles.copyStatusError : {}),
              }}
              data-testid="copy-context-status"
            >
              {copyStatus === 'copied' ? 'Copied' : 'Copy failed'}
            </span>
          )}
        </div>
      </div>

      <div style={styles.content}>
        {problemSnapshot && (
          <div style={styles.section} data-testid="problem-recap-section">
            <h3 style={styles.sectionTitle}>Problem Recap</h3>
            <div style={styles.recapMeta}>
              <span style={styles.recapPill}>{problemSnapshot.language}</span>
              <span style={styles.recapPill}>{problemSnapshot.difficulty}</span>
              <span style={styles.recapPill}>{problemSnapshot.assessmentType ?? 'coding'}</span>
            </div>
            <p style={styles.recapText}>{description || 'No description available.'}</p>
          </div>
        )}

        <div style={styles.section} data-testid="scores-section">
          <h3 style={styles.sectionTitle}>Rubric Scores</h3>
          <div style={styles.scoresGrid}>
            <ScoreItem label="Approach" score={scores.approach} />
            <ScoreItem label="Completeness" score={scores.completeness} />
            <ScoreItem label="Complexity" score={scores.complexity} />
            <ScoreItem label="Communication" score={scores.communication} />
          </div>
        </div>

        <div style={styles.section} data-testid="feedback-section">
          <h3 style={styles.sectionTitle}>Feedback</h3>

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

        <AnnotatedCodeBlock
          title={narrative ? 'Your Answer' : 'Your Solution'}
          code={candidateCode}
          annotations={annotations}
          target="candidate"
          problemSnapshot={problemSnapshot}
          testId="candidate-solution"
        />

        {idealSolution && (
          <AnnotatedCodeBlock
            title={narrative ? 'Ideal Answer' : 'Ideal Solution'}
            code={idealSolution}
            annotations={annotations}
            target="ideal"
            problemSnapshot={problemSnapshot}
            testId="ideal-solution"
          />
        )}
      </div>

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
          {nextActionLabel}
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

export { getScoreColor, getVerdictStyle, highlightCode };
