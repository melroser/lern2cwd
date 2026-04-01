import type { Handler, HandlerResponse } from '@netlify/functions';
import { AuthError, buildRequestFromNetlifyContext, requireUser } from './_lib/auth';

const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

type AIRequestBody = {
  systemPrompt?: unknown;
  userPrompt?: unknown;
};

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
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed.' });
    }

    const request = buildRequestFromNetlifyContext(event, context);
    await requireUser(request);

    const apiKey = getServerApiKey();
    if (!apiKey) {
      return jsonResponse(503, { error: 'OPENAI_API_KEY is not configured for the AI gateway.' });
    }

    const parsedBody = event.body ? JSON.parse(event.body) as AIRequestBody : {};
    const systemPrompt = typeof parsedBody.systemPrompt === 'string' ? parsedBody.systemPrompt.trim() : '';
    const userPrompt = typeof parsedBody.userPrompt === 'string' ? parsedBody.userPrompt.trim() : '';

    if (!systemPrompt || !userPrompt) {
      return jsonResponse(400, { error: 'systemPrompt and userPrompt are required.' });
    }

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
      return jsonResponse(response.status, { error: errorText });
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      return jsonResponse(502, { error: 'OpenAI returned an empty completion.' });
    }

    return jsonResponse(200, { content });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse(error.statusCode, { error: error.message });
    }

    const message = error instanceof Error ? error.message : 'Unknown server error';
    return jsonResponse(500, { error: message });
  }
};
