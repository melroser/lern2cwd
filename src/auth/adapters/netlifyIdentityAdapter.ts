import type {
  AuthAdapter,
  AuthSession,
  AppUser,
} from '../types';
import { authConfig } from '../config';
import type {
  NetlifyIdentityUser,
  NetlifyIdentityWidget,
} from 'netlify-identity-widget';

const REDIRECT_STORAGE_KEY = 'auth:netlify:redirect';

let widgetPromise: Promise<NetlifyIdentityWidget> | null = null;
const NETLIFY_LOCALHOST_SITE_URL_KEY = 'netlifySiteURL';

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function getPendingRedirect(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(REDIRECT_STORAGE_KEY);
}

function setPendingRedirect(target?: string): void {
  if (typeof window === 'undefined' || !target) return;
  window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, target);
}

function clearPendingRedirect(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
}

function applyRedirect(target?: string): void {
  if (typeof window === 'undefined' || !target) return;

  if (/^https?:\/\//.test(target)) {
    window.location.assign(target);
    return;
  }

  window.location.assign(target.startsWith('/') ? target : `/${target}`);
}

function applyPendingRedirectIfNeeded(user: NetlifyIdentityUser | null): void {
  const redirectTarget = getPendingRedirect();
  if (!user || !redirectTarget) return;

  clearPendingRedirect();
  applyRedirect(redirectTarget);
}

function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;

  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

function seedLocalNetlifySiteURL(): void {
  if (typeof window === 'undefined' || !isLocalhost() || !authConfig.netlify.siteURL) {
    return;
  }

  window.localStorage.setItem(NETLIFY_LOCALHOST_SITE_URL_KEY, authConfig.netlify.siteURL);
}

function readRoles(user: NetlifyIdentityUser): string[] {
  const appMetadataRoles = Array.isArray(user.app_metadata?.roles) ? user.app_metadata.roles : [];
  const authorizationRoles = Array.isArray(user.app_metadata?.authorization?.roles)
    ? user.app_metadata.authorization.roles
    : [];
  const directRoles = Array.isArray(user.roles) ? user.roles : [];

  return unique([...appMetadataRoles, ...authorizationRoles, ...directRoles].map(String));
}

function readDisplayName(user: NetlifyIdentityUser): string | null {
  const userMetadata = user.user_metadata ?? {};
  const rawDisplayName = userMetadata.full_name ?? userMetadata.fullName ?? userMetadata.name ?? null;
  return typeof rawDisplayName === 'string' && rawDisplayName.trim().length > 0 ? rawDisplayName : null;
}

async function loadWidget(): Promise<NetlifyIdentityWidget> {
  // The widget auto-initializes as soon as the module is imported, so local
  // development needs the site URL seeded before the import happens.
  seedLocalNetlifySiteURL();

  if (!widgetPromise) {
    widgetPromise = import('netlify-identity-widget').then((module) => module.default);
  }

  return widgetPromise;
}

export function normalizeNetlifyIdentityUser(user: NetlifyIdentityUser | null): AppUser | null {
  if (!user) return null;

  const id = typeof user.id === 'string' && user.id.trim().length > 0
    ? user.id
    : typeof user.sub === 'string' && user.sub.trim().length > 0
      ? user.sub
      : null;

  if (!id) {
    return null;
  }

  return {
    id,
    email: typeof user.email === 'string' && user.email.trim().length > 0 ? user.email : null,
    displayName: readDisplayName(user),
    roles: readRoles(user),
    authProvider: 'netlify',
  };
}

export function createNetlifyIdentityAdapter(): AuthAdapter {
  let initialized = false;

  return {
    async init(): Promise<void> {
      if (typeof window === 'undefined') return;

      const widget = await loadWidget();
      if (!initialized) {
        widget.init({
          locale: authConfig.netlify.locale,
          namePlaceholder: authConfig.netlify.namePlaceholder,
          logo: true,
        });
        initialized = true;
      }

      applyPendingRedirectIfNeeded(widget.currentUser());
    },

    async getSession(): Promise<AuthSession> {
      const widget = await loadWidget();
      const user = normalizeNetlifyIdentityUser(widget.currentUser());

      return {
        user,
        isLoaded: true,
        isAuthenticated: user !== null,
        accessToken: null,
      };
    },

    async login(options): Promise<void> {
      const widget = await loadWidget();
      setPendingRedirect(options?.redirectTo ?? authConfig.loginRedirectPath);
      widget.open('login');
    },

    async logout(options): Promise<void> {
      const widget = await loadWidget();
      clearPendingRedirect();
      await Promise.resolve(widget.logout());
      applyRedirect(options?.redirectTo ?? authConfig.logoutRedirectPath);
    },

    async signup(options): Promise<void> {
      if (authConfig.netlify.inviteOnly) {
        throw new Error('Public sign-up is disabled. Access is invite only.');
      }

      const widget = await loadWidget();
      setPendingRedirect(options?.redirectTo ?? authConfig.loginRedirectPath);
      widget.open('signup', options?.email ? { email: options.email } : undefined);
    },

    async getAccessToken(): Promise<string | null> {
      const widget = await loadWidget();
      const user = widget.currentUser();

      if (!user?.jwt) {
        return null;
      }

      return user.jwt();
    },

    onAuthStateChange(callback): () => void {
      let disposed = false;
      let cleanup = () => {};

      void loadWidget().then((widget) => {
        if (disposed) return;

        const handleStateChange = (): void => {
          applyPendingRedirectIfNeeded(widget.currentUser());
          callback();
        };

        const events: Array<'init' | 'login' | 'logout' | 'error'> = ['init', 'login', 'logout', 'error'];
        for (const event of events) {
          widget.on(event, handleStateChange);
        }

        cleanup = () => {
          for (const event of events) {
            widget.off(event, handleStateChange);
          }
        };
      });

      return () => {
        disposed = true;
        cleanup();
      };
    },
  };
}
