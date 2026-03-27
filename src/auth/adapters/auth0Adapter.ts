import type { AuthAdapter } from '../types';

function notImplemented(): never {
  throw new Error('Auth0 auth adapter is not implemented yet.');
}

export function createAuth0Adapter(): AuthAdapter {
  return {
    init: async () => notImplemented(),
    getSession: async () => notImplemented(),
    login: async () => notImplemented(),
    logout: async () => notImplemented(),
    signup: async () => notImplemented(),
    getAccessToken: async () => notImplemented(),
    onAuthStateChange: () => () => {},
  };
}
