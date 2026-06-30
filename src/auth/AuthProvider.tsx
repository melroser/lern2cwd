import { createContext, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { createAuthAdapter } from './createAuthAdapter';
import { authConfig } from './config';
import {
  clearGuestDemoSession,
  getGuestDemoAuthSession,
  readGuestDemoSession,
} from './guestSession';
import {
  getAppUserProfileKey,
  type AuthCallbackState,
  type AuthOAuthProvider,
  type AuthSession,
  type AuthSignupResult,
  type AppUser,
  type AuthProviderName,
} from './types';

type AuthContextValue = AuthSession & {
  provider: AuthProviderName;
  error: string | null;
  callbackState: AuthCallbackState | null;
  profileKey: string | null;
  signupEnabled: boolean;
  oauthProviders: AuthOAuthProvider[];
  login: (options?: { email?: string; password?: string; redirectTo?: string }) => Promise<void>;
  logout: (options?: { redirectTo?: string }) => Promise<void>;
  signup: (options?: {
    email?: string;
    password?: string;
    displayName?: string;
    redirectTo?: string;
  }) => Promise<AuthSignupResult>;
  requestPasswordRecovery: (email: string) => Promise<void>;
  acceptInvite: (options: {
    token: string;
    password: string;
    displayName?: string;
    redirectTo?: string;
  }) => Promise<void>;
  updatePassword: (options: { password: string; redirectTo?: string }) => Promise<void>;
  oauthLogin: (provider: AuthOAuthProvider, options?: { redirectTo?: string }) => Promise<void>;
  clearCallbackState: () => void;
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
  const [callbackState, setCallbackState] = useState<AuthCallbackState | null>(null);
  const [oauthProviders, setOauthProviders] = useState<AuthOAuthProvider[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    let adapterError: unknown = null;

    try {
      const nextSession = normalizeSession(await adapter.getSession());
      setCallbackState(adapter.getCallbackState?.() ?? null);
      setOauthProviders(adapter.getOAuthProviders?.() ?? []);

      if (nextSession.isAuthenticated) {
        setSession(nextSession);
        setError(null);
        return;
      }
    } catch (authError) {
      adapterError = authError;
    }

    const guestSession = getGuestDemoAuthSession();
    if (guestSession) {
      setSession(guestSession);
      setCallbackState(null);
      setOauthProviders([]);
      setError(null);
      return;
    }

    setSession({ ...initialSession, isLoaded: true });
    setError(adapterError ? toErrorMessage(adapterError) : null);
  }, [adapter]);

  useEffect(() => {
    let isActive = true;
    let unsubscribe = () => {};

    void (async () => {
      try {
        await adapter.init();
        setCallbackState(adapter.getCallbackState?.() ?? null);
        setOauthProviders(adapter.getOAuthProviders?.() ?? []);
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

  const login = useCallback(async (options?: { email?: string; password?: string; redirectTo?: string }) => {
    setError(null);
    await adapter.login(options);
    await refreshSession();
  }, [adapter, refreshSession]);

  const logout = useCallback(async (options?: { redirectTo?: string }) => {
    setError(null);
    if (readGuestDemoSession()) {
      clearGuestDemoSession();
      setCallbackState(null);
      setSession({ ...initialSession, isLoaded: true });
      window.location.assign(options?.redirectTo ?? authConfig.logoutRedirectPath);
      return;
    }

    await adapter.logout(options);
    setCallbackState(adapter.getCallbackState?.() ?? null);
    setSession({ ...initialSession, isLoaded: true });
  }, [adapter]);

  const signup = useCallback(async (options?: {
    email?: string;
    password?: string;
    displayName?: string;
    redirectTo?: string;
  }) => {
    if (!adapter.signup) {
      throw new Error(`${authConfig.provider} does not support sign-up through this adapter.`);
    }

    setError(null);
    const result = await adapter.signup(options);
    await refreshSession();
    return result;
  }, [adapter, refreshSession]);

  const requestPasswordRecovery = useCallback(async (email: string) => {
    if (!adapter.requestPasswordRecovery) {
      throw new Error(`${authConfig.provider} does not support password recovery through this adapter.`);
    }

    setError(null);
    await adapter.requestPasswordRecovery(email);
  }, [adapter]);

  const acceptInvite = useCallback(async (options: {
    token: string;
    password: string;
    displayName?: string;
    redirectTo?: string;
  }) => {
    if (!adapter.acceptInvite) {
      throw new Error(`${authConfig.provider} does not support invite acceptance through this adapter.`);
    }

    setError(null);
    await adapter.acceptInvite(options);
    setCallbackState(adapter.getCallbackState?.() ?? null);
    await refreshSession();
  }, [adapter, refreshSession]);

  const updatePassword = useCallback(async (options: { password: string; redirectTo?: string }) => {
    if (!adapter.updatePassword) {
      throw new Error(`${authConfig.provider} does not support password updates through this adapter.`);
    }

    setError(null);
    await adapter.updatePassword(options);
    setCallbackState(adapter.getCallbackState?.() ?? null);
    await refreshSession();
  }, [adapter, refreshSession]);

  const oauthLogin = useCallback(async (
    provider: AuthOAuthProvider,
    options?: { redirectTo?: string },
  ) => {
    if (!adapter.oauthLogin) {
      throw new Error(`${authConfig.provider} does not support OAuth login through this adapter.`);
    }

    setError(null);
    await adapter.oauthLogin(provider, options);
  }, [adapter]);

  const clearCallbackState = useCallback(() => {
    adapter.clearCallbackState?.();
    setCallbackState(null);
  }, [adapter]);

  const getAccessToken = useCallback(async () => {
    const guestSession = readGuestDemoSession();
    if (guestSession) {
      return guestSession.token;
    }

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
    callbackState,
    profileKey: session.user ? getAppUserProfileKey(session.user) : null,
    signupEnabled: typeof adapter.signup === 'function' && (adapter.isSignupEnabled?.() ?? true),
    oauthProviders,
    login,
    logout,
    signup,
    requestPasswordRecovery,
    acceptInvite,
    updatePassword,
    oauthLogin,
    clearCallbackState,
    refreshSession,
    getAccessToken,
    hasRole,
    hasAnyRole,
  }), [
    acceptInvite,
    adapter,
    callbackState,
    clearCallbackState,
    error,
    getAccessToken,
    hasAnyRole,
    hasRole,
    login,
    logout,
    oauthLogin,
    oauthProviders,
    refreshSession,
    requestPasswordRecovery,
    session,
    signup,
    updatePassword,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
