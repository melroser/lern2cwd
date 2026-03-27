import type { Handler } from '@netlify/functions';
import { AuthError, buildRequestFromNetlifyContext, requireUser } from './_lib/auth';

export const handler: Handler = async (event, context) => {
  try {
    const request = buildRequestFromNetlifyContext(event, context);
    const user = await requireUser(request);

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        user,
        profileKey: `${user.authProvider}:${user.id}`,
      }),
    };
  } catch (error) {
    const statusCode = error instanceof AuthError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      statusCode,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ error: message }),
    };
  }
};
