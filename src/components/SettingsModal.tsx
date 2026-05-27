import React, { useCallback, useState } from 'react';
import { storageService } from '../services/storageService';
import {
  clearEditorSettings,
  DEFAULT_EDITOR_SETTINGS,
  saveEditorSettings,
  type ThemeMode,
} from '../utils/editorSettings';
import { clearProblemSetSettings } from '../utils/problemSetSettings';
import type { ProblemSetOption } from '../types';

/**
 * SettingsModal - App settings for the invite-only beta.
 *
 * API key entry is intentionally not exposed in the browser. LLM access
 * is environment-managed for the deployed app.
 */

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onVimModeChange?: (enabled: boolean) => void;
  onThemeModeChange?: (mode: ThemeMode) => void;
  onProblemSetSelectionChange?: (problemSetIds: string[]) => void;
  isFirstLaunch?: boolean;
  vimMode?: boolean;
  themeMode?: ThemeMode;
  problemSetOptions?: ProblemSetOption[];
  selectedProblemSetIds?: string[];
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'var(--modal-overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '20px',
  },
  modal: {
    backgroundColor: 'var(--panel-solid)',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '560px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 8px 32px var(--shadow-strong)',
    border: '1px solid var(--panel-border-strong)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    gap: '12px',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: 'var(--accent-primary)',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '1.5rem',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--text-strong)',
    marginBottom: '12px',
  },
  description: {
    fontSize: '0.9rem',
    color: 'var(--text-soft)',
    lineHeight: 1.6,
    marginBottom: '16px',
  },
  infoBox: {
    backgroundColor: 'var(--info-bg)',
    border: '1px solid var(--accent-primary)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  },
  infoTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--accent-primary)',
    marginBottom: '8px',
  },
  infoText: {
    fontSize: '0.85rem',
    color: 'var(--accent-primary)',
    lineHeight: 1.6,
    margin: 0,
  },
  dangerSection: {
    marginTop: '24px',
    paddingTop: '24px',
    borderTop: '1px solid var(--panel-border-strong)',
  },
  dangerBox: {
    backgroundColor: 'var(--danger-bg)',
    border: '1px solid var(--danger-accent)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  },
  dangerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--danger-accent)',
    marginBottom: '12px',
  },
  dangerText: {
    fontSize: '0.85rem',
    color: 'var(--danger-accent)',
    lineHeight: 1.6,
    margin: 0,
    marginBottom: '16px',
  },
  clearAllButton: {
    padding: '12px 24px',
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--button-danger-text)',
    backgroundColor: 'var(--danger-accent)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
  },
  confirmDialog: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'var(--modal-overlay-strong)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3000,
    padding: '20px',
  },
  confirmBox: {
    backgroundColor: 'var(--panel-solid)',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '400px',
    width: '100%',
    border: '1px solid var(--danger-accent)',
  },
  confirmTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: 'var(--danger-accent)',
    marginBottom: '16px',
    textAlign: 'center',
  },
  confirmText: {
    fontSize: '0.95rem',
    color: 'var(--text-strong)',
    lineHeight: 1.6,
    marginBottom: '24px',
    textAlign: 'center',
  },
  confirmButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  confirmCancelButton: {
    padding: '10px 20px',
    fontSize: '0.95rem',
    fontWeight: 500,
    color: 'var(--text-strong)',
    backgroundColor: 'var(--button-secondary-bg)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  confirmDeleteButton: {
    padding: '10px 20px',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--button-danger-text)',
    backgroundColor: 'var(--danger-accent)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  privacyNotice: {
    backgroundColor: 'var(--success-bg)',
    border: '1px solid var(--success-accent)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
  },
  privacyNoticeTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--success-accent)',
    marginBottom: '8px',
  },
  privacyNoticeText: {
    fontSize: '0.85rem',
    color: 'var(--success-accent)',
    lineHeight: 1.6,
    margin: 0,
  },
  problemSetGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '10px',
  },
  problemSetCard: {
    border: '1px solid var(--panel-border-strong)',
    borderRadius: '8px',
    padding: '12px',
    backgroundColor: 'var(--panel-subtle)',
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
  },
  problemSetTitle: {
    fontSize: '0.95rem',
    color: 'var(--text-strong)',
    fontWeight: 600,
    marginBottom: '4px',
  },
  problemSetMeta: {
    fontSize: '0.8rem',
    color: 'var(--text-soft)',
    lineHeight: 1.45,
  },
  tutorialModeNotice: {
    border: '1px solid var(--accent-primary)',
    borderRadius: '8px',
    padding: '14px 16px',
    marginBottom: '14px',
    backgroundColor: 'var(--info-bg)',
  },
  tutorialModeTitle: {
    color: 'var(--accent-primary)',
    fontSize: '0.9rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '6px',
  },
  tutorialModeText: {
    color: 'var(--text-strong)',
    fontSize: '0.85rem',
    lineHeight: 1.55,
    margin: 0,
  },
  settingLabel: {
    fontSize: '0.9rem',
    color: 'var(--text-strong)',
    fontWeight: 500,
  },
  settingDescription: {
    fontSize: '0.8rem',
    color: 'var(--text-soft)',
    marginTop: '4px',
  },
  inlineRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  themeModeRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '12px',
  },
  themeModeButton: {
    padding: '8px 12px',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-soft)',
    backgroundColor: 'var(--button-secondary-bg)',
    border: '1px solid var(--panel-border-strong)',
    borderRadius: '999px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  themeModeButtonActive: {
    color: 'var(--button-primary-text)',
    backgroundColor: 'var(--button-primary-bg)',
    borderColor: 'var(--button-primary-bg)',
  },
  toggleButton: {
    padding: '6px 16px',
    fontSize: '0.85rem',
    fontWeight: 600,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minWidth: '60px',
  },
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onVimModeChange,
  onThemeModeChange,
  onProblemSetSelectionChange,
  isFirstLaunch = false,
  vimMode = false,
  themeMode = DEFAULT_EDITOR_SETTINGS.themeMode,
  problemSetOptions = [],
  selectedProblemSetIds = [],
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const effectiveVimMode = vimMode ?? DEFAULT_EDITOR_SETTINGS.vimMode;
  const effectiveThemeMode = themeMode ?? DEFAULT_EDITOR_SETTINGS.themeMode;
  const effectiveProblemSetIds = selectedProblemSetIds;
  const configurableProblemSetOptions = problemSetOptions.filter((setOption) => setOption.id !== 'tutorial');
  const isTutorialMode = effectiveProblemSetIds.length === 0;

  const handleClearAllData = useCallback(() => {
    storageService.clearSessions();
    clearEditorSettings();
    clearProblemSetSettings();
    setShowClearConfirm(false);
    onVimModeChange?.(DEFAULT_EDITOR_SETTINGS.vimMode);
    onThemeModeChange?.(DEFAULT_EDITOR_SETTINGS.themeMode);
    onProblemSetSelectionChange?.([]);
  }, [onProblemSetSelectionChange, onThemeModeChange, onVimModeChange]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  const handleProblemSetToggle = useCallback((setId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...effectiveProblemSetIds, setId]))
      : effectiveProblemSetIds.filter((id) => id !== setId);
    onProblemSetSelectionChange?.(next);
  }, [effectiveProblemSetIds, onProblemSetSelectionChange]);

  const handleThemeSelection = useCallback((nextThemeMode: ThemeMode) => {
    saveEditorSettings({ themeMode: nextThemeMode });
    onThemeModeChange?.(nextThemeMode);
  }, [onThemeModeChange]);

  if (!isOpen) return null;

  return (
    <div
      style={styles.overlay}
      data-testid="settings-modal-overlay"
      onClick={onClose}
    >
      <div
        style={styles.modal}
        data-testid="settings-modal"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div style={styles.header}>
          <h2 style={styles.title}>⚙️ Settings</h2>
          <button
            style={styles.closeButton}
            onClick={onClose}
            data-testid="settings-close-button"
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        {isFirstLaunch && (
          <div style={styles.infoBox}>
            <div style={styles.infoTitle}>
              <span>ℹ️</span>
              <span>Welcome to Lern2Cwd!</span>
            </div>
            <p style={styles.infoText}>
              This app uses AI to help you practice interview questions. LLM access is configured
              centrally for the invite-only beta and is not entered in the browser.
            </p>
          </div>
        )}

        {isFirstLaunch && (
          <div style={styles.privacyNotice} data-testid="privacy-notice">
            <div style={styles.privacyNoticeTitle}>
              <span>🔒</span>
              <span>Privacy First</span>
            </div>
            <p style={styles.privacyNoticeText}>
              Your local history and preferences stay on this device under your
              signed-in profile. LLM requests go through the authenticated server gateway.
            </p>
          </div>
        )}

        <div style={styles.infoBox} data-testid="llm-access-info">
          <div style={styles.infoTitle}>
            <span>🔐</span>
            <span>LLM Access</span>
          </div>
          <p style={styles.infoText}>
            LLM access is managed for authenticated beta users through environment
            configuration on the deployment.
          </p>
        </div>

        <div style={styles.section} data-testid="editor-settings-section">
          <h3 style={styles.sectionTitle}>Answer</h3>

          <div style={{ marginBottom: '18px' }}>
            <div style={styles.settingLabel}>Theme</div>
            <div style={styles.settingDescription}>
              Follow the system theme by default, or lock the app to dark or light mode.
            </div>
            <div style={styles.themeModeRow}>
              {(['system', 'dark', 'light'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleThemeSelection(mode)}
                  style={{
                    ...styles.themeModeButton,
                    ...(effectiveThemeMode === mode ? styles.themeModeButtonActive : {}),
                  }}
                  data-testid={`theme-mode-${mode}`}
                >
                  {mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light'}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.inlineRow}>
            <div>
              <div style={styles.settingLabel}>Vim Bindings</div>
              <div style={styles.settingDescription}>
                Navigate and edit with vim keybindings (hjkl, i, Esc, etc.)
              </div>
            </div>
            <button
              onClick={() => {
                const next = !effectiveVimMode;
                saveEditorSettings({ vimMode: next });
                onVimModeChange?.(next);
              }}
              style={{
                ...styles.toggleButton,
                color: effectiveVimMode ? 'var(--button-primary-text)' : 'var(--text-strong)',
                backgroundColor: effectiveVimMode ? 'var(--button-primary-bg)' : 'var(--button-secondary-bg)',
              }}
              data-testid="vim-mode-toggle"
            >
              {effectiveVimMode ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <div style={styles.section} data-testid="problem-set-section">
          <h3 style={styles.sectionTitle}>Practice Areas</h3>
          <p style={styles.description}>
            Choose the kinds of questions you want to practice. If nothing is selected, the tutorial starts first.
          </p>

          {isTutorialMode && (
            <div style={styles.tutorialModeNotice} data-testid="tutorial-mode-notice">
              <div style={styles.tutorialModeTitle}>Tutorial First</div>
              <p style={styles.tutorialModeText}>
                No practice areas are selected. The tutorial starts first until you choose one below.
              </p>
            </div>
          )}

          <div style={styles.problemSetGrid}>
            {configurableProblemSetOptions.map((setOption) => {
              const checked = effectiveProblemSetIds.includes(setOption.id);
              return (
                <label key={setOption.id} style={styles.problemSetCard}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => handleProblemSetToggle(setOption.id, event.target.checked)}
                    data-testid={`problem-set-toggle-${setOption.id}`}
                  />
                  <div>
                    <div style={styles.problemSetTitle}>{setOption.label}</div>
                    <div style={styles.problemSetMeta}>{setOption.description}</div>
                    <div style={styles.problemSetMeta}>
                      {setOption.questionCount} questions • {setOption.assessmentType} • {setOption.domain}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div style={styles.infoBox}>
          <div style={styles.infoTitle}>
            <span>💡</span>
            <span>Data Privacy</span>
          </div>
          <p style={styles.infoText}>
            Local history and editor preferences stay on this device. The API key
            is server-managed and never stored in the browser.
          </p>
        </div>

        {!isFirstLaunch && (
          <div style={styles.dangerSection} data-testid="data-management-section">
            <div style={styles.dangerBox}>
              <div style={styles.dangerTitle}>
                <span>🗑️</span>
                <span>Data Management</span>
              </div>
              <p style={styles.dangerText}>
                Clear all stored data including session history and other locally stored
                simulator state. This action cannot be undone.
              </p>
              <button
                style={styles.clearAllButton}
                onClick={() => setShowClearConfirm(true)}
                data-testid="clear-all-data-button"
              >
                Clear All Data
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button
            style={styles.confirmCancelButton}
            onClick={() => {
              onSave();
              onClose();
            }}
            data-testid="settings-cancel-button"
          >
            Close
          </button>
        </div>
      </div>

      {showClearConfirm && (
        <div
          style={styles.confirmDialog}
          data-testid="clear-confirm-dialog"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            style={styles.confirmBox}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 style={styles.confirmTitle}>⚠️ Clear All Data?</h3>
            <p style={styles.confirmText}>
              This will permanently delete all your session history and other
              locally stored simulator data. This action cannot be undone.
            </p>
            <div style={styles.confirmButtons}>
              <button
                style={styles.confirmCancelButton}
                onClick={() => setShowClearConfirm(false)}
                data-testid="clear-confirm-cancel"
              >
                Cancel
              </button>
              <button
                style={styles.confirmDeleteButton}
                onClick={handleClearAllData}
                data-testid="clear-confirm-delete"
              >
                Delete Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsModal;
