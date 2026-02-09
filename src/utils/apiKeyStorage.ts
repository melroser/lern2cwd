/**
 * API Key Storage Utilities
 * 
 * Handles localStorage operations for the BYOK (Bring Your Own Key) API key.
 * 
 * Security Model (from design.md):
 * - Key is stored in localStorage (plaintext for MVP)
 * - Key is sent directly from browser to LLM API (no backend proxy)
 * - User is responsible for their own API usage and billing
 */

// localStorage key for API key storage
export const API_KEY_STORAGE_KEY = 'coding-interview-simulator-api-key';

/**
 * Get the stored API key from localStorage
 */
export function getStoredApiKey(): string | null {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Save API key to localStorage
 */
export function saveApiKey(apiKey: string): void {
  try {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  } catch (error) {
    console.error('Failed to save API key to localStorage:', error);
    throw new Error('Failed to save API key. localStorage may be full or disabled.');
  }
}

/**
 * Remove API key from localStorage
 */
export function removeApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // Ignore removal errors
  }
}

/**
 * Check if an API key is configured
 */
export function hasApiKey(): boolean {
  const key = getStoredApiKey();
  return key !== null && key.trim().length > 0;
}
