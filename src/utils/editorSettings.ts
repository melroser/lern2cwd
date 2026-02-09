/**
 * Editor settings storage utilities
 * Persists editor preferences (vim mode, etc.) to localStorage.
 */

const EDITOR_SETTINGS_KEY = 'coding-interview-editor-settings';

export interface EditorSettings {
  vimMode: boolean;
}

const DEFAULT_SETTINGS: EditorSettings = {
  vimMode: false,
};

export function getEditorSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(EDITOR_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveEditorSettings(settings: EditorSettings): void {
  try {
    localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}
