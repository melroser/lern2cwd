/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_PROVIDER?: 'netlify' | 'clerk' | 'auth0';
  readonly VITE_AUTH_LOGIN_REDIRECT_PATH?: string;
  readonly VITE_AUTH_LOGOUT_REDIRECT_PATH?: string;
  readonly VITE_AUTH_DEBUG?: string;
  readonly VITE_NETLIFY_SITE_URL?: string;
  readonly VITE_NETLIFY_IDENTITY_API_URL?: string;
  readonly VITE_NETLIFY_IDENTITY_LOCALE?: string;
  readonly VITE_NETLIFY_IDENTITY_NAME_PLACEHOLDER?: string;
  readonly VITE_NETLIFY_PUBLIC_SIGNUP?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  readonly VITE_AUTH0_DOMAIN?: string;
  readonly VITE_AUTH0_CLIENT_ID?: string;
  readonly VITE_AUTH0_AUDIENCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
