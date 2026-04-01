# Auth Architecture

This app now uses a provider-neutral auth boundary. The rest of the product should depend on the app-owned auth contract rather than any provider SDK.

## Where provider-specific code lives

Frontend provider code lives only in:
- `/Users/melroser/Workspace/lern2cwd/src/auth/adapters/netlifyIdentityAdapter.ts`
- `/Users/melroser/Workspace/lern2cwd/src/auth/adapters/clerkAdapter.ts`
- `/Users/melroser/Workspace/lern2cwd/src/auth/adapters/auth0Adapter.ts`

Server-side verification lives only in:
- `/Users/melroser/Workspace/lern2cwd/netlify/functions/_lib/auth.ts`

Feature components should never import provider SDKs directly.

## Files that should stay unchanged during a provider migration

These files are safe to keep stable when moving from Netlify Identity to Clerk or Auth0:
- `/Users/melroser/Workspace/lern2cwd/src/auth/types.ts`
- `/Users/melroser/Workspace/lern2cwd/src/auth/AuthProvider.tsx`
- `/Users/melroser/Workspace/lern2cwd/src/auth/useAuth.ts`
- `/Users/melroser/Workspace/lern2cwd/src/auth/RequireAuth.tsx`
- `/Users/melroser/Workspace/lern2cwd/src/auth/RequireRole.tsx`
- app feature components that only call `useAuth()`

The migration surface should mostly be:
- the selected adapter in `/Users/melroser/Workspace/lern2cwd/src/auth/createAuthAdapter.ts`
- provider-specific env vars in `/Users/melroser/Workspace/lern2cwd/src/auth/config.ts`
- server-side verification inside `/Users/melroser/Workspace/lern2cwd/netlify/functions/_lib/auth.ts`

## Environment variables by provider

### Netlify Identity
- `VITE_AUTH_PROVIDER=netlify`
- `VITE_NETLIFY_SITE_URL` (optional, mainly for localhost development)
- `VITE_NETLIFY_IDENTITY_LOCALE` (optional)
- `VITE_NETLIFY_PUBLIC_SIGNUP=false` for invite-only mode

### Clerk
- `VITE_AUTH_PROVIDER=clerk`
- `VITE_CLERK_PUBLISHABLE_KEY`

### Auth0
- `VITE_AUTH_PROVIDER=auth0`
- `VITE_AUTH0_DOMAIN`
- `VITE_AUTH0_CLIENT_ID`
- `VITE_AUTH0_AUDIENCE`

Shared app-level env vars:
- `VITE_AUTH_LOGIN_REDIRECT_PATH`
- `VITE_AUTH_LOGOUT_REDIRECT_PATH`
- `VITE_AUTH_DEBUG`

## User identity normalization

The app stores normalized users as:
- `id`
- `email`
- `displayName`
- `roles`
- `authProvider`

Future app-owned profile rows should be keyed by:
- `provider:userId`

Examples:
- `netlify:abc123`
- `clerk:user_123`
- `auth0:auth0|abc`

Use `/Users/melroser/Workspace/lern2cwd/src/auth/types.ts#getAppUserProfileKey` when you need the stable app-owned identity key.

## How to add a new provider adapter

1. Create a new adapter file under `/Users/melroser/Workspace/lern2cwd/src/auth/adapters/`.
2. Implement the `AuthAdapter` contract from `/Users/melroser/Workspace/lern2cwd/src/auth/types.ts`.
3. Normalize the provider user object into the shared `AppUser` shape.
4. Update `/Users/melroser/Workspace/lern2cwd/src/auth/createAuthAdapter.ts` to select the adapter.
5. Update `/Users/melroser/Workspace/lern2cwd/src/auth/config.ts` with any public env vars.
6. Extend `/Users/melroser/Workspace/lern2cwd/netlify/functions/_lib/auth.ts` with server-side verification for that provider.

## Important rule

Frontend auth state is not the source of truth for protected backend logic. Any Netlify Function that uses app-owned secrets or protected user data must verify identity server-side with `requireUser()` or `requireRole()`.
