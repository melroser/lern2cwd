import React, { useState, useCallback } from 'react';
import { storageService } from '../services/storageService';
import {
  clearEditorSettings,
  DEFAULT_EDITOR_SETTINGS,
  saveEditorSettings,
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
  onProblemSetSelectionChange?: (problemSetIds: string[]) => void;
  isFirstLaunch?: boolean;
  vimMode?: boolean;
  problemSetOptions?: ProblemSetOption[];
  selectedProblemSetIds?: string[];
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    backgroundColor: '#1e1e2e',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '560px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    border: '1px solid #45475a',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#89b4fa',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#6c7086',
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
    color: '#cdd6f4',
    marginBottom: '12px',
  },
  description: {
    fontSize: '0.9rem',
    color: '#a6adc8',
    lineHeight: 1.6,
    marginBottom: '16px',
  },
  infoBox: {
    backgroundColor: 'rgba(137, 180, 250, 0.1)',
    border: '1px solid #89b4fa',
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
    color: '#89b4fa',
    marginBottom: '8px',
  },
  infoText: {
    fontSize: '0.85rem',
    color: '#89b4fa',
    lineHeight: 1.6,
    margin: 0,
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
  cancelButton: {
    padding: '12px 24px',
    fontSize: '1rem',
    fontWeight: 500,
    color: '#cdd6f4',
    backgroundColor: '#45475a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  saveButton: {
    padding: '12px 24px',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#1e1e2e',
    backgroundColor: '#a6e3a1',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  saveButtonDisabled: {
    backgroundColor: '#45475a',
    color: '#6c7086',
    cursor: 'not-allowed',
  },
  dangerSection: {
    marginTop: '24px',
    paddingTop: '24px',
    borderTop: '1px solid #45475a',
  },
  dangerBox: {
    backgroundColor: 'rgba(243, 139, 168, 0.1)',
    border: '1px solid #f38ba8',
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
    color: '#f38ba8',
    marginBottom: '12px',
  },
  dangerText: {
    fontSize: '0.85rem',
    color: '#f38ba8',
    lineHeight: 1.6,
    margin: 0,
    marginBottom: '16px',
  },
  clearAllButton: {
    padding: '12px 24px',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#1e1e2e',
    backgroundColor: '#f38ba8',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
  },
  confirmDialog: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3000,
  },
  confirmBox: {
    backgroundColor: '#1e1e2e',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    border: '1px solid #f38ba8',
  },
  confirmTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#f38ba8',
    marginBottom: '16px',
    textAlign: 'center' as const,
  },
  confirmText: {
    fontSize: '0.95rem',
    color: '#cdd6f4',
    lineHeight: 1.6,
    marginBottom: '24px',
    textAlign: 'center' as const,
  },
  confirmButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  confirmCancelButton: {
    padding: '10px 20px',
    fontSize: '0.95rem',
    fontWeight: 500,
    color: '#cdd6f4',
    backgroundColor: '#45475a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  confirmDeleteButton: {
    padding: '10px 20px',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#1e1e2e',
    backgroundColor: '#f38ba8',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  privacyNotice: {
    backgroundColor: 'rgba(166, 227, 161, 0.1)',
    border: '1px solid #a6e3a1',
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
    color: '#a6e3a1',
    marginBottom: '8px',
  },
  privacyNoticeText: {
    fontSize: '0.85rem',
    color: '#a6e3a1',
    lineHeight: 1.6,
    margin: 0,
  },
  problemSetGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '10px',
  },
  problemSetCard: {
    border: '1px solid #45475a',
    borderRadius: '8px',
    padding: '12px',
    backgroundColor: '#181825',
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
  },
  problemSetTitle: {
    fontSize: '0.95rem',
    color: '#cdd6f4',
    fontWeight: 600,
    marginBottom: '4px',
  },
  problemSetMeta: {
    fontSize: '0.8rem',
    color: '#a6adc8',
    lineHeight: 1.45,
  },
  envKeyHint: {
    marginTop: '10px',
    fontSize: '0.82rem',
    color: '#89dceb',
    lineHeight: 1.4,
  },
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onVimModeChange,
  onProblemSetSelectionChange,
  isFirstLaunch = false,
  vimMode = false,
  problemSetOptions = [],
  selectedProblemSetIds = [],
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const effectiveVimMode = vimMode ?? DEFAULT_EDITOR_SETTINGS.vimMode;
  const effectiveProblemSetIds = selectedProblemSetIds;

  const handleClearAllData = useCallback(() => {
    storageService.clearSessions();
    clearEditorSettings();
    clearProblemSetSettings();
    setShowClearConfirm(false);
    onVimModeChange?.(DEFAULT_EDITOR_SETTINGS.vimMode);
    onProblemSetSelectionChange?.([]);
  }, [onProblemSetSelectionChange, onVimModeChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  const canClose = true;

  const handleProblemSetToggle = useCallback((setId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...effectiveProblemSetIds, setId]))
      : effectiveProblemSetIds.filter((id) => id !== setId);
    onProblemSetSelectionChange?.(next);
  }, [effectiveProblemSetIds, onProblemSetSelectionChange]);

  if (!isOpen) return null;

  return (
    <div 
      style={styles.overlay} 
      data-testid="settings-modal-overlay"
      onClick={canClose ? onClose : undefined}
    >
      <div 
        style={styles.modal} 
        data-testid="settings-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div style={styles.header}>
          <h2 style={styles.title}>
            ⚙️ Settings
          </h2>
          {canClose && (
            <button
              style={styles.closeButton}
              onClick={onClose}
              data-testid="settings-close-button"
              aria-label="Close settings"
            >
              ✕
            </button>
          )}
        </div>

        {isFirstLaunch && (
          <div style={styles.infoBox}>
            <div style={styles.infoTitle}>
              <span>ℹ️</span>
              <span>Welcome to Coding Interview Simulator!</span>
            </div>
            <p style={styles.infoText}>
              This app uses AI to simulate interview sessions. LLM access is configured
              centrally for the invite-only beta and is not entered in the browser.
            </p>
          </div>
        )}

        {/* Privacy notice on first launch - Requirement 9.6 */}
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

        {/* Editor Settings Section */}
        <div style={styles.section} data-testid="editor-settings-section">
          <h3 style={styles.sectionTitle}>Editor</h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.9rem', color: '#cdd6f4', fontWeight: 500 }}>Vim Bindings</div>
              <div style={{ fontSize: '0.8rem', color: '#a6adc8', marginTop: '4px' }}>
                Navigate and edit with vim keybindings (hjkl, i, Esc, etc.)
              </div>
            </div>
            <button
              onClick={() => {
                const next = !effectiveVimMode;
                const nextSettings = { vimMode: next };
                saveEditorSettings(nextSettings);
                onVimModeChange?.(next);
              }}
              style={{
                padding: '6px 16px',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: effectiveVimMode ? '#1e1e2e' : '#cdd6f4',
                backgroundColor: effectiveVimMode ? '#a6e3a1' : '#45475a',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '60px',
              }}
              data-testid="vim-mode-toggle"
            >
              {effectiveVimMode ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Problem Sets Section */}
        <div style={styles.section} data-testid="problem-set-section">
          <h3 style={styles.sectionTitle}>Problem Sets</h3>
          <p style={styles.description}>
            Select which banks are used for random session questions.
          </p>
          <div style={styles.problemSetGrid}>
            {problemSetOptions.map((setOption) => {
              const checked = effectiveProblemSetIds.includes(setOption.id);
              return (
                <label key={setOption.id} style={styles.problemSetCard}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => handleProblemSetToggle(setOption.id, e.target.checked)}
                    data-testid={`problem-set-toggle-${setOption.id}`}
                  />
                  <div>
                    <div style={styles.problemSetTitle}>{setOption.label}</div>
                    <div style={styles.problemSetMeta}>
                      {setOption.description}
                    </div>
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

        {/* Data Management Section - Requirement 9.5 */}
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

        <div style={styles.buttonGroup}>
          <button
            style={styles.cancelButton}
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

      {/* Clear All Data Confirmation Dialog */}
      {showClearConfirm && (
        <div 
          style={styles.confirmDialog} 
          data-testid="clear-confirm-dialog"
          onClick={() => setShowClearConfirm(false)}
        >
          <div 
            style={styles.confirmBox}
            onClick={(e) => e.stopPropagation()}
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
