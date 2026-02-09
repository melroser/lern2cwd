import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CodeEditorPanel } from '../CodeEditorPanel';

/**
 * Unit tests for CodeEditorPanel component (CodeMirror 6)
 *
 * Requirements:
 * - 7.1: Plain text editing interface
 * - 7.2: Scaffold display and editing
 * - 7.3: Tab key for indentation
 */

describe('CodeEditorPanel Component', () => {
  const defaultProps = {
    problemPrompt: 'Write a function that returns the sum of two numbers.',
    code: 'function sum(a, b) {\n  return a + b;\n}',
    onCodeChange: vi.fn(),
    onSubmit: vi.fn(),
    isDisabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the code editor panel container', () => {
      render(<CodeEditorPanel {...defaultProps} />);
      expect(screen.getByTestId('code-editor-panel')).toBeInTheDocument();
    });

    it('displays the problem prompt', () => {
      render(<CodeEditorPanel {...defaultProps} />);
      expect(screen.getByTestId('problem-prompt')).toHaveTextContent(
        'Write a function that returns the sum of two numbers.'
      );
    });

    it('displays default message when problem prompt is empty', () => {
      render(<CodeEditorPanel {...defaultProps} problemPrompt="" />);
      expect(screen.getByTestId('problem-prompt')).toHaveTextContent('No problem loaded');
    });

    it('renders the submit button with "I\'m Done" text', () => {
      render(<CodeEditorPanel {...defaultProps} />);
      expect(screen.getByTestId('submit-button')).toHaveTextContent("I'm Done");
    });

    it('renders the problem prompt section', () => {
      render(<CodeEditorPanel {...defaultProps} />);
      expect(screen.getByTestId('problem-prompt-section')).toBeInTheDocument();
    });

    it('renders the editor wrapper', () => {
      render(<CodeEditorPanel {...defaultProps} />);
      expect(screen.getByTestId('editor-wrapper')).toBeInTheDocument();
    });

    it('mounts a CodeMirror editor inside the wrapper', () => {
      render(<CodeEditorPanel {...defaultProps} />);
      const wrapper = screen.getByTestId('editor-wrapper');
      // CodeMirror creates a .cm-editor element
      expect(wrapper.querySelector('.cm-editor')).toBeTruthy();
    });

    it('displays the code content in the editor', () => {
      render(<CodeEditorPanel {...defaultProps} />);
      const wrapper = screen.getByTestId('editor-wrapper');
      const content = wrapper.querySelector('.cm-content');
      expect(content?.textContent).toContain('function sum');
    });
  });

  describe('scaffold display (Requirement 7.2)', () => {
    it('displays scaffold code when provided', () => {
      const scaffold = 'function twoSum(nums, target) {\n  // Your code here\n}';
      render(<CodeEditorPanel {...defaultProps} code={scaffold} />);
      const wrapper = screen.getByTestId('editor-wrapper');
      expect(wrapper.querySelector('.cm-content')?.textContent).toContain('twoSum');
    });

    it('displays empty editor when no code is provided', () => {
      render(<CodeEditorPanel {...defaultProps} code="" />);
      const wrapper = screen.getByTestId('editor-wrapper');
      // Empty editor should still mount
      expect(wrapper.querySelector('.cm-editor')).toBeTruthy();
    });
  });

  describe('submit button', () => {
    it('calls onSubmit when submit button is clicked', () => {
      const onSubmit = vi.fn();
      render(<CodeEditorPanel {...defaultProps} onSubmit={onSubmit} />);
      fireEvent.click(screen.getByTestId('submit-button'));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('does not call onSubmit when button is disabled', () => {
      const onSubmit = vi.fn();
      render(<CodeEditorPanel {...defaultProps} onSubmit={onSubmit} isDisabled={true} />);
      fireEvent.click(screen.getByTestId('submit-button'));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('button is disabled when isDisabled is true', () => {
      render(<CodeEditorPanel {...defaultProps} isDisabled={true} />);
      expect(screen.getByTestId('submit-button')).toBeDisabled();
    });

    it('button is enabled when isDisabled is false', () => {
      render(<CodeEditorPanel {...defaultProps} isDisabled={false} />);
      expect(screen.getByTestId('submit-button')).not.toBeDisabled();
    });
  });

  describe('disabled state', () => {
    it('applies reduced opacity when disabled', () => {
      render(<CodeEditorPanel {...defaultProps} isDisabled={true} />);
      const wrapper = screen.getByTestId('editor-wrapper');
      expect(wrapper.style.opacity).toBe('0.6');
    });
  });

  describe('accessibility', () => {
    it('submit button has aria-label', () => {
      render(<CodeEditorPanel {...defaultProps} />);
      expect(screen.getByTestId('submit-button')).toHaveAttribute(
        'aria-label',
        'Submit solution'
      );
    });
  });

  describe('keyboard shortcuts', () => {
    it('calls onSubmit on Ctrl+Enter when not disabled', () => {
      const onSubmit = vi.fn();
      render(<CodeEditorPanel {...defaultProps} onSubmit={onSubmit} />);
      const editorWrapper = screen.getByTestId('editor-wrapper');
      fireEvent.keyDown(editorWrapper, { key: 'Enter', ctrlKey: true });
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('does not call onSubmit on Ctrl+Enter when disabled', () => {
      const onSubmit = vi.fn();
      render(<CodeEditorPanel {...defaultProps} onSubmit={onSubmit} isDisabled={true} />);
      const editorWrapper = screen.getByTestId('editor-wrapper');
      fireEvent.keyDown(editorWrapper, { key: 'Enter', ctrlKey: true });
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('vim mode', () => {
    it('shows VIM indicator when vim mode is enabled', () => {
      render(<CodeEditorPanel {...defaultProps} vimMode={true} />);
      expect(screen.getByText('VIM')).toBeInTheDocument();
    });

    it('does not show VIM indicator when vim mode is disabled', () => {
      render(<CodeEditorPanel {...defaultProps} vimMode={false} />);
      expect(screen.queryByText('VIM')).not.toBeInTheDocument();
    });
  });

  describe('code sync from parent', () => {
    it('updates editor content when code prop changes', () => {
      const { rerender } = render(<CodeEditorPanel {...defaultProps} code="initial" />);
      
      act(() => {
        rerender(<CodeEditorPanel {...defaultProps} code="updated code" />);
      });

      const wrapper = screen.getByTestId('editor-wrapper');
      expect(wrapper.querySelector('.cm-content')?.textContent).toContain('updated code');
    });
  });
});
