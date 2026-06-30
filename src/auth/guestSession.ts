import type { AppUser, AuthSession } from './types';

const GUEST_SESSION_STORAGE_KEY = 'lern2cwd-guest-demo-session';
const LOCAL_GUEST_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export type GuestDemoSession = {
  token: string;
  email: string;
  code: string;
  expiresAt: number;
};

type LocalGuestDemoSessionInput = {
  email: string;
  code: string;
  now?: number;
};

function isGuestDemoSession(value: unknown): value is GuestDemoSession {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.token === 'string' &&
    record.token.length > 0 &&
    typeof record.email === 'string' &&
    record.email.length > 0 &&
    typeof record.code === 'string' &&
    record.code.length > 0 &&
    typeof record.expiresAt === 'number' &&
    Number.isFinite(record.expiresAt)
  );
}

export function readGuestDemoSession(): GuestDemoSession | null {
  try {
    const rawSession = localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
    if (!rawSession) return null;

    const parsed = JSON.parse(rawSession) as unknown;
    if (!isGuestDemoSession(parsed)) {
      localStorage.removeItem(GUEST_SESSION_STORAGE_KEY);
      return null;
    }

    if (parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(GUEST_SESSION_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    localStorage.removeItem(GUEST_SESSION_STORAGE_KEY);
    return null;
  }
}

export function saveGuestDemoSession(session: GuestDemoSession): void {
  localStorage.setItem(GUEST_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function canUseLocalGuestDemoFallback(hostname = window.location.hostname): boolean {
  return import.meta.env.DEV && ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

export function createLocalGuestDemoSession({
  email,
  code,
  now = Date.now(),
}: LocalGuestDemoSessionInput): GuestDemoSession {
  const normalizedEmail = email.trim().toLowerCase();
  const expiresAt = now + LOCAL_GUEST_SESSION_TTL_MS;
  const nonce = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${now}`;

  return {
    token: `local-dev-guest.${encodeURIComponent(code)}.${encodeURIComponent(normalizedEmail)}.${expiresAt}.${nonce}`,
    email: normalizedEmail,
    code,
    expiresAt,
  };
}

export function clearGuestDemoSession(): void {
  localStorage.removeItem(GUEST_SESSION_STORAGE_KEY);
}

export function getGuestDemoCodeFromPath(pathname = window.location.pathname): string | null {
  const match = pathname.match(/^\/try\/([^/?#]+)/);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]).trim();
}

export function getGuestDemoAuthSession(): AuthSession | null {
  const guestSession = readGuestDemoSession();
  if (!guestSession) return null;
  const guestEmail = guestSession.email.trim().toLowerCase();

  const user: AppUser = {
    id: `demo:${guestEmail}`,
    email: guestEmail,
    displayName: 'Guest Demo',
    roles: ['guest-demo'],
    authProvider: 'guest',
  };

  return {
    user,
    isLoaded: true,
    isAuthenticated: true,
    accessToken: guestSession.token,
  };
}
