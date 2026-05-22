import { beforeEach, describe, expect, it, vi } from 'vitest';

const identityMock = vi.hoisted(() => ({
  acceptInvite: vi.fn(),
  getSettings: vi.fn(),
  getUser: vi.fn(),
  handleAuthCallback: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  oauthLogin: vi.fn(),
  onAuthChange: vi.fn(),
  refreshSession: vi.fn(),
  requestPasswordRecovery: vi.fn(),
  signup: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('@netlify/identity', () => ({
  AUTH_EVENTS: {
    LOGIN: 'login',
    LOGOUT: 'logout',
    TOKEN_REFRESH: 'token_refresh',
    USER_UPDATED: 'user_updated',
    RECOVERY: 'recovery',
  },
  acceptInvite: identityMock.acceptInvite,
  getSettings: identityMock.getSettings,
  getUser: identityMock.getUser,
  handleAuthCallback: identityMock.handleAuthCallback,
  login: identityMock.login,
  logout: identityMock.logout,
  oauthLogin: identityMock.oauthLogin,
  onAuthChange: identityMock.onAuthChange,
  refreshSession: identityMock.refreshSession,
  requestPasswordRecovery: identityMock.requestPasswordRecovery,
  signup: identityMock.signup,
  updateUser: identityMock.updateUser,
}));

const defaultSettings = {
  autoconfirm: false,
  disableSignup: true,
  providers: {
    bitbucket: false,
    email: true,
    facebook: false,
    github: false,
    gitlab: false,
    google: false,
  },
};

describe('netlifyIdentityAdapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    identityMock.getSettings.mockResolvedValue(defaultSettings);
    identityMock.getUser.mockResolvedValue(null);
    identityMock.handleAuthCallback.mockResolvedValue(null);
    identityMock.login.mockResolvedValue({
      id: 'user-1',
      email: 'invitee@example.com',
      confirmedAt: '2026-01-01T00:00:00.000Z',
    });
    identityMock.logout.mockResolvedValue(undefined);
    identityMock.oauthLogin.mockImplementation(() => undefined);
    identityMock.refreshSession.mockResolvedValue(null);
    identityMock.requestPasswordRecovery.mockResolvedValue(undefined);
    identityMock.acceptInvite.mockResolvedValue({
      id: 'user-1',
      email: 'invitee@example.com',
      confirmedAt: '2026-01-01T00:00:00.000Z',
    });
    identityMock.updateUser.mockResolvedValue({
      id: 'user-1',
      email: 'invitee@example.com',
      confirmedAt: '2026-01-01T00:00:00.000Z',
    });
    identityMock.signup.mockResolvedValue({
      id: 'new-user',
      email: 'new@example.com',
    });
    identityMock.onAuthChange.mockReturnValue(() => {});
    document.cookie = 'nf_jwt=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.history.replaceState({}, '', '/');
  });

  it('normalizes a Netlify user into the app user shape', async () => {
    const { normalizeNetlifyIdentityUser } = await import('../adapters/netlifyIdentityAdapter');

    const normalized = normalizeNetlifyIdentityUser({
      id: 'abc123',
      email: 'engineer@example.com',
      name: 'Casey Engineer',
      roles: ['admin', 'editor'],
      role: 'reviewer',
    });

    expect(normalized).toEqual({
      id: 'abc123',
      email: 'engineer@example.com',
      displayName: 'Casey Engineer',
      roles: ['admin', 'editor', 'reviewer'],
      authProvider: 'netlify',
    });
  });

  it('returns an authenticated session and reads the browser JWT cookie', async () => {
    const { createNetlifyIdentityAdapter } = await import('../adapters/netlifyIdentityAdapter');

    identityMock.getUser.mockResolvedValue({
      id: 'user-1',
      email: 'invitee@example.com',
      name: 'Invited Engineer',
      roles: ['member'],
    });
    document.cookie = 'nf_jwt=token-123; path=/';

    const adapter = createNetlifyIdentityAdapter();
    await adapter.init();
    const session = await adapter.getSession();
    const accessToken = await adapter.getAccessToken?.();

    expect(session.isAuthenticated).toBe(true);
    expect(session.user?.email).toBe('invitee@example.com');
    expect(session.user?.displayName).toBe('Invited Engineer');
    expect(accessToken).toBe('token-123');
  });

  it('captures invite callbacks so the UI can finish account setup', async () => {
    const { createNetlifyIdentityAdapter } = await import('../adapters/netlifyIdentityAdapter');

    identityMock.handleAuthCallback.mockResolvedValue({
      type: 'invite',
      user: null,
      token: 'invite-token-123',
    });

    const adapter = createNetlifyIdentityAdapter();
    await adapter.init();

    expect(adapter.getCallbackState?.()).toEqual({
      type: 'invite',
      token: 'invite-token-123',
    });
  });

  it('calls email login through @netlify/identity', async () => {
    const { createNetlifyIdentityAdapter } = await import('../adapters/netlifyIdentityAdapter');

    const adapter = createNetlifyIdentityAdapter();
    await adapter.login({ email: 'invitee@example.com', password: 'secret-123' });

    expect(identityMock.login).toHaveBeenCalledWith('invitee@example.com', 'secret-123');
  });

  it('blocks public signup by default for invite-only mode', async () => {
    const { createNetlifyIdentityAdapter } = await import('../adapters/netlifyIdentityAdapter');

    const adapter = createNetlifyIdentityAdapter();
    await adapter.init();

    await expect(adapter.signup?.({
      email: 'new@example.com',
      password: 'secret-123',
    })).rejects.toThrow(/public sign-up is disabled/i);
    expect(identityMock.signup).not.toHaveBeenCalled();
  });

  it('allows signup when public signup is enabled and reports confirmation-required users', async () => {
    vi.stubEnv('VITE_NETLIFY_PUBLIC_SIGNUP', 'true');
    const { createNetlifyIdentityAdapter } = await import('../adapters/netlifyIdentityAdapter');

    identityMock.getSettings.mockResolvedValue({
      ...defaultSettings,
      disableSignup: false,
    });

    const adapter = createNetlifyIdentityAdapter();
    await adapter.init();
    const result = await adapter.signup?.({
      email: 'new@example.com',
      password: 'secret-123',
      displayName: 'New Engineer',
    });

    expect(identityMock.signup).toHaveBeenCalledWith(
      'new@example.com',
      'secret-123',
      { full_name: 'New Engineer' },
    );
    expect(result).toEqual({
      status: 'confirmation_required',
      user: null,
    });
  });

  it('requests password recovery for admin-created users', async () => {
    const { createNetlifyIdentityAdapter } = await import('../adapters/netlifyIdentityAdapter');

    const adapter = createNetlifyIdentityAdapter();
    await adapter.requestPasswordRecovery?.('invitee@example.com');

    expect(identityMock.requestPasswordRecovery).toHaveBeenCalledWith('invitee@example.com');
  });

  it('sets username metadata when accepting an invite', async () => {
    const { createNetlifyIdentityAdapter } = await import('../adapters/netlifyIdentityAdapter');

    const adapter = createNetlifyIdentityAdapter();
    await adapter.acceptInvite?.({
      token: 'invite-token-123',
      password: 'secret-123',
      displayName: 'demo-user',
    });

    expect(identityMock.acceptInvite).toHaveBeenCalledWith('invite-token-123', 'secret-123');
    expect(identityMock.updateUser).toHaveBeenCalledWith({ data: { full_name: 'demo-user' } });
  });

  it('exposes enabled OAuth providers and starts Google login', async () => {
    const { createNetlifyIdentityAdapter } = await import('../adapters/netlifyIdentityAdapter');

    identityMock.getSettings.mockResolvedValue({
      ...defaultSettings,
      providers: {
        ...defaultSettings.providers,
        google: true,
      },
    });

    const adapter = createNetlifyIdentityAdapter();
    await adapter.init();

    expect(adapter.getOAuthProviders?.()).toEqual(['google']);

    await adapter.oauthLogin?.('google');

    expect(identityMock.oauthLogin).toHaveBeenCalledWith('google');
  });
});
