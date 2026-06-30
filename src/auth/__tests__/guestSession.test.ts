import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canUseLocalGuestDemoFallback,
  clearGuestDemoSession,
  createLocalGuestDemoSession,
  getGuestDemoAuthSession,
  getGuestDemoCodeFromPath,
  readGuestDemoSession,
  saveGuestDemoSession,
} from '../guestSession';

describe('guestSession', () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('extracts the single demo code from /try/demo links', () => {
    expect(getGuestDemoCodeFromPath('/try/demo')).toBe('demo');
    expect(getGuestDemoCodeFromPath('/try/demo?utm=test')).toBe('demo');
    expect(getGuestDemoCodeFromPath('/')).toBeNull();
  });

  it('returns an authenticated guest session while the token is valid', () => {
    saveGuestDemoSession({
      token: 'guest-token',
      email: 'recruiter@example.com',
      code: 'demo',
      expiresAt: Date.now() + 60_000,
    });

    expect(readGuestDemoSession()?.email).toBe('recruiter@example.com');
    expect(getGuestDemoAuthSession()).toMatchObject({
      isAuthenticated: true,
      accessToken: 'guest-token',
      user: {
        id: 'demo:recruiter@example.com',
        email: 'recruiter@example.com',
        displayName: 'Guest Demo',
        roles: ['guest-demo'],
        authProvider: 'guest',
      },
    });
  });

  it('replaces an existing guest session with the latest demo session', () => {
    saveGuestDemoSession({
      token: 'first-token',
      email: 'first@example.com',
      code: 'demo',
      expiresAt: Date.now() + 60_000,
    });

    saveGuestDemoSession({
      token: 'second-token',
      email: 'second@example.com',
      code: 'demo',
      expiresAt: Date.now() + 120_000,
    });

    expect(readGuestDemoSession()).toMatchObject({
      token: 'second-token',
      email: 'second@example.com',
    });
    expect(getGuestDemoAuthSession()?.accessToken).toBe('second-token');
  });

  it('clears expired guest sessions', () => {
    vi.setSystemTime(new Date('2026-06-29T12:00:00Z'));
    saveGuestDemoSession({
      token: 'guest-token',
      email: 'recruiter@example.com',
      code: 'demo',
      expiresAt: Date.now() - 1,
    });

    expect(readGuestDemoSession()).toBeNull();
    expect(getGuestDemoAuthSession()).toBeNull();
  });

  it('can clear a guest session', () => {
    saveGuestDemoSession({
      token: 'guest-token',
      email: 'recruiter@example.com',
      code: 'demo',
      expiresAt: Date.now() + 60_000,
    });

    clearGuestDemoSession();

    expect(readGuestDemoSession()).toBeNull();
  });

  it('creates a local-only guest demo session for plain Vite development', () => {
    vi.setSystemTime(new Date('2026-06-29T12:00:00Z'));

    const session = createLocalGuestDemoSession({
      code: 'demo',
      email: 'Recruiter@Example.com',
    });

    expect(canUseLocalGuestDemoFallback('localhost')).toBe(true);
    expect(canUseLocalGuestDemoFallback('lern2cwd.netlify.app')).toBe(false);
    expect(session).toMatchObject({
      email: 'recruiter@example.com',
      code: 'demo',
      expiresAt: Date.now() + 7_200_000,
    });
    expect(session.token).toContain('local-dev-guest.demo.recruiter%40example.com');
  });
});
