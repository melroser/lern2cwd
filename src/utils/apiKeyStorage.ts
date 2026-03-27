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
const BUILD_ENV_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const BUILD_ENV_API_KEY_SOURCE = import.meta.env.VITE_OPENAI_API_KEY_SOURCE;

type ApiKeyLocation = 'local_storage' | 'environment' | null;

interface EnvironmentApiKey {
  key: string;
  source: string;
}

interface RuntimeConfigShape {
  OPENAI_API_KEY?: unknown;
  VITE_OPENAI_API_KEY?: unknown;
}

function normalizeApiKey(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickFirstConfiguredEnvironmentApiKey(
  candidates: Array<{ source: string; value: unknown }>
): EnvironmentApiKey | null {
  for (const candidate of candidates) {
    const normalized = normalizeApiKey(candidate.value);
    if (normalized) {
      return {
        key: normalized,
        source: candidate.source,
      };
    }
  }
  return null;
}

function getRuntimeInjectedEnvironmentApiKey(): EnvironmentApiKey | null {
  const globalRef = globalThis as typeof globalThis & {
    __APP_CONFIG__?: RuntimeConfigShape;
    __NETLIFY_ENV__?: RuntimeConfigShape;
  };

  return pickFirstConfiguredEnvironmentApiKey([
    { source: 'window.__APP_CONFIG__.OPENAI_API_KEY', value: globalRef.__APP_CONFIG__?.OPENAI_API_KEY },
    { source: 'window.__APP_CONFIG__.VITE_OPENAI_API_KEY', value: globalRef.__APP_CONFIG__?.VITE_OPENAI_API_KEY },
    { source: 'window.__NETLIFY_ENV__.OPENAI_API_KEY', value: globalRef.__NETLIFY_ENV__?.OPENAI_API_KEY },
    { source: 'window.__NETLIFY_ENV__.VITE_OPENAI_API_KEY', value: globalRef.__NETLIFY_ENV__?.VITE_OPENAI_API_KEY },
  ]);
}

function getBuildEnvironmentApiKey(): EnvironmentApiKey | null {
  const normalized = normalizeApiKey(BUILD_ENV_API_KEY);
  if (!normalized) {
    return null;
  }
  return {
    key: normalized,
    source: normalizeApiKey(BUILD_ENV_API_KEY_SOURCE) ?? 'VITE_OPENAI_API_KEY',
  };
}

function getEnvironmentApiKeyRecord(): EnvironmentApiKey | null {
  return getRuntimeInjectedEnvironmentApiKey() ?? getBuildEnvironmentApiKey();
}

/**
 * Get the stored API key from localStorage
 */
export function getStoredApiKey(): string | null {
  try {
    const key = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (!key || key.trim().length === 0) {
      return null;
    }
    return key.trim();
  } catch {
    return null;
  }
}

/**
 * Get API key from build-time environment (e.g. Netlify VITE_OPENAI_API_KEY)
 */
export function getEnvironmentApiKey(): string | null {
  return getEnvironmentApiKeyRecord()?.key ?? null;
}

/**
 * Get environment API key source (if configured)
 */
export function getEnvironmentApiKeySource(): string | null {
  return getEnvironmentApiKeyRecord()?.source ?? null;
}

/**
 * Check if environment API key is configured
 */
export function isEnvironmentApiKeyConfigured(): boolean {
  return getEnvironmentApiKey() !== null;
}

/**
 * Get effective API key.
 * Priority: localStorage user key, then environment key.
 */
export function getConfiguredApiKey(): string | null {
  return getStoredApiKey() ?? getEnvironmentApiKey();
}

/**
 * Return where the effective API key is coming from
 */
export function getConfiguredApiKeySource(): ApiKeyLocation {
  if (getStoredApiKey()) {
    return 'local_storage';
  }
  if (getEnvironmentApiKey()) {
    return 'environment';
  }
  return null;
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
  return getConfiguredApiKey() !== null;
}
