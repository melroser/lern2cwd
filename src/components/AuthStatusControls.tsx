import { authConfig } from '../auth/config';
import { useAuth } from '../auth/useAuth';

export function AuthStatusControls() {
  const auth = useAuth();

  if (!auth.isAuthenticated || !auth.user) {
    return null;
  }

  const identityLabel = auth.user.displayName ?? auth.user.email ?? auth.profileKey ?? 'Signed In';

  return (
    <>
      <div className="pill" data-testid="auth-user-pill">
        <span>USER</span>
        <span style={{ color: 'var(--cool)' }}>{identityLabel}</span>
      </div>
      <button
        className="btn subtle"
        data-testid="logout-button"
        onClick={() => void auth.logout({ redirectTo: authConfig.logoutRedirectPath })}
      >
        Log Out
      </button>
    </>
  );
}
