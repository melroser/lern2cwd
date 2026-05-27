import type { Handler, HandlerResponse } from '@netlify/functions';
import { AuthError, buildRequestFromNetlifyContext, requireUser } from './_lib/auth';

const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

type AIRequestBody = {
  systemPrompt?: unknown;
  userPrompt?: unknown;
};

type FunctionLogMetadata = Record<string, string | number | boolean | null | undefined>;

function logFunctionEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  metadata: FunctionLogMetadata = {},
): void {
  console[level]('[lern2cwd:ai:function]', {
    event,
    at: new Date().toISOString(),
    ...metadata,
  });
}

function getServerApiKey(): string | null {
  const configured = process.env.OPENAI_API_KEY;
  return typeof configured === 'string' && configured.trim().length > 0
    ? configured.trim()
    : null;
}

function jsonResponse(statusCode: number, body: unknown): HandlerResponse {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event, context) => {
  const requestId = event.headers['x-nf-request-id'] ?? event.headers['x-request-id'] ?? 'unknown';

  try {
    logFunctionEvent('info', 'request_received', {
      requestId,
      method: event.httpMethod,
      hasClientContext: Boolean(context.clientContext?.user),
    });

    if (event.httpMethod !== 'POST') {
      logFunctionEvent('warn', 'method_not_allowed', {
        requestId,
        method: event.httpMethod,
      });
      return jsonResponse(405, { error: 'Method not allowed.' });
    }

    const request = buildRequestFromNetlifyContext(event, context);
    const user = await requireUser(request);
    logFunctionEvent('info', 'request_authenticated', {
      requestId,
      authProvider: user.authProvider,
      hasEmail: Boolean(user.email),
      roleCount: user.roles.length,
    });

    const apiKey = getServerApiKey();
    if (!apiKey) {
      logFunctionEvent('error', 'missing_openai_api_key', { requestId });
      return jsonResponse(503, { error: 'OPENAI_API_KEY is not configured for the AI gateway.' });
    }

    const parsedBody = event.body ? JSON.parse(event.body) as AIRequestBody : {};
    const systemPrompt = typeof parsedBody.systemPrompt === 'string' ? parsedBody.systemPrompt.trim() : '';
    const userPrompt = typeof parsedBody.userPrompt === 'string' ? parsedBody.userPrompt.trim() : '';

    if (!systemPrompt || !userPrompt) {
      logFunctionEvent('warn', 'invalid_prompt_payload', {
        requestId,
        hasSystemPrompt: Boolean(systemPrompt),
        hasUserPrompt: Boolean(userPrompt),
      });
      return jsonResponse(400, { error: 'systemPrompt and userPrompt are required.' });
    }

    logFunctionEvent('info', 'openai_request_started', {
      requestId,
      model: DEFAULT_MODEL,
    });

    const response = await fetch(OPENAI_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown OpenAI error');
      logFunctionEvent('warn', 'openai_request_failed', {
        requestId,
        status: response.status,
        errorSnippet: errorText.slice(0, 500),
      });
      return jsonResponse(response.status, { error: errorText });
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      logFunctionEvent('warn', 'openai_empty_completion', { requestId });
      return jsonResponse(502, { error: 'OpenAI returned an empty completion.' });
    }

    logFunctionEvent('info', 'openai_request_succeeded', {
      requestId,
      status: response.status,
    });
    return jsonResponse(200, { content });
  } catch (error) {
    if (error instanceof AuthError) {
      logFunctionEvent('warn', 'auth_error', {
        requestId,
        statusCode: error.statusCode,
      });
      return jsonResponse(error.statusCode, { error: error.message });
    }

    const message = error instanceof Error ? error.message : 'Unknown server error';
    logFunctionEvent('error', 'unhandled_error', {
      requestId,
      message,
    });
    return jsonResponse(500, { error: message });
  }
};
