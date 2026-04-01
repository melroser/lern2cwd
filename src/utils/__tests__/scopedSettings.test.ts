import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_EDITOR_SETTINGS,
  clearEditorSettings,
  getEditorSettings,
  saveEditorSettings,
  setEditorSettingsStorageScope,
} from '../editorSettings';
import {
  clearProblemSetSettings,
  DEFAULT_SELECTED_PROBLEM_SETS,
  getProblemSetSettings,
  saveProblemSetSettings,
  setProblemSetSettingsStorageScope,
} from '../problemSetSettings';

describe('scoped local preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    setEditorSettingsStorageScope(null);
    setProblemSetSettingsStorageScope(null);
  });

  it('keeps editor settings isolated per signed-in profile', () => {
    setEditorSettingsStorageScope('netlify:user-a');
    saveEditorSettings({ vimMode: true });

    setEditorSettingsStorageScope('netlify:user-b');
    expect(getEditorSettings()).toEqual(DEFAULT_EDITOR_SETTINGS);

    saveEditorSettings({ vimMode: false });
    setEditorSettingsStorageScope('netlify:user-a');
    expect(getEditorSettings()).toEqual({ vimMode: true });
  });

  it('clears only the current scoped editor settings', () => {
    setEditorSettingsStorageScope('netlify:user-a');
    saveEditorSettings({ vimMode: true });
    clearEditorSettings();

    expect(getEditorSettings()).toEqual(DEFAULT_EDITOR_SETTINGS);
  });

  it('keeps problem-set selections isolated per signed-in profile', () => {
    setProblemSetSettingsStorageScope('netlify:user-a');
    saveProblemSetSettings({ selectedProblemSetIds: ['python-fundamentals'] });

    setProblemSetSettingsStorageScope('netlify:user-b');
    expect(getProblemSetSettings()).toEqual({ selectedProblemSetIds: DEFAULT_SELECTED_PROBLEM_SETS });

    saveProblemSetSettings({ selectedProblemSetIds: ['python-intermediate'] });
    setProblemSetSettingsStorageScope('netlify:user-a');
    expect(getProblemSetSettings()).toEqual({ selectedProblemSetIds: ['python-fundamentals'] });
  });

  it('clears only the current scoped problem-set selections', () => {
    setProblemSetSettingsStorageScope('netlify:user-a');
    saveProblemSetSettings({ selectedProblemSetIds: ['python-fundamentals'] });
    clearProblemSetSettings();

    expect(getProblemSetSettings()).toEqual({ selectedProblemSetIds: DEFAULT_SELECTED_PROBLEM_SETS });
  });
});
