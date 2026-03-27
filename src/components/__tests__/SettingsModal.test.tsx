import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from '../SettingsModal';
import { 
  getStoredApiKey, 
  getEnvironmentApiKey,
  getEnvironmentApiKeySource,
  getConfiguredApiKey,
  isEnvironmentApiKeyConfigured,
  saveApiKey, 
  removeApiKey, 
  hasApiKey,
  API_KEY_STORAGE_KEY 
} from '../../utils/apiKeyStorage';
import { storageService } from '../../services/storageService';

describe('SettingsModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Rendering', () => {
    it('should not render when isOpen is false', () => {
      render(
        <SettingsModal
          isOpen={false}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
    });

    it('should display "Settings" title when not first launch', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      expect(screen.getByText('⚙️ Settings')).toBeInTheDocument();
    });

    it('should display "API Key Required" title on first launch', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={true}
        />
      );

      expect(screen.getByText('🔑 API Key Required')).toBeInTheDocument();
    });

    it('should show welcome message on first launch', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={true}
        />
      );

      expect(screen.getByText('Welcome to Coding Interview Simulator!')).toBeInTheDocument();
    });

    it('should display security warning', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByTestId('security-warning')).toBeInTheDocument();
      expect(screen.getByText('Security Notice')).toBeInTheDocument();
    });

    it('should display all security warnings from design doc', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByText(/API key is visible in browser DevTools/)).toBeInTheDocument();
      expect(screen.getByText(/Use API keys with spending limits/)).toBeInTheDocument();
      expect(screen.getByText(/shared devices, other users could access/)).toBeInTheDocument();
      expect(screen.getByText(/Browser sync may copy localStorage/)).toBeInTheDocument();
    });

    it('should display data privacy notice', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByText('Data Privacy')).toBeInTheDocument();
      expect(screen.getByText(/stored locally on this device only/)).toBeInTheDocument();
    });
  });

  describe('API Key Input', () => {
    it('should render API key input field', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByTestId('api-key-input')).toBeInTheDocument();
    });

    it('should show initial API key value', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          initialApiKey="sk-test-key-123"
        />
      );

      const input = screen.getByTestId('api-key-input') as HTMLInputElement;
      expect(input.value).toBe('sk-test-key-123');
    });

    it('should update API key value on input', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      const input = screen.getByTestId('api-key-input');
      await user.type(input, 'sk-new-key');

      expect((input as HTMLInputElement).value).toBe('sk-new-key');
    });

    it('should mask API key by default (password type)', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          initialApiKey="sk-secret"
        />
      );

      const input = screen.getByTestId('api-key-input');
      expect(input).toHaveAttribute('type', 'password');
    });

    it('should show API key when checkbox is checked', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          initialApiKey="sk-secret"
        />
      );

      const checkbox = screen.getByTestId('show-key-checkbox');
      await user.click(checkbox);

      const input = screen.getByTestId('api-key-input');
      expect(input).toHaveAttribute('type', 'text');
    });
  });

  describe('Key Status Indicator', () => {
    it('should show "No API key configured" when empty', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByText('No API key configured')).toBeInTheDocument();
    });

    it('should show "API key configured" when key is entered', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      const input = screen.getByTestId('api-key-input');
      await user.type(input, 'sk-test');

      expect(screen.getByText('API key configured')).toBeInTheDocument();
    });
  });

  describe('Save Functionality', () => {
    it('should disable save button when no API key', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      const saveButton = screen.getByTestId('settings-save-button');
      expect(saveButton).toBeDisabled();
    });

    it('should enable save button when API key is entered', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      const input = screen.getByTestId('api-key-input');
      await user.type(input, 'sk-test-key');

      const saveButton = screen.getByTestId('settings-save-button');
      expect(saveButton).not.toBeDisabled();
    });

    it('should call onSave and onClose when save is clicked', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      const input = screen.getByTestId('api-key-input');
      await user.type(input, 'sk-test-key');

      const saveButton = screen.getByTestId('settings-save-button');
      await user.click(saveButton);

      expect(mockOnSave).toHaveBeenCalledWith('sk-test-key');
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should save API key to localStorage', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      const input = screen.getByTestId('api-key-input');
      await user.type(input, 'sk-stored-key');

      const saveButton = screen.getByTestId('settings-save-button');
      await user.click(saveButton);

      expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBe('sk-stored-key');
    });

    it('should trim whitespace from API key', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      const input = screen.getByTestId('api-key-input');
      await user.type(input, '  sk-test-key  ');

      const saveButton = screen.getByTestId('settings-save-button');
      await user.click(saveButton);

      expect(mockOnSave).toHaveBeenCalledWith('sk-test-key');
    });

    it('should show "Get Started" button on first launch', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={true}
        />
      );

      expect(screen.getByText('Get Started')).toBeInTheDocument();
    });

    it('should show "Save" button when not first launch', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  describe('Close Functionality', () => {
    it('should show close button when not first launch', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      expect(screen.getByTestId('settings-close-button')).toBeInTheDocument();
    });

    it('should not show close button on first launch without key', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={true}
        />
      );

      expect(screen.queryByTestId('settings-close-button')).not.toBeInTheDocument();
    });

    it('should show close button on first launch when key is entered', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={true}
        />
      );

      const input = screen.getByTestId('api-key-input');
      await user.type(input, 'sk-test');

      expect(screen.getByTestId('settings-close-button')).toBeInTheDocument();
    });

    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      const closeButton = screen.getByTestId('settings-close-button');
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      const cancelButton = screen.getByTestId('settings-cancel-button');
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when clicking overlay (not first launch)', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      const overlay = screen.getByTestId('settings-modal-overlay');
      await user.click(overlay);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not close when clicking overlay on first launch without key', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={true}
        />
      );

      const overlay = screen.getByTestId('settings-modal-overlay');
      await user.click(overlay);

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should not close when clicking modal content', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      const modal = screen.getByTestId('settings-modal');
      await user.click(modal);

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Remove Key Functionality', () => {
    it('should show remove button when initial key exists', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          initialApiKey="sk-existing-key"
        />
      );

      expect(screen.getByTestId('remove-key-button')).toBeInTheDocument();
    });

    it('should not show remove button when no initial key', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      expect(screen.queryByTestId('remove-key-button')).not.toBeInTheDocument();
    });

    it('should clear API key when remove is clicked', async () => {
      const user = userEvent.setup();
      localStorage.setItem(API_KEY_STORAGE_KEY, 'sk-to-remove');

      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          initialApiKey="sk-to-remove"
        />
      );

      const removeButton = screen.getByTestId('remove-key-button');
      await user.click(removeButton);

      expect(mockOnSave).toHaveBeenCalledWith('');
      expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBeNull();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should save on Enter key when key is configured', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      const input = screen.getByTestId('api-key-input');
      await user.type(input, 'sk-test-key');
      await user.keyboard('{Enter}');

      expect(mockOnSave).toHaveBeenCalledWith('sk-test-key');
    });

    it('should close on Escape key when not first launch', async () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      const modal = screen.getByTestId('settings-modal');
      fireEvent.keyDown(modal, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not close on Escape key on first launch', async () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={true}
        />
      );

      const modal = screen.getByTestId('settings-modal');
      fireEvent.keyDown(modal, { key: 'Escape' });

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Privacy Notice (Requirement 9.6)', () => {
    it('should display privacy notice on first launch', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={true}
        />
      );

      expect(screen.getByTestId('privacy-notice')).toBeInTheDocument();
      expect(screen.getByText('Privacy First')).toBeInTheDocument();
      expect(screen.getByText(/All data stored locally on this device only/)).toBeInTheDocument();
    });

    it('should not display privacy notice when not first launch', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      expect(screen.queryByTestId('privacy-notice')).not.toBeInTheDocument();
    });
  });

  describe('Clear All Data (Requirement 9.5)', () => {
    it('should display data management section when not first launch', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      expect(screen.getByTestId('data-management-section')).toBeInTheDocument();
      expect(screen.getByText('Data Management')).toBeInTheDocument();
    });

    it('should not display data management section on first launch', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={true}
        />
      );

      expect(screen.queryByTestId('data-management-section')).not.toBeInTheDocument();
    });

    it('should display Clear All Data button', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      expect(screen.getByTestId('clear-all-data-button')).toBeInTheDocument();
      expect(screen.getByText('Clear All Data')).toBeInTheDocument();
    });

    it('should show confirmation dialog when Clear All Data is clicked', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      const clearButton = screen.getByTestId('clear-all-data-button');
      await user.click(clearButton);

      expect(screen.getByTestId('clear-confirm-dialog')).toBeInTheDocument();
      expect(screen.getByText('⚠️ Clear All Data?')).toBeInTheDocument();
    });

    it('should close confirmation dialog when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      // Open confirmation dialog
      await user.click(screen.getByTestId('clear-all-data-button'));
      expect(screen.getByTestId('clear-confirm-dialog')).toBeInTheDocument();

      // Click cancel
      await user.click(screen.getByTestId('clear-confirm-cancel'));
      expect(screen.queryByTestId('clear-confirm-dialog')).not.toBeInTheDocument();
    });

    it('should close confirmation dialog when clicking overlay', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      // Open confirmation dialog
      await user.click(screen.getByTestId('clear-all-data-button'));
      expect(screen.getByTestId('clear-confirm-dialog')).toBeInTheDocument();

      // Click overlay
      await user.click(screen.getByTestId('clear-confirm-dialog'));
      expect(screen.queryByTestId('clear-confirm-dialog')).not.toBeInTheDocument();
    });

    it('should clear all data when Delete Everything is clicked', async () => {
      const user = userEvent.setup();
      
      // Set up some data in localStorage
      localStorage.setItem(API_KEY_STORAGE_KEY, 'sk-test-key');
      localStorage.setItem('coding-interview-sessions', JSON.stringify([{ id: 'test-session' }]));

      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          initialApiKey="sk-test-key"
          isFirstLaunch={false}
        />
      );

      // Open confirmation dialog
      await user.click(screen.getByTestId('clear-all-data-button'));
      
      // Click Delete Everything
      await user.click(screen.getByTestId('clear-confirm-delete'));

      // Verify data was cleared
      expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBeNull();
      expect(mockOnSave).toHaveBeenCalledWith('');
    });

    it('should clear sessions when Delete Everything is clicked', async () => {
      const user = userEvent.setup();
      const clearSessionsSpy = vi.spyOn(storageService, 'clearSessions');

      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      // Open confirmation dialog and confirm
      await user.click(screen.getByTestId('clear-all-data-button'));
      await user.click(screen.getByTestId('clear-confirm-delete'));

      expect(clearSessionsSpy).toHaveBeenCalled();
      clearSessionsSpy.mockRestore();
    });

    it('should close confirmation dialog after clearing data', async () => {
      const user = userEvent.setup();
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      // Open confirmation dialog and confirm
      await user.click(screen.getByTestId('clear-all-data-button'));
      await user.click(screen.getByTestId('clear-confirm-delete'));

      expect(screen.queryByTestId('clear-confirm-dialog')).not.toBeInTheDocument();
    });

    it('should display warning about irreversible action', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isFirstLaunch={false}
        />
      );

      expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
    });
  });

  describe('Security Warnings for Shared Devices', () => {
    it('should display warning about shared device access', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByText(/On shared devices, other users could access stored keys/)).toBeInTheDocument();
    });

    it('should display warning about personal use on trusted devices', () => {
      render(
        <SettingsModal
          isOpen={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByText(/This tool is designed for personal use on trusted devices/)).toBeInTheDocument();
    });
  });
});

