import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type GuestDemoTokenPayload = {
  sub: string;
  email: string;
  code: string;
  exp: number;
  iat: number;
};

const DEFAULT_DEMO_CODE = 'demo';
const DEFAULT_DEMO_SECRET = 'lern2cwd-local-guest-demo-secret';
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 60 * 2;

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getGuestDemoSecret(): string {
  const configuredSecret = process.env.GUEST_DEMO_SECRET;
  return typeof configuredSecret === 'string' && configuredSecret.trim().length > 0
    ? configuredSecret.trim()
    : DEFAULT_DEMO_SECRET;
}

export function getGuestDemoCode(): string {
  const configuredCode = process.env.GUEST_DEMO_CODE;
  return typeof configuredCode === 'string' && configuredCode.trim().length > 0
    ? configuredCode.trim()
    : DEFAULT_DEMO_CODE;
}

export function getGuestDemoExpirySeconds(): number {
  const configuredSeconds = Number(process.env.GUEST_DEMO_TTL_SECONDS);
  if (Number.isFinite(configuredSeconds) && configuredSeconds >= 60 && configuredSeconds <= 86_400) {
    return Math.floor(configuredSeconds);
  }

  return DEFAULT_EXPIRES_IN_SECONDS;
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', getGuestDemoSecret()).update(encodedPayload).digest('base64url');
}

export function createGuestDemoToken(email: string, code: string): {
  token: string;
  payload: GuestDemoTokenPayload;
} {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: GuestDemoTokenPayload = {
    sub: `guest:${randomUUID()}`,
    email,
    code,
    iat: issuedAt,
    exp: issuedAt + getGuestDemoExpirySeconds(),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    payload,
  };
}

export function verifyGuestDemoToken(token: string): GuestDemoTokenPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signPayload(encodedPayload);
  const provided = Buffer.from(signature, 'base64url');
  const expected = Buffer.from(expectedSignature, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as GuestDemoTokenPayload;
  if (
    !parsed ||
    typeof parsed.sub !== 'string' ||
    typeof parsed.email !== 'string' ||
    typeof parsed.code !== 'string' ||
    typeof parsed.exp !== 'number' ||
    typeof parsed.iat !== 'number'
  ) {
    return null;
  }

  if (parsed.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  if (parsed.code !== getGuestDemoCode()) {
    return null;
  }

  return parsed;
}

export function normalizeGuestBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}
