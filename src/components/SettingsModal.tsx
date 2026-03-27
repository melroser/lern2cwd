import React, { useState, useCallback, useMemo } from 'react';
import { saveApiKey, removeApiKey } from '../utils/apiKeyStorage';
import { storageService } from '../services/storageService';
import { saveEditorSettings, getEditorSettings } from '../utils/editorSettings';
import type { ProblemSetOption } from '../types';

/**
 * SettingsModal - Modal for BYOK (Bring Your Own Key) API key management
 * 
 * Requirements: 3.2, 4.1
 * 
 * Security Model (from design.md):
 * - User enters their API key in Settings modal on first launch
 * - Key is stored in localStorage (plaintext for MVP, optional passphrase encryption future)
 * - Key is sent directly from browser to LLM API (no backend proxy)
 * - User is responsible for their own API usage and billing
 * 
 * Security Warnings (must be explicit with users):
 * - The API key is visible in browser DevTools Network tab
 * - Users should use keys with spending limits set
 * - On shared devices, other users could access stored keys
 * - Browser sync may copy localStorage to other devices
 * - XSS vulnerabilities could expose the key
 */

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (apiKey: string) => void;
  onVimModeChange?: (enabled: boolean) => void;
  onProblemSetSelectionChange?: (problemSetIds: string[]) => void;
  initialApiKey?: string;
  isFirstLaunch?: boolean;
  vimMode?: boolean;
  problemSetOptions?: ProblemSetOption[];
  selectedProblemSetIds?: string[];
  isEnvironmentApiKeyConfigured?: boolean;
  environmentApiKeySource?: string | null;
  canManageApiKey?: boolean;
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
  inputGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#cdd6f4',
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '1rem',
    fontFamily: 'monospace',
    backgroundColor: '#313244',
    border: '1px solid #45475a',
    borderRadius: '8px',
    color: '#cdd6f4',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box' as const,
  },
  inputFocused: {
    borderColor: '#89b4fa',
  },
  warningBox: {
    backgroundColor: 'rgba(249, 226, 175, 0.1)',
    border: '1px solid #f9e2af',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  },
  warningTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#f9e2af',
    marginBottom: '12px',
  },
  warningIcon: {
    fontSize: '1.1rem',
  },
  warningList: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '0.85rem',
    color: '#f9e2af',
    lineHeight: 1.8,
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
  removeButton: {
    padding: '12px 24px',
    fontSize: '1rem',
    fontWeight: 500,
    color: '#f38ba8',
    backgroundColor: 'transparent',
    border: '1px solid #f38ba8',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  keyStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.875rem',
    marginTop: '8px',
  },
  keyStatusConfigured: {
    color: '#a6e3a1',
  },
  keyStatusNotConfigured: {
    color: '#f38ba8',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  statusDotConfigured: {
    backgroundColor: '#a6e3a1',
  },
  statusDotNotConfigured: {
    backgroundColor: '#f38ba8',
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
  initialApiKey = '',
  isFirstLaunch = false,
  vimMode = false,
  problemSetOptions = [],
  selectedProblemSetIds = [],
  isEnvironmentApiKeyConfigured = false,
  environmentApiKeySource = null,
  canManageApiKey = true,
}) => {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const effectiveVimMode = vimMode ?? getEditorSettings().vimMode;
  const effectiveProblemSetIds = selectedProblemSetIds;

  // Use a key to reset state when modal opens with different initialApiKey
  const modalKey = useMemo(() => `${isOpen}-${initialApiKey}`, [isOpen, initialApiKey]);

  // Reset state when modal opens (using key pattern instead of useEffect)
  const currentApiKey = isOpen ? apiKey : initialApiKey;
  if (isOpen && apiKey !== initialApiKey && apiKey === '') {
    // This handles the case when modal opens fresh
  }

  const handleSave = useCallback(() => {
    const trimmedKey = currentApiKey.trim();
    if (trimmedKey) {
      saveApiKey(trimmedKey);
      onSave(trimmedKey);
      onClose();
    }
  }, [currentApiKey, onSave, onClose]);

  const handleRemoveKey = useCallback(() => {
    removeApiKey();
    setApiKey('');
    onSave('');
  }, [onSave]);

  const handleClearAllData = useCallback(() => {
    // Clear all localStorage data: sessions and API key
    storageService.clearSessions();
    removeApiKey();
    setApiKey('');
    setShowClearConfirm(false);
    onSave('');
  }, [onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && currentApiKey.trim()) {
      handleSave();
    }
    if (e.key === 'Escape' && !isFirstLaunch) {
      onClose();
    }
  }, [currentApiKey, handleSave, isFirstLaunch, onClose]);

  const hasLocalKey = currentApiKey.trim().length > 0;
  const isKeyConfigured = hasLocalKey || isEnvironmentApiKeyConfigured;
  const canClose = !isFirstLaunch || isKeyConfigured || !canManageApiKey;

  const handleProblemSetToggle = useCallback((setId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...effectiveProblemSetIds, setId]))
      : effectiveProblemSetIds.filter((id) => id !== setId);
    onProblemSetSelectionChange?.(next);
  }, [effectiveProblemSetIds, onProblemSetSelectionChange]);

  if (!isOpen) return null;

  return (
    <div 
      key={modalKey}
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
            {isFirstLaunch ? '🔑 API Key Required' : '⚙️ Settings'}
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

        {isFirstLaunch && canManageApiKey && (
          <div style={styles.infoBox}>
            <div style={styles.infoTitle}>
              <span>ℹ️</span>
              <span>Welcome to Coding Interview Simulator!</span>
            </div>
            <p style={styles.infoText}>
              This app uses AI to simulate coding interviews. To get started, 
              you'll need to provide your own LLM API key. Your key is stored 
              locally on this device only.
            </p>
          </div>
        )}

        {/* Privacy notice on first launch - Requirement 9.6 */}
        {isFirstLaunch && canManageApiKey && (
          <div style={styles.privacyNotice} data-testid="privacy-notice">
            <div style={styles.privacyNoticeTitle}>
              <span>🔒</span>
              <span>Privacy First</span>
            </div>
            <p style={styles.privacyNoticeText}>
              All data stored locally on this device only. Your session history, 
              code, and chat transcripts never leave your browser.
            </p>
          </div>
        )}

        {canManageApiKey ? (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>LLM API Key</h3>
            <p style={styles.description}>
              Manage the LLM key used for AI-powered interview simulation. For this beta,
              only admin users should change this setting.
            </p>

            <div style={styles.inputGroup}>
              <label style={styles.label} htmlFor="api-key-input">
                API Key
              </label>
              <input
                id="api-key-input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                placeholder="sk-..."
                style={{
                  ...styles.input,
                  ...(isInputFocused ? styles.inputFocused : {}),
                }}
                data-testid="api-key-input"
                autoComplete="off"
                spellCheck={false}
              />
              <div style={{ marginTop: '8px' }}>
                <label style={{ fontSize: '0.85rem', color: '#a6adc8', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showKey}
                    onChange={(e) => setShowKey(e.target.checked)}
                    style={{ marginRight: '8px' }}
                    data-testid="show-key-checkbox"
                  />
                  Show API key
                </label>
              </div>
              <div
                style={{
                  ...styles.keyStatus,
                  ...(isKeyConfigured ? styles.keyStatusConfigured : styles.keyStatusNotConfigured),
                }}
                data-testid="key-status"
              >
                <span
                  style={{
                    ...styles.statusDot,
                    ...(isKeyConfigured ? styles.statusDotConfigured : styles.statusDotNotConfigured),
                  }}
                />
                {hasLocalKey
                  ? 'API key configured'
                  : isEnvironmentApiKeyConfigured
                    ? 'API key configured (environment)'
                    : 'No API key configured'}
              </div>
              {isEnvironmentApiKeyConfigured && !hasLocalKey && (
                <p style={styles.envKeyHint} data-testid="environment-key-hint">
                  Using environment key source: {environmentApiKeySource ?? 'VITE_OPENAI_API_KEY'}.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div style={styles.infoBox} data-testid="llm-access-info">
            <div style={styles.infoTitle}>
              <span>🔐</span>
              <span>LLM Access</span>
            </div>
            <p style={styles.infoText}>
              API configuration is admin-managed for this invite-only beta.
              {isEnvironmentApiKeyConfigured
                ? ` Shared access is configured via ${environmentApiKeySource ?? 'environment variables'}.`
                : ' Shared access is not configured yet.'}
            </p>
          </div>
        )}

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

        {canManageApiKey && (
          <div style={styles.warningBox} data-testid="security-warning">
            <div style={styles.warningTitle}>
              <span style={styles.warningIcon}>⚠️</span>
              <span>Security Notice</span>
            </div>
            <ul style={styles.warningList}>
              <li>Your API key is visible in browser DevTools (Network tab)</li>
              <li>Use API keys with spending limits set in your provider dashboard</li>
              <li>On shared devices, other users could access stored keys</li>
              <li>Browser sync may copy localStorage to other devices</li>
              <li>This tool is designed for personal use on trusted devices</li>
            </ul>
          </div>
        )}

        <div style={styles.infoBox}>
          <div style={styles.infoTitle}>
            <span>💡</span>
            <span>Data Privacy</span>
          </div>
          <p style={styles.infoText}>
            All session data is stored locally on this device only. 
            No data is sent to any server except the LLM API for generating responses.
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
                Clear all stored data including session history, API key, and any 
                other locally stored information. This action cannot be undone.
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
          {canManageApiKey && initialApiKey && (
            <button
              style={styles.removeButton}
              onClick={handleRemoveKey}
              data-testid="remove-key-button"
            >
              Remove Key
            </button>
          )}
          {canClose && (
            <button
              style={styles.cancelButton}
              onClick={onClose}
              data-testid="settings-cancel-button"
            >
              Cancel
            </button>
          )}
          {canManageApiKey && (
            <button
              style={{
                ...styles.saveButton,
                ...(!hasLocalKey ? styles.saveButtonDisabled : {}),
              }}
              onClick={handleSave}
              disabled={!hasLocalKey}
              data-testid="settings-save-button"
            >
              {isFirstLaunch ? 'Get Started' : 'Save'}
            </button>
          )}
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
              This will permanently delete all your session history, API key, 
              and any other stored data. This action cannot be undone.
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
