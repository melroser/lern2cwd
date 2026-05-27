import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import App from '../App';

const mockAuthState = {
  isLoaded: true,
  isAuthenticated: true,
  user: {
    id: 'user-1',
    email: 'tester@example.com',
    displayName: 'Test User',
    roles: [],
    authProvider: 'netlify' as const,
  },
  profileKey: 'netlify:user-1',
  provider: 'netlify' as const,
  error: null,
  callbackState: null,
  signupEnabled: false,
  oauthProviders: [],
  login: vi.fn(),
  logout: vi.fn(),
  signup: vi.fn(),
  requestPasswordRecovery: vi.fn(),
  acceptInvite: vi.fn(),
  updatePassword: vi.fn(),
  oauthLogin: vi.fn(),
  clearCallbackState: vi.fn(),
  refreshSession: vi.fn(),
  getAccessToken: vi.fn(async () => 'jwt-token'),
  hasRole: vi.fn().mockReturnValue(false),
  hasAnyRole: vi.fn().mockReturnValue(false),
};

vi.mock('../auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('../auth/RequireAuth', () => ({
  RequireAuth: ({ children, fallback, loadingFallback }: { children: React.ReactNode; fallback: React.ReactNode; loadingFallback: React.ReactNode }) => {
    if (!mockAuthState.isLoaded) return <>{loadingFallback}</>;
    if (!mockAuthState.isAuthenticated) return <>{fallback}</>;
    if (mockAuthState.callbackState) return <>{fallback}</>;
    return <>{children}</>;
  },
}));

vi.mock('../services/problemService', () => ({
  problemService: {
    loadProblems: vi.fn().mockResolvedValue([]),
    getRandomProblem: vi.fn(),
    getProblemById: vi.fn(),
    getAvailableProblemSets: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../services/proctorService', () => ({
  proctorService: {
    generateIntro: vi.fn(),
    respondToQuestion: vi.fn(),
    getLastInteractionMode: vi.fn().mockReturnValue('idle'),
    getProactiveNudge: vi.fn().mockReturnValue(null),
    configureAccessTokenProvider: vi.fn(),
    cancelPendingRequest: vi.fn(),
    evaluate: vi.fn(),
  },
}));

vi.mock('../services/storageService', () => ({
  storageService: {
    setStorageScope: vi.fn(),
    getSessions: vi.fn().mockReturnValue([]),
    saveSession: vi.fn(),
    getSession: vi.fn(),
    clearSessions: vi.fn(),
  },
}));

describe('App', () => {
  beforeEach(() => {
    mockAuthState.isLoaded = true;
    mockAuthState.isAuthenticated = true;
    mockAuthState.callbackState = null;
    mockAuthState.signupEnabled = false;
    mockAuthState.oauthProviders = [];
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: light)' ? false : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  it('renders the auth loading screen while the session is loading', () => {
    mockAuthState.isLoaded = false;
    render(<App />);

    expect(screen.getByTestId('auth-loading-screen')).toHaveTextContent(/checking your session/i);
  });

  it('renders the home view for authenticated users', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('home-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('start-session-button')).toBeInTheDocument();
    expect(screen.getByText(/browse practice/i)).toBeInTheDocument();
  });

  it('renders the invite-only auth screen for signed-out users', () => {
    mockAuthState.isAuthenticated = false;
    render(<App />);

    expect(screen.getByText(/invite-only beta/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /join waitlist/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /sign up/i })).not.toBeInTheDocument();
  });

  it('toggles between dark and light mode from the top navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId('browse-campaign-button'));
    await waitFor(() => {
      expect(screen.getByTestId('campaign-view')).toBeInTheDocument();
    });

    expect(document.documentElement.dataset.theme).toBe('dark');

    await user.click(screen.getByRole('button', { name: /light mode/i }));

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button', { name: /dark mode/i })).toBeInTheDocument();
  });
});
