import { authConfig } from '../auth/config';
import { useAuth } from '../auth/useAuth';

function getCurrentLocation(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function AuthScreen() {
  const auth = useAuth();

  return (
    <div className="home-view authGateView" data-testid="auth-screen">
      <div className="home-content authGateCard">
        <div className="authGateEyebrow">Invite-only beta</div>
        <h1>Interview Simulator</h1>
        <p>
          Sign in with the email address that was invited to this Netlify Identity site.
          {' '}
          {authConfig.netlify.inviteOnly
            ? 'Public sign-up is disabled on purpose right now.'
            : 'You can sign in or create an account below.'}
        </p>

        <div className="authGateMeta">
          <span className="tag cool">provider: {auth.provider}</span>
          <span className="tag">invite only</span>
        </div>

        {auth.error && (
          <div className="authGateError" data-testid="auth-error-message">
            {auth.error}
          </div>
        )}

        <div className="home-actions">
          <button
            className="btn primary"
            data-testid="auth-login-button"
            onClick={() => void auth.login({ redirectTo: getCurrentLocation() })}
          >
            Log In
          </button>

          {auth.signupEnabled && (
            <button
              className="btn"
              data-testid="auth-signup-button"
              onClick={() => void auth.signup({ redirectTo: getCurrentLocation() })}
            >
              Sign Up
            </button>
          )}
        </div>

        <p className="authGateHelp">
          If you were invited by email, use that same address when the Netlify Identity modal opens.
        </p>
      </div>
    </div>
  );
}
