import { createAuth0Adapter } from './adapters/auth0Adapter';
import { createClerkAdapter } from './adapters/clerkAdapter';
import { createNetlifyIdentityAdapter } from './adapters/netlifyIdentityAdapter';
import { authConfig } from './config';
import type { AuthAdapter } from './types';

export function createAuthAdapter(): AuthAdapter {
  switch (authConfig.provider) {
    case 'clerk':
      return createClerkAdapter();
    case 'auth0':
      return createAuth0Adapter();
    case 'netlify':
    default:
      return createNetlifyIdentityAdapter();
  }
}
