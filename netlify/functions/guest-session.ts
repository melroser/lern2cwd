import type { Handler, HandlerResponse } from '@netlify/functions';
import {
  createGuestDemoToken,
  getGuestDemoCode,
  getGuestDemoExpirySeconds,
} from './_lib/guestAuth';

type GuestSessionBody = {
  code?: unknown;
  email?: unknown;
  sourcePath?: unknown;
};

function jsonResponse(statusCode: number, body: unknown): HandlerResponse {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  try {
    const parsedBody = event.body ? JSON.parse(event.body) as GuestSessionBody : {};
    const code = typeof parsedBody.code === 'string' ? parsedBody.code.trim() : '';
    const email = typeof parsedBody.email === 'string' ? parsedBody.email.trim().toLowerCase() : '';
    const expectedCode = getGuestDemoCode();

    if (code !== expectedCode) {
      return jsonResponse(404, { error: 'Demo link not found.' });
    }

    if (!email || !isValidEmail(email)) {
      return jsonResponse(400, { error: 'Enter a valid email address.' });
    }

    const { token, payload } = createGuestDemoToken(email, code);
    const expiresInSeconds = getGuestDemoExpirySeconds();

    console.info('[lern2cwd:guest-demo]', {
      event: 'guest_session_created',
      at: new Date().toISOString(),
      email,
      sourcePath: typeof parsedBody.sourcePath === 'string' ? parsedBody.sourcePath : null,
      expiresAt: payload.exp,
    });

    return jsonResponse(200, {
      token,
      email,
      code,
      expiresAt: payload.exp * 1000,
      expiresInMinutes: Math.round(expiresInSeconds / 60),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start guest demo.';
    return jsonResponse(500, { error: message });
  }
};
