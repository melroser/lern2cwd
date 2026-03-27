import type { AuthAdapter } from '../types';

function notImplemented(): never {
  throw new Error('Clerk auth adapter is not implemented yet.');
}

export function createClerkAdapter(): AuthAdapter {
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
