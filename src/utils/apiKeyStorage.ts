/**
 * API Key Resolution Utilities
 *
 * The app now uses environment-provided keys only.
 * No API key is persisted in browser storage.
 */

export const API_KEY_STORAGE_KEY = 'coding-interview-simulator-api-key';
const BUILD_ENV_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const BUILD_ENV_API_KEY_SOURCE = import.meta.env.VITE_OPENAI_API_KEY_SOURCE;

type ApiKeyLocation = 'environment' | null;

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
  candidates: Array<{ source: string; value: unknown }>,
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

export function setApiKeyStorageScope(_scope: string | null): void {
  // Environment-only mode: no browser-scoped API key storage.
}

export function getStoredApiKey(): string | null {
  return null;
}

export function getEnvironmentApiKey(): string | null {
  return getEnvironmentApiKeyRecord()?.key ?? null;
}

export function getEnvironmentApiKeySource(): string | null {
  return getEnvironmentApiKeyRecord()?.source ?? null;
}

export function isEnvironmentApiKeyConfigured(): boolean {
  return getEnvironmentApiKey() !== null;
}

export function getConfiguredApiKey(): string | null {
  return getEnvironmentApiKey();
}

export function getConfiguredApiKeySource(): ApiKeyLocation {
  if (getEnvironmentApiKey()) {
    return 'environment';
  }

  return null;
}

export function saveApiKey(_apiKey: string): void {
  throw new Error('API keys are environment-managed in this build.');
}

export function removeApiKey(): void {
  // Environment-only mode: no browser-stored API key to remove.
}

export function hasApiKey(): boolean {
  return getConfiguredApiKey() !== null;
}
