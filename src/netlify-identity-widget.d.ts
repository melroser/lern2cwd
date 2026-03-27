declare module 'netlify-identity-widget' {
  export interface NetlifyIdentityUserMetadata {
    full_name?: string;
    fullName?: string;
    name?: string;
    [key: string]: unknown;
  }

  export interface NetlifyIdentityAppMetadata {
    roles?: string[];
    authorization?: {
      roles?: string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  export interface NetlifyIdentityUser {
    id?: string;
    sub?: string;
    email?: string | null;
    roles?: string[];
    user_metadata?: NetlifyIdentityUserMetadata;
    app_metadata?: NetlifyIdentityAppMetadata;
    jwt?: (forceRefresh?: boolean) => Promise<string>;
    [key: string]: unknown;
  }

  export type NetlifyIdentityEvent = 'init' | 'login' | 'logout' | 'error' | 'open' | 'close';

  export interface NetlifyIdentityInitOptions {
    container?: string;
    APIUrl?: string;
    logo?: boolean;
    namePlaceholder?: string;
    locale?: string;
    cookieDomain?: string;
  }

  export interface NetlifyIdentityWidget {
    init(options?: NetlifyIdentityInitOptions): void;
    open(action?: 'login' | 'signup' | 'error', metadata?: Record<string, string>): void;
    close(): void;
    currentUser(): NetlifyIdentityUser | null;
    logout(): Promise<void> | void;
    refresh(forceRefresh?: boolean): Promise<string>;
    on(event: NetlifyIdentityEvent, handler: (payload?: unknown) => void): void;
    off(event: NetlifyIdentityEvent, handler?: (payload?: unknown) => void): void;
    setLocale(locale: string): void;
  }

  const netlifyIdentity: NetlifyIdentityWidget;
  export default netlifyIdentity;
}
