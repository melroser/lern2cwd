import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewPanel, getScoreColor, getVerdictStyle, highlightCode } from '../ReviewPanel';
import type { EvaluationResult } from '../../types';

/**
 * Unit tests for ReviewPanel component
 * 
 * Requirements:
 * - 4.3: THE Proctor SHALL provide a Verdict of "Pass", "Borderline", or "No Pass" based on the scores
 * - 4.6: THE Proctor SHALL provide 2-3 targeted improvements, not exhaustive nitpicks
 * - 4.7: WHEN feedback is complete, THE Proctor SHALL provide one ideal answer showing the improved solution
 */

// Helper to create test evaluation results
const createEvaluation = (overrides: Partial<EvaluationResult> = {}): EvaluationResult => ({
  verdict: 'Pass',
  scores: {
    approach: 4,
    completeness: 3,
    complexity: 3,
    communication: 4,
  },
  feedback: {
    strengths: ['Good understanding of the problem', 'Clean code structure'],
    improvements: ['Consider edge cases', 'Add complexity analysis'],
  },
  idealSolution: 'function solution() {\n  return "ideal";\n}',
  missTags: ['edge-cases', 'complexity-analysis'],
  ...overrides,
});

describe('ReviewPanel Component', () => {
  const defaultProps = {
    evaluation: createEvaluation(),
    onNextProblem: vi.fn(),
    onViewHistory: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the review panel container', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('review-panel')).toBeInTheDocument();
    });

    it('renders the header with title', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByText('Evaluation Results')).toBeInTheDocument();
    });

    it('renders the verdict badge', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('verdict-badge')).toBeInTheDocument();
    });

    it('renders the scores section', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('scores-section')).toBeInTheDocument();
    });

    it('renders the feedback section', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('feedback-section')).toBeInTheDocument();
    });

    it('renders the ideal solution section', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('ideal-solution-section')).toBeInTheDocument();
    });

    it('renders action buttons', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('next-problem-button')).toBeInTheDocument();
      expect(screen.getByTestId('view-history-button')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('displays empty state when evaluation is null', () => {
      render(<ReviewPanel {...defaultProps} evaluation={null} />);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('shows start session button in empty state', () => {
      render(<ReviewPanel {...defaultProps} evaluation={null} />);
      expect(screen.getByTestId('start-session-button')).toBeInTheDocument();
    });

    it('calls onNextProblem when start session button is clicked', () => {
      const onNextProblem = vi.fn();
      render(<ReviewPanel {...defaultProps} evaluation={null} onNextProblem={onNextProblem} />);
      
      fireEvent.click(screen.getByTestId('start-session-button'));
      expect(onNextProblem).toHaveBeenCalledTimes(1);
    });

    it('displays appropriate empty state message', () => {
      render(<ReviewPanel {...defaultProps} evaluation={null} />);
      expect(screen.getByText(/No evaluation results available/)).toBeInTheDocument();
    });
  });

  describe('verdict display (Requirement 4.3)', () => {
    it('displays Pass verdict correctly', () => {
      const evaluation = createEvaluation({ verdict: 'Pass' });
      render(<ReviewPanel {...defaultProps} evaluation={evaluation} />);
      
      expect(screen.getByTestId('verdict-badge')).toHaveTextContent('Pass');
    });

    it('displays Borderline verdict correctly', () => {
      const evaluation = createEvaluation({ verdict: 'Borderline' });
      render(<ReviewPanel {...defaultProps} evaluation={evaluation} />);
      
      expect(screen.getByTestId('verdict-badge')).toHaveTextContent('Borderline');
    });

    it('displays No Pass verdict correctly', () => {
      const evaluation = createEvaluation({ verdict: 'No Pass' });
      render(<ReviewPanel {...defaultProps} evaluation={evaluation} />);
      
      expect(screen.getByTestId('verdict-badge')).toHaveTextContent('No Pass');
    });
  });

  describe('rubric scores display', () => {
    it('displays all four rubric categories', () => {
      render(<ReviewPanel {...defaultProps} />);
      
      expect(screen.getByTestId('score-approach')).toBeInTheDocument();
      expect(screen.getByTestId('score-completeness')).toBeInTheDocument();
      expect(screen.getByTestId('score-complexity')).toBeInTheDocument();
      expect(screen.getByTestId('score-communication')).toBeInTheDocument();
    });

    it('displays correct score values', () => {
      const evaluation = createEvaluation({
        scores: { approach: 4, completeness: 3, complexity: 2, communication: 1 },
      });
      render(<ReviewPanel {...defaultProps} evaluation={evaluation} />);
      
      expect(screen.getByTestId('score-approach')).toHaveTextContent('4/4');
      expect(screen.getByTestId('score-completeness')).toHaveTextContent('3/4');
      expect(screen.getByTestId('score-complexity')).toHaveTextContent('2/4');
      expect(screen.getByTestId('score-communication')).toHaveTextContent('1/4');
    });

    it('renders score bars for each category', () => {
      render(<ReviewPanel {...defaultProps} />);
      
      expect(screen.getByTestId('score-bar-approach')).toBeInTheDocument();
      expect(screen.getByTestId('score-bar-completeness')).toBeInTheDocument();
      expect(screen.getByTestId('score-bar-complexity')).toBeInTheDocument();
      expect(screen.getByTestId('score-bar-communication')).toBeInTheDocument();
    });
  });

  describe('feedback display (Requirement 4.6)', () => {
    it('displays strengths section when strengths exist', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('strengths-section')).toBeInTheDocument();
    });

    it('displays all strength items', () => {
      const evaluation = createEvaluation({
        feedback: {
          strengths: ['Strength 1', 'Strength 2', 'Strength 3'],
          improvements: [],
        },
      });
      render(<ReviewPanel {...defaultProps} evaluation={evaluation} />);
      
      expect(screen.getByTestId('strength-0')).toHaveTextContent('Strength 1');
      expect(screen.getByTestId('strength-1')).toHaveTextContent('Strength 2');
      expect(screen.getByTestId('strength-2')).toHaveTextContent('Strength 3');
    });

    it('displays improvements section when improvements exist', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('improvements-section')).toBeInTheDocument();
    });

    it('displays all improvement items', () => {
      const evaluation = createEvaluation({
        feedback: {
          strengths: [],
          improvements: ['Improvement 1', 'Improvement 2'],
        },
      });
      render(<ReviewPanel {...defaultProps} evaluation={evaluation} />);
      
      expect(screen.getByTestId('improvement-0')).toHaveTextContent('Improvement 1');
      expect(screen.getByTestId('improvement-1')).toHaveTextContent('Improvement 2');
    });

    it('hides strengths section when no strengths', () => {
      const evaluation = createEvaluation({
        feedback: { strengths: [], improvements: ['Improvement'] },
      });
      render(<ReviewPanel {...defaultProps} evaluation={evaluation} />);
      
      expect(screen.queryByTestId('strengths-section')).not.toBeInTheDocument();
    });

    it('hides improvements section when no improvements', () => {
      const evaluation = createEvaluation({
        feedback: { strengths: ['Strength'], improvements: [] },
      });
      render(<ReviewPanel {...defaultProps} evaluation={evaluation} />);
      
      expect(screen.queryByTestId('improvements-section')).not.toBeInTheDocument();
    });
  });

  describe('ideal solution display (Requirement 4.7)', () => {
    it('displays ideal solution code', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('ideal-solution-code')).toBeInTheDocument();
    });

    it('renders ideal solution with syntax highlighting', () => {
      const evaluation = createEvaluation({
        idealSolution: 'function test() { return 1; }',
      });
      render(<ReviewPanel {...defaultProps} evaluation={evaluation} />);
      
      const codeBlock = screen.getByTestId('ideal-solution-code');
      // Prism adds span elements for syntax highlighting
      expect(codeBlock.innerHTML).toContain('<span');
    });

    it('hides ideal solution section when empty', () => {
      const evaluation = createEvaluation({ idealSolution: '' });
      render(<ReviewPanel {...defaultProps} evaluation={evaluation} />);
      
      expect(screen.queryByTestId('ideal-solution-section')).not.toBeInTheDocument();
    });
  });

  describe('miss tags display', () => {
    it('displays miss tags section when tags exist', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('miss-tags-section')).toBeInTheDocument();
    });

    it('displays all miss tags', () => {
      const evaluation = createEvaluation({
        missTags: ['edge-cases', 'complexity-analysis', 'incorrect-approach'],
      });
      render(<ReviewPanel {...defaultProps} evaluation={evaluation} />);
      
      expect(screen.getByTestId('miss-tag-0')).toHaveTextContent('edge-cases');
      expect(screen.getByTestId('miss-tag-1')).toHaveTextContent('complexity-analysis');
      expect(screen.getByTestId('miss-tag-2')).toHaveTextContent('incorrect-approach');
    });

    it('hides miss tags section when no tags', () => {
      const evaluation = createEvaluation({ missTags: [] });
      render(<ReviewPanel {...defaultProps} evaluation={evaluation} />);
      
      expect(screen.queryByTestId('miss-tags-section')).not.toBeInTheDocument();
    });
  });

  describe('action buttons', () => {
    it('calls onNextProblem when Next Problem button is clicked', () => {
      const onNextProblem = vi.fn();
      render(<ReviewPanel {...defaultProps} onNextProblem={onNextProblem} />);
      
      fireEvent.click(screen.getByTestId('next-problem-button'));
      expect(onNextProblem).toHaveBeenCalledTimes(1);
    });

    it('calls onViewHistory when View History button is clicked', () => {
      const onViewHistory = vi.fn();
      render(<ReviewPanel {...defaultProps} onViewHistory={onViewHistory} />);
      
      fireEvent.click(screen.getByTestId('view-history-button'));
      expect(onViewHistory).toHaveBeenCalledTimes(1);
    });

    it('Next Problem button has correct text', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('next-problem-button')).toHaveTextContent('Next Problem');
    });

    it('View History button has correct text', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('view-history-button')).toHaveTextContent('View History');
    });
  });

  describe('accessibility', () => {
    it('Next Problem button has aria-label', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('next-problem-button')).toHaveAttribute(
        'aria-label',
        'Next problem'
      );
    });

    it('View History button has aria-label', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByTestId('view-history-button')).toHaveAttribute(
        'aria-label',
        'View history'
      );
    });
  });
});

