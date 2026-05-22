import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { authConfig } from '../auth/config';
import { useAuth } from '../auth/useAuth';

type AuthMode = 'login' | 'signup' | 'request' | 'invite' | 'reset';

const REQUEST_ACCESS_FORM_NAME = 'request-access';
const REQUEST_ACCESS_SUBJECT = 'lern2cwd access request';

function getCurrentLocation(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function validatePassword(password: string, confirmation: string): string | null {
  if (password.length < 8) {
    return 'Use at least 8 characters for the password.';
  }

  if (password !== confirmation) {
    return 'The password confirmation does not match.';
  }

  return null;
}

export function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (auth.callbackState?.type === 'invite') {
      setMode('invite');
      return;
    }

    if (auth.callbackState?.type === 'recovery') {
      setMode('reset');
      setEmail(auth.callbackState.email ?? '');
    }
  }, [auth.callbackState]);

  const forcedPasswordMode = auth.callbackState?.type === 'invite' || auth.callbackState?.type === 'recovery';
  const canUseSignup = auth.signupEnabled && !forcedPasswordMode;
  const canUseGoogle = canUseSignup && auth.oauthProviders.includes('google') && !forcedPasswordMode;
  const showPasswordConfirmation = mode === 'signup' || mode === 'invite' || mode === 'reset';

  const modeCopy = useMemo(() => {
    if (mode === 'invite') {
      return {
        eyebrow: 'Invite accepted',
        title: 'Finish your account',
        body: 'Choose a username and password to finish your invited account.',
        submit: 'Create Account',
      };
    }

    if (mode === 'reset') {
      return {
        eyebrow: 'Password setup',
        title: 'Set your password',
        body: 'Choose a new password to finish setup and enter the simulator.',
        submit: 'Save Password',
      };
    }

    if (mode === 'request') {
      return {
        eyebrow: 'Account access',
        title: 'Request access',
        body: 'Send your email and username so we can invite you if there is an open beta spot.',
        submit: 'Request Access',
      };
    }

    if (mode === 'signup') {
      return {
        eyebrow: 'Create access',
        title: 'Create your account',
        body: 'Choose the username people will see in the simulator.',
        submit: 'Sign Up',
      };
    }

    return {
      eyebrow: authConfig.netlify.inviteOnly ? 'Invite-only beta' : 'Welcome back',
      title: 'Interview Simulator',
      body: authConfig.netlify.inviteOnly
        ? 'Sign in with an invited email, or request access if you need a beta spot.'
        : 'Sign in or create an account to start practicing.',
      submit: 'Log In',
    };
  }, [mode]);

  const submitAccessRequest = async (requestEmail: string, username: string): Promise<void> => {
    const formData = new URLSearchParams({
      'form-name': REQUEST_ACCESS_FORM_NAME,
      subject: REQUEST_ACCESS_SUBJECT,
      email: requestEmail,
      username,
      source_path: getCurrentLocation(),
      'bot-field': '',
    });

    const response = await fetch('/__forms.html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new Error('Unable to send the access request. Please try again.');
    }
  };

  const resetFormFeedback = () => {
    setLocalError(null);
    setNotice(null);
  };

  const handleModeChange = (nextMode: AuthMode) => {
    resetFormFeedback();
    setPassword('');
    setPasswordConfirmation('');
    setMode(nextMode);
  };

  const handleGoogleLogin = async () => {
    resetFormFeedback();
    setIsSubmitting(true);

    try {
      await auth.oauthLogin('google', { redirectTo: getCurrentLocation() });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Google sign-in failed.');
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFormFeedback();
    setIsSubmitting(true);

    try {
      if (mode === 'request') {
        if (!email.trim()) {
          throw new Error('Enter your email address.');
        }

        const username = displayName.trim();
        if (!username) throw new Error('Choose a username.');

        await submitAccessRequest(email.trim(), username);
        setEmail('');
        setDisplayName('');
        setNotice('Request sent. If a spot is available, you will receive an invite email.');
        return;
      }

      if (mode === 'invite' || mode === 'reset') {
        const passwordError = validatePassword(password, passwordConfirmation);
        if (passwordError) throw new Error(passwordError);

        if (mode === 'invite') {
          const username = displayName.trim();
          if (!username) throw new Error('Choose a username.');

          const token = auth.callbackState?.type === 'invite' ? auth.callbackState.token : null;
          if (!token) throw new Error('This invite link is missing its token.');

          await auth.acceptInvite({
            token,
            password,
            displayName: username,
            redirectTo: authConfig.loginRedirectPath,
          });
          setNotice('Account ready. Opening the simulator…');
          return;
        }

        await auth.updatePassword({ password, redirectTo: authConfig.loginRedirectPath });
        setNotice('Password saved. Opening the simulator…');
        return;
      }

      if (!email.trim()) {
        throw new Error('Enter your email address.');
      }

      if (!password) {
        throw new Error('Enter your password.');
      }

      if (mode === 'signup') {
        const username = displayName.trim();
        if (!username) throw new Error('Choose a username.');

        const passwordError = validatePassword(password, passwordConfirmation);
        if (passwordError) throw new Error(passwordError);

        const result = await auth.signup({
          email: email.trim(),
          password,
          displayName: username,
          redirectTo: getCurrentLocation(),
        });

        if (result.status === 'confirmation_required') {
          setNotice('Check your email to confirm the account before signing in.');
        }
        return;
      }

      await auth.login({ email: email.trim(), password, redirectTo: getCurrentLocation() });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="home-view authGateView" data-testid="auth-screen">
      <div className="home-content authGateCard">
        <div className="authGateEyebrow">{modeCopy.eyebrow}</div>
        <h1>{modeCopy.title}</h1>
        <p>{modeCopy.body}</p>

        <div className="authGateMeta">
          <span className="tag cool">provider: {auth.provider}</span>
          <span className="tag">{canUseSignup ? 'signup open' : 'invite only'}</span>
        </div>

        {canUseGoogle && (
          <button
            className="btn authOAuthButton"
            data-testid="auth-google-button"
            disabled={isSubmitting}
            onClick={() => void handleGoogleLogin()}
            type="button"
          >
            Continue with Google
          </button>
        )}

        {!forcedPasswordMode && (
          <div className="authModeTabs" role="tablist" aria-label="Authentication options">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`authModeTab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => handleModeChange('login')}
            >
              Log In
            </button>
            {canUseSignup && (
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                className={`authModeTab ${mode === 'signup' ? 'active' : ''}`}
                onClick={() => handleModeChange('signup')}
              >
                Sign Up
              </button>
            )}
            {!canUseSignup && (
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'request'}
                className={`authModeTab ${mode === 'request' ? 'active' : ''}`}
                onClick={() => handleModeChange('request')}
              >
                Request Access
              </button>
            )}
          </div>
        )}

        {(auth.error || localError) && (
          <div className="authGateError" data-testid="auth-error-message">
            {localError ?? auth.error}
          </div>
        )}

        {notice && (
          <div className="authGateNotice" data-testid="auth-notice-message">
            {notice}
          </div>
        )}

        <form
          className="authForm"
          name={mode === 'request' ? REQUEST_ACCESS_FORM_NAME : undefined}
          method="POST"
          data-netlify={mode === 'request' ? 'true' : undefined}
          onSubmit={handleSubmit}
        >
          {mode === 'request' && (
            <>
              <input type="hidden" name="form-name" value={REQUEST_ACCESS_FORM_NAME} />
              <input type="hidden" name="subject" value={REQUEST_ACCESS_SUBJECT} />
              <input type="hidden" name="source_path" value={getCurrentLocation()} />
              <p className="netlifyHoneypot">
                <label>
                  Do not fill this out:
                  <input name="bot-field" tabIndex={-1} />
                </label>
              </p>
            </>
          )}

          {(mode === 'login' || mode === 'signup' || mode === 'request') && (
            <label className="authField">
              <span>Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
          )}

          {(mode === 'signup' || mode === 'invite' || mode === 'request') && (
            <label className="authField">
              <span>Username</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                type="text"
                autoComplete="username"
                placeholder="username"
              />
            </label>
          )}

          {mode !== 'request' && (
            <label className="authField">
              <span>Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="Password"
              />
            </label>
          )}

          {showPasswordConfirmation && (
            <label className="authField">
              <span>Confirm Password</span>
              <input
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password"
              />
            </label>
          )}

          <button className="btn primary authSubmit" data-testid="auth-submit-button" disabled={isSubmitting}>
            {isSubmitting ? 'Working…' : modeCopy.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
