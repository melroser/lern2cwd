/**
 * Editor settings storage utilities
 * Persists editor preferences (vim mode, etc.) to localStorage.
 */

const EDITOR_SETTINGS_KEY = 'coding-interview-editor-settings';
let storageScope: string | null = null;

export interface EditorSettings {
  vimMode: boolean;
}

const DEFAULT_SETTINGS: EditorSettings = {
  vimMode: false,
};

function getStorageKey(): string {
  return storageScope ? `${EDITOR_SETTINGS_KEY}:${storageScope}` : EDITOR_SETTINGS_KEY;
}

export function setEditorSettingsStorageScope(scope: string | null): void {
  storageScope = scope;
}

export function getEditorSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveEditorSettings(settings: EditorSettings): void {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

export function clearEditorSettings(): void {
  try {
    localStorage.removeItem(getStorageKey());
  } catch {
    // Ignore storage errors
  }
}

export { DEFAULT_SETTINGS as DEFAULT_EDITOR_SETTINGS };