describe('getScoreColor utility', () => {
  it('returns green for score 4', () => {
    expect(getScoreColor(4)).toBe('#a6e3a1');
  });

  it('returns teal for score 3', () => {
    expect(getScoreColor(3)).toBe('#94e2d5');
  });

  it('returns yellow for score 2', () => {
    expect(getScoreColor(2)).toBe('#f9e2af');
  });

  it('returns red for score 1', () => {
    expect(getScoreColor(1)).toBe('#f38ba8');
  });

  it('returns red for score 0', () => {
    expect(getScoreColor(0)).toBe('#f38ba8');
  });
});

describe('getVerdictStyle utility', () => {
  it('returns pass style for Pass verdict', () => {
    const style = getVerdictStyle('Pass');
    expect(style).toHaveProperty('backgroundColor', '#a6e3a1');
  });

  it('returns borderline style for Borderline verdict', () => {
    const style = getVerdictStyle('Borderline');
    expect(style).toHaveProperty('backgroundColor', '#f9e2af');
  });

  it('returns no pass style for No Pass verdict', () => {
    const style = getVerdictStyle('No Pass');
    expect(style).toHaveProperty('backgroundColor', '#f38ba8');
  });
});

describe('highlightCode utility', () => {
  it('highlights JavaScript code', () => {
    const code = 'function test() { return 1; }';
    const highlighted = highlightCode(code);
    
    expect(highlighted).toContain('<span');
    expect(highlighted).toContain('function');
  });

  it('detects Python code and highlights accordingly', () => {
    const code = 'def test():\n    print("hello")';
    const highlighted = highlightCode(code);
    
    expect(highlighted).toContain('<span');
    expect(highlighted).toContain('def');
  });

  it('detects TypeScript code and highlights accordingly', () => {
    const code = 'function test(x: number): string { return x.toString(); }';
    const highlighted = highlightCode(code);
    
    expect(highlighted).toContain('<span');
  });

  it('handles empty code', () => {
    const highlighted = highlightCode('');
    expect(highlighted).toBe('');
  });
});
