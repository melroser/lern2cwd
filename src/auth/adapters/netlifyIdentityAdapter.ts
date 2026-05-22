import {
  AUTH_EVENTS,
  acceptInvite as acceptNetlifyInvite,
  getSettings,
  getUser,
  handleAuthCallback,
  login as netlifyLogin,
  logout as netlifyLogout,
  oauthLogin as netlifyOAuthLogin,
  onAuthChange,
  refreshSession,
  requestPasswordRecovery as requestNetlifyPasswordRecovery,
  signup as netlifySignup,
  updateUser,
  type CallbackResult,
  type Settings,
  type User,
} from '@netlify/identity';
import type {
  AppUser,
  AuthAdapter,
  AuthCallbackState,
  AuthOAuthProvider,
  AuthSignupResult,
} from '../types';
import { authConfig } from '../config';

const NF_JWT_COOKIE = 'nf_jwt';

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const match = new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`)
    .exec(document.cookie);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function getRequiredValue(value: string | undefined, message: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  throw new Error(message);
}

function normalizeRedirectTarget(target?: string): string | null {
  if (typeof window === 'undefined' || !target) return null;

  const url = new URL(target, window.location.origin);
  if (url.origin !== window.location.origin) {
    return authConfig.loginRedirectPath;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function applyRedirect(target?: string): void {
  if (typeof window === 'undefined') return;

  const normalizedTarget = normalizeRedirectTarget(target);
  if (!normalizedTarget) return;

  const currentTarget = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (normalizedTarget === currentTarget) return;

  window.location.assign(normalizedTarget);
}

function normalizeNetlifyIdentityUser(user: User | null): AppUser | null {
  if (!user?.id) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    displayName: user.name ?? null,
    roles: unique([...(user.roles ?? []), user.role ?? '']),
    authProvider: 'netlify',
  };
}

function toCallbackState(result: CallbackResult | null): AuthCallbackState | null {
  if (!result) return null;

  if (result.type === 'invite' && result.token) {
    return {
      type: 'invite',
      token: result.token,
    };
  }

  if (result.type === 'recovery') {
    return {
      type: 'recovery',
      email: result.user?.email ?? null,
    };
  }

  return null;
}

export { normalizeNetlifyIdentityUser };

export function createNetlifyIdentityAdapter(): AuthAdapter {
  let callbackState: AuthCallbackState | null = null;
  let identitySettings: Settings | null = null;

  const signupDisabled = (): boolean => (
    authConfig.netlify.inviteOnly || identitySettings?.disableSignup === true
  );

  const getOAuthProviders = (): AuthOAuthProvider[] => {
    const configuredProviders = identitySettings?.providers;
    if (!configuredProviders) return [];

    return (['google', 'github', 'gitlab', 'bitbucket', 'facebook'] as AuthOAuthProvider[])
      .filter((provider) => configuredProviders[provider]);
  };

  return {
    async init(): Promise<void> {
      if (typeof window === 'undefined') return;

      callbackState = toCallbackState(await handleAuthCallback());

      try {
        identitySettings = await getSettings();
      } catch {
        identitySettings = null;
      }
    },

    async getSession() {
      const user = normalizeNetlifyIdentityUser(await getUser());

      return {
        user,
        isLoaded: true,
        isAuthenticated: user !== null,
        accessToken: null,
      };
    },

    async login(options): Promise<void> {
      const email = getRequiredValue(options?.email, 'Enter your email address.');
      const password = getRequiredValue(options?.password, 'Enter your password.');

      await netlifyLogin(email, password);
      applyRedirect(options?.redirectTo ?? authConfig.loginRedirectPath);
    },

    async logout(options): Promise<void> {
      callbackState = null;
      await netlifyLogout();
      applyRedirect(options?.redirectTo ?? authConfig.logoutRedirectPath);
    },

    async signup(options): Promise<AuthSignupResult> {
      if (signupDisabled()) {
        throw new Error('Public sign-up is disabled for this site. Use an invite or request password setup if an admin created your account.');
      }

      const email = getRequiredValue(options?.email, 'Enter your email address.');
      const password = getRequiredValue(options?.password, 'Enter a password.');
      const displayName = options?.displayName?.trim();
      const netlifyUser = await netlifySignup(
        email,
        password,
        displayName ? { full_name: displayName } : undefined,
      );
      const user = normalizeNetlifyIdentityUser(netlifyUser);
      const isAuthenticated = Boolean(netlifyUser.confirmedAt);

      if (isAuthenticated) {
        applyRedirect(options?.redirectTo ?? authConfig.loginRedirectPath);
      }

      return {
        status: isAuthenticated ? 'authenticated' : 'confirmation_required',
        user: isAuthenticated ? user : null,
      };
    },

    async oauthLogin(provider): Promise<void> {
      netlifyOAuthLogin(provider);
    },

    async requestPasswordRecovery(email): Promise<void> {
      await requestNetlifyPasswordRecovery(email);
    },

    async acceptInvite(options): Promise<void> {
      const password = getRequiredValue(options.password, 'Enter a password.');
      await acceptNetlifyInvite(options.token, password);
      const displayName = options.displayName?.trim();
      if (displayName) {
        await updateUser({ data: { full_name: displayName } });
      }
      callbackState = null;
      applyRedirect(options.redirectTo ?? authConfig.loginRedirectPath);
    },

    async updatePassword(options): Promise<void> {
      const password = getRequiredValue(options.password, 'Enter a password.');
      await updateUser({ password });
      callbackState = null;
      applyRedirect(options.redirectTo ?? authConfig.loginRedirectPath);
    },

    getCallbackState(): AuthCallbackState | null {
      return callbackState;
    },

    isSignupEnabled(): boolean {
      return !signupDisabled();
    },

    getOAuthProviders,

    clearCallbackState(): void {
      callbackState = null;
    },

    async getAccessToken(): Promise<string | null> {
      const refreshedToken = await refreshSession().catch(() => null);
      return refreshedToken ?? readCookie(NF_JWT_COOKIE);
    },

    onAuthStateChange(callback): () => void {
      return onAuthChange((event, user) => {
        if (event === AUTH_EVENTS.RECOVERY) {
          callbackState = {
            type: 'recovery',
            email: user?.email ?? null,
          };
        }

        if (event === AUTH_EVENTS.LOGOUT) {
          callbackState = null;
        }

        callback();
      });
    },
  };
}
