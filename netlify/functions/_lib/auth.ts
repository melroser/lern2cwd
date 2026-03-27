import type { HandlerContext, HandlerEvent } from '@netlify/functions';

export type VerifiedRequestUser = {
  id: string;
  email: string | null;
  roles: string[];
  authProvider: 'netlify' | 'clerk' | 'auth0';
};

type NetlifyRequestUser = {
  sub?: string;
  id?: string;
  email?: string | null;
  app_metadata?: {
    roles?: string[];
    authorization?: {
      roles?: string[];
    };
  };
  roles?: string[];
};

type NetlifyClientContext = {
  user?: NetlifyRequestUser;
};

const NETLIFY_CONTEXT_HEADER = 'x-app-netlify-client-context';

export class AuthError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function parseRoles(user: NetlifyRequestUser): string[] {
  const roles = [
    ...(Array.isArray(user.app_metadata?.roles) ? user.app_metadata.roles : []),
    ...(Array.isArray(user.app_metadata?.authorization?.roles) ? user.app_metadata.authorization.roles : []),
    ...(Array.isArray(user.roles) ? user.roles : []),
  ];

  return [...new Set(roles.filter((role): role is string => typeof role === 'string' && role.length > 0))];
}

function parseNetlifyUser(req: Request): VerifiedRequestUser | null {
  const rawContext = req.headers.get(NETLIFY_CONTEXT_HEADER);
  if (!rawContext) return null;

  const decoded = JSON.parse(Buffer.from(rawContext, 'base64').toString('utf8')) as NetlifyClientContext;
  const user = decoded.user;
  if (!user) return null;

  const id = typeof user.sub === 'string' && user.sub.length > 0
    ? user.sub
    : typeof user.id === 'string' && user.id.length > 0
      ? user.id
      : null;

  if (!id) return null;

  return {
    id,
    email: typeof user.email === 'string' && user.email.length > 0 ? user.email : null,
    roles: parseRoles(user),
    authProvider: 'netlify',
  };
}

function configuredServerAuthProvider(): 'netlify' | 'clerk' | 'auth0' {
  const configured = process.env.AUTH_PROVIDER ?? process.env.VITE_AUTH_PROVIDER ?? 'netlify';
  if (configured === 'clerk' || configured === 'auth0' || configured === 'netlify') {
    return configured;
  }

  return 'netlify';
}

export function buildRequestFromNetlifyContext(event: HandlerEvent, context: HandlerContext): Request {
  const headers = new Headers();

  for (const [key, value] of Object.entries(event.headers)) {
    if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  const clientContext = context.clientContext;
  if (clientContext) {
    headers.set(NETLIFY_CONTEXT_HEADER, Buffer.from(JSON.stringify(clientContext)).toString('base64'));
  }

  const method = event.httpMethod || 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : (event.body ?? undefined);

  return new Request(event.rawUrl, {
    method,
    headers,
    body,
  });
}

export async function requireUser(req: Request): Promise<VerifiedRequestUser> {
  switch (configuredServerAuthProvider()) {
    case 'netlify': {
      const user = parseNetlifyUser(req);
      if (!user) {
        throw new AuthError(401, 'Authentication required.');
      }
      return user;
    }
    case 'clerk':
      throw new AuthError(501, 'Clerk verification is not implemented yet.');
    case 'auth0':
      throw new AuthError(501, 'Auth0 verification is not implemented yet.');
    default:
      throw new AuthError(500, 'Unsupported auth provider.');
  }
}

export async function requireRole(req: Request, roles: string[]): Promise<VerifiedRequestUser> {
  const user = await requireUser(req);
  if (roles.length === 0) {
    return user;
  }

  const hasRole = roles.some((role) => user.roles.includes(role));
  if (!hasRole) {
    throw new AuthError(403, 'Forbidden.');
  }

  return user;
}