describe('API Key Storage Utilities', () => {
  const globalRef = globalThis as typeof globalThis & {
    __APP_CONFIG__?: Record<string, unknown>;
    __NETLIFY_ENV__?: Record<string, unknown>;
  };

  beforeEach(() => {
    localStorage.clear();
    delete globalRef.__APP_CONFIG__;
    delete globalRef.__NETLIFY_ENV__;
  });

  afterEach(() => {
    localStorage.clear();
    delete globalRef.__APP_CONFIG__;
    delete globalRef.__NETLIFY_ENV__;
  });

  describe('getStoredApiKey', () => {
    it('should return null when no key stored', () => {
      expect(getStoredApiKey()).toBeNull();
    });

    it('should return stored key', () => {
      localStorage.setItem(API_KEY_STORAGE_KEY, 'sk-test');
      expect(getStoredApiKey()).toBe('sk-test');
    });
  });

  describe('saveApiKey', () => {
    it('should save key to localStorage', () => {
      saveApiKey('sk-new-key');
      expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBe('sk-new-key');
    });

    it('should overwrite existing key', () => {
      localStorage.setItem(API_KEY_STORAGE_KEY, 'sk-old');
      saveApiKey('sk-new');
      expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBe('sk-new');
    });
  });

  describe('removeApiKey', () => {
    it('should remove key from localStorage', () => {
      localStorage.setItem(API_KEY_STORAGE_KEY, 'sk-to-remove');
      removeApiKey();
      expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBeNull();
    });

    it('should not throw when no key exists', () => {
      expect(() => removeApiKey()).not.toThrow();
    });
  });

  describe('hasApiKey', () => {
    it('should return false when no key stored', () => {
      expect(hasApiKey()).toBe(false);
    });

    it('should return false when key is empty string', () => {
      localStorage.setItem(API_KEY_STORAGE_KEY, '');
      expect(hasApiKey()).toBe(false);
    });

    it('should return false when key is whitespace only', () => {
      localStorage.setItem(API_KEY_STORAGE_KEY, '   ');
      expect(hasApiKey()).toBe(false);
    });

    it('should return true when key exists', () => {
      localStorage.setItem(API_KEY_STORAGE_KEY, 'sk-valid');
      expect(hasApiKey()).toBe(true);
    });
  });

  describe('environment key support', () => {
    it('should read runtime environment key from __APP_CONFIG__', () => {
      globalRef.__APP_CONFIG__ = {
        OPENAI_API_KEY: 'sk-env-runtime',
      };

      expect(getEnvironmentApiKey()).toBe('sk-env-runtime');
      expect(getEnvironmentApiKeySource()).toBe('window.__APP_CONFIG__.OPENAI_API_KEY');
      expect(isEnvironmentApiKeyConfigured()).toBe(true);
    });

    it('should use local key before environment key for effective key', () => {
      globalRef.__APP_CONFIG__ = {
        OPENAI_API_KEY: 'sk-env-runtime',
      };
      saveApiKey('sk-local');

      expect(getConfiguredApiKey()).toBe('sk-local');
    });
  });
});
