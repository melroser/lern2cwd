import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CodeEditorPanel } from '../CodeEditorPanel';

const defaultProps = {
  problemPrompt: 'Return the sum of two numbers.',
  code: 'def sum_two(a, b):\n    return a + b',
  onCodeChange: vi.fn(),
  onSubmit: vi.fn(),
  isDisabled: false,
  language: 'python' as const,
};

describe('CodeEditorPanel', () => {
  it('renders the editor shell and current solution header', () => {
    render(<CodeEditorPanel {...defaultProps} />);

    expect(screen.getByTestId('code-editor-panel')).toBeInTheDocument();
    expect(screen.getByText(/your solution/i)).toBeInTheDocument();
    expect(screen.getByTestId('editor-wrapper')).toBeInTheDocument();
  });

  it('submits when the user clicks the button', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<CodeEditorPanel {...defaultProps} onSubmit={onSubmit} />);
    await user.click(screen.getByTestId('submit-button'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables submission when the panel is read-only', () => {
    render(<CodeEditorPanel {...defaultProps} isDisabled />);

    expect(screen.getByTestId('submit-button')).toBeDisabled();
  });

  it('shows the vim indicator when vim mode is enabled', () => {
    render(<CodeEditorPanel {...defaultProps} vimMode />);

    expect(screen.getByText('VIM')).toBeInTheDocument();
  });
});
