import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetlifyIdentityWidget } from 'netlify-identity-widget';

const widgetMock = {
  init: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  currentUser: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  setLocale: vi.fn(),
} satisfies NetlifyIdentityWidget;

vi.mock('netlify-identity-widget', () => ({
  default: widgetMock,
}));

describe('netlifyIdentityAdapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    widgetMock.currentUser.mockReturnValue(null);
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('normalizes a Netlify user into the app user shape', async () => {
    const { normalizeNetlifyIdentityUser } = await import('../adapters/netlifyIdentityAdapter');

    const normalized = normalizeNetlifyIdentityUser({
      id: 'abc123',
      email: 'engineer@example.com',
      user_metadata: { full_name: 'Casey Engineer' },
      app_metadata: { roles: ['admin'], authorization: { roles: ['editor'] } },
    });

    expect(normalized).toEqual({
      id: 'abc123',
      email: 'engineer@example.com',
      displayName: 'Casey Engineer',
      roles: ['admin', 'editor'],
      authProvider: 'netlify',
    });
  });

  it('initializes the widget and returns an authenticated session', async () => {
    const { createNetlifyIdentityAdapter } = await import('../adapters/netlifyIdentityAdapter');

    widgetMock.currentUser.mockReturnValue({
      id: 'user-1',
      email: 'invitee@example.com',
      jwt: vi.fn().mockResolvedValue('token-123'),
    });

    const adapter = createNetlifyIdentityAdapter();

    await adapter.init();
    const session = await adapter.getSession();
    const accessToken = await adapter.getAccessToken?.();

    expect(widgetMock.init).toHaveBeenCalledTimes(1);
    expect(session.isAuthenticated).toBe(true);
    expect(session.user?.email).toBe('invitee@example.com');
    expect(accessToken).toBe('token-123');
  });

  it('seeds the Netlify site URL on localhost without forcing an APIUrl override', async () => {
    vi.stubEnv('VITE_NETLIFY_SITE_URL', 'https://lern2cwd.netlify.app');
    const { createNetlifyIdentityAdapter } = await import('../adapters/netlifyIdentityAdapter');

    const adapter = createNetlifyIdentityAdapter();
    await adapter.init();

    expect(window.localStorage.getItem('netlifySiteURL')).toBe('https://lern2cwd.netlify.app');

    const initOptions = widgetMock.init.mock.calls[0]?.[0];
    expect(initOptions).not.toHaveProperty('APIUrl');
  });

  it('accepts the legacy identity URL env var and converts it to a site URL', async () => {
    vi.stubEnv('VITE_NETLIFY_IDENTITY_API_URL', 'https://lern2cwd.netlify.app/.netlify/identity');
    const { createNetlifyIdentityAdapter } = await import('../adapters/netlifyIdentityAdapter');

    const adapter = createNetlifyIdentityAdapter();
    await adapter.init();

    expect(window.localStorage.getItem('netlifySiteURL')).toBe('https://lern2cwd.netlify.app');
  });
});
