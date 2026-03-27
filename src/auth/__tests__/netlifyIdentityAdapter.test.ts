import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetlifyIdentityWidget } from 'netlify-identity-widget';
import { createNetlifyIdentityAdapter, normalizeNetlifyIdentityUser } from '../adapters/netlifyIdentityAdapter';

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
    vi.clearAllMocks();
    widgetMock.currentUser.mockReturnValue(null);
  });

  it('normalizes a Netlify user into the app user shape', () => {
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
});
