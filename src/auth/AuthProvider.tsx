import { createContext, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { createAuthAdapter } from './createAuthAdapter';
import { authConfig } from './config';
import { getAppUserProfileKey, type AuthSession, type AppUser, type AuthProviderName } from './types';

type AuthContextValue = AuthSession & {
  provider: AuthProviderName;
  error: string | null;
  profileKey: string | null;
  signupEnabled: boolean;
  login: (options?: { redirectTo?: string }) => Promise<void>;
  logout: (options?: { redirectTo?: string }) => Promise<void>;
  signup: (options?: { email?: string; redirectTo?: string }) => Promise<void>;
  refreshSession: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
};

const initialSession: AuthSession = {
  user: null,
  isLoaded: false,
  isAuthenticated: false,
  accessToken: null,
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Authentication failed.';
}

function normalizeSession(session: AuthSession): AuthSession {
  const user: AppUser | null = session.user ?? null;

  return {
    user,
    isLoaded: session.isLoaded,
    isAuthenticated: session.isAuthenticated && user !== null,
    accessToken: session.accessToken ?? null,
  };
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const adapter = useMemo(() => createAuthAdapter(), []);
  const [session, setSession] = useState<AuthSession>(initialSession);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const nextSession = normalizeSession(await adapter.getSession());
      setSession(nextSession);
      setError(null);
    } catch (authError) {
      setSession({ ...initialSession, isLoaded: true });
      setError(toErrorMessage(authError));
    }
  }, [adapter]);

  useEffect(() => {
    let isActive = true;
    let unsubscribe = () => {};

    void (async () => {
      try {
        await adapter.init();
        if (!isActive) return;

        await refreshSession();
        if (!isActive) return;

        unsubscribe = adapter.onAuthStateChange?.(() => {
          void refreshSession();
        }) ?? (() => {});
      } catch (authError) {
        if (!isActive) return;
        setSession({ ...initialSession, isLoaded: true });
        setError(toErrorMessage(authError));
      }
    })();

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [adapter, refreshSession]);

  const login = useCallback(async (options?: { redirectTo?: string }) => {
    setError(null);
    await adapter.login(options);
  }, [adapter]);

  const logout = useCallback(async (options?: { redirectTo?: string }) => {
    setError(null);
    await adapter.logout(options);
    setSession({ ...initialSession, isLoaded: true });
  }, [adapter]);

  const signup = useCallback(async (options?: { email?: string; redirectTo?: string }) => {
    if (!adapter.signup) {
      throw new Error(`${authConfig.provider} does not support sign-up through this adapter.`);
    }

    setError(null);
    await adapter.signup(options);
  }, [adapter]);

  const getAccessToken = useCallback(async () => {
    if (!adapter.getAccessToken) {
      return null;
    }

    return adapter.getAccessToken();
  }, [adapter]);

  const hasRole = useCallback((role: string) => {
    if (!session.user) return false;
    return session.user.roles.includes(role);
  }, [session.user]);

  const hasAnyRole = useCallback((roles: string[]) => {
    if (!session.user) return false;
    return roles.some((role) => session.user?.roles.includes(role));
  }, [session.user]);

  const value = useMemo<AuthContextValue>(() => ({
    ...session,
    provider: authConfig.provider,
    error,
    profileKey: session.user ? getAppUserProfileKey(session.user) : null,
    signupEnabled: typeof adapter.signup === 'function' && !(authConfig.provider === 'netlify' && authConfig.netlify.inviteOnly),
    login,
    logout,
    signup,
    refreshSession,
    getAccessToken,
    hasRole,
    hasAnyRole,
  }), [adapter, error, getAccessToken, hasAnyRole, hasRole, login, logout, refreshSession, session, signup]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
