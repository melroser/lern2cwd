export type AuthProviderName = 'netlify' | 'clerk' | 'auth0';

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

export interface AuthAdapter {
  init(): Promise<void>;
  getSession(): Promise<AuthSession>;
  login(options?: { redirectTo?: string }): Promise<void>;
  logout(options?: { redirectTo?: string }): Promise<void>;
  signup?(options?: { email?: string; redirectTo?: string }): Promise<void>;
  getAccessToken?(): Promise<string | null>;
  onAuthStateChange?(callback: () => void): () => void;
}

export function getAppUserProfileKey(user: AppUser): string {
  return `${user.authProvider}:${user.id}`;
}
