import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from '../SettingsModal';
import { storageService } from '../../services/storageService';
import * as editorSettings from '../../utils/editorSettings';
import * as problemSetSettings from '../../utils/problemSetSettings';

vi.mock('../../services/storageService', () => ({
  storageService: {
    clearSessions: vi.fn(),
  },
}));

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(editorSettings, 'clearEditorSettings').mockImplementation(() => undefined);
    vi.spyOn(editorSettings, 'saveEditorSettings').mockImplementation(() => undefined);
    vi.spyOn(problemSetSettings, 'clearProblemSetSettings').mockImplementation(() => undefined);
  });

  it('shows server-managed LLM access instead of a browser API key field', () => {
    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByTestId('llm-access-info')).toHaveTextContent(
      /LLM access is managed for authenticated beta users through environment configuration on the deployment/i,
    );
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
  });

  it('updates selected problem sets', async () => {
    const user = userEvent.setup();
    const onProblemSetSelectionChange = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
        onProblemSetSelectionChange={onProblemSetSelectionChange}
        problemSetOptions={[
          {
            id: 'python-fundamentals',
            label: 'Python Fundamentals',
            description: 'Core Python drills.',
            assessmentType: 'coding',
            domain: 'python-fundamentals',
            questionCount: 12,
          },
        ]}
        selectedProblemSetIds={[]}
      />,
    );

    await user.click(screen.getByTestId('problem-set-toggle-python-fundamentals'));

    expect(onProblemSetSelectionChange).toHaveBeenCalledWith(['python-fundamentals']);
  });

  it('clears stored session data after confirmation', async () => {
    const user = userEvent.setup();

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('clear-all-data-button'));
    await user.click(screen.getByTestId('clear-confirm-delete'));

    expect(storageService.clearSessions).toHaveBeenCalledTimes(1);
    expect(editorSettings.clearEditorSettings).toHaveBeenCalledTimes(1);
    expect(problemSetSettings.clearProblemSetSettings).toHaveBeenCalledTimes(1);
  });
});
