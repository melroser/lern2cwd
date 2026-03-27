import type { AuthProviderName } from './types';

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  return value === 'true';
}

function parseProvider(value: string | undefined): AuthProviderName {
  switch (value) {
    case 'clerk':
    case 'auth0':
    case 'netlify':
      return value;
    default:
      return 'netlify';
  }
}

export const authConfig = {
  provider: parseProvider(import.meta.env.VITE_AUTH_PROVIDER),
  loginRedirectPath: import.meta.env.VITE_AUTH_LOGIN_REDIRECT_PATH ?? '/',
  logoutRedirectPath: import.meta.env.VITE_AUTH_LOGOUT_REDIRECT_PATH ?? '/',
  debugEnabled: import.meta.env.DEV && parseBoolean(import.meta.env.VITE_AUTH_DEBUG, false),
  netlify: {
    apiURL: import.meta.env.VITE_NETLIFY_IDENTITY_API_URL || undefined,
    locale: import.meta.env.VITE_NETLIFY_IDENTITY_LOCALE || 'en',
    namePlaceholder: import.meta.env.VITE_NETLIFY_IDENTITY_NAME_PLACEHOLDER || undefined,
    inviteOnly: !parseBoolean(import.meta.env.VITE_NETLIFY_PUBLIC_SIGNUP, false),
  },
  clerk: {
    publishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '',
  },
  auth0: {
    domain: import.meta.env.VITE_AUTH0_DOMAIN || '',
    clientId: import.meta.env.VITE_AUTH0_CLIENT_ID || '',
    audience: import.meta.env.VITE_AUTH0_AUDIENCE || '',
  },
} as const;
