export type AuthProviderName = 'netlify' | 'clerk' | 'auth0';

export type AuthOAuthProvider = 'google' | 'github' | 'gitlab' | 'bitbucket' | 'facebook';

export type AppUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  roles: string[];
  authProvider: AuthProviderName;
};

export type AuthSession = {
  user: AppUser | null;
  isLoaded: boolean;
  isAuthenticated: boolean;
  accessToken?: string | null;
};

export type AuthCallbackState =
  | {
      type: 'invite';
      token: string;
    }
  | {
      type: 'recovery';
      email: string | null;
    };

export type AuthSignupResult = {
  status: 'authenticated' | 'confirmation_required';
  user: AppUser | null;
};

export interface AuthAdapter {
  init(): Promise<void>;
  getSession(): Promise<AuthSession>;
  login(options?: { email?: string; password?: string; redirectTo?: string }): Promise<void>;
  logout(options?: { redirectTo?: string }): Promise<void>;
  signup?(options?: {
    email?: string;
    password?: string;
    displayName?: string;
    redirectTo?: string;
  }): Promise<AuthSignupResult>;
  requestPasswordRecovery?(email: string): Promise<void>;
  acceptInvite?(options: {
    token: string;
    password: string;
    displayName?: string;
    redirectTo?: string;
  }): Promise<void>;
  updatePassword?(options: { password: string; redirectTo?: string }): Promise<void>;
  oauthLogin?(provider: AuthOAuthProvider, options?: { redirectTo?: string }): Promise<void>;
  getCallbackState?(): AuthCallbackState | null;
  isSignupEnabled?(): boolean;
  getOAuthProviders?(): AuthOAuthProvider[];
  clearCallbackState?(): void;
  getAccessToken?(): Promise<string | null>;
  onAuthStateChange?(callback: () => void): () => void;
}

export function getAppUserProfileKey(user: AppUser): string {
  return `${user.authProvider}:${user.id}`;
}
