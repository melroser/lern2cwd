import { authConfig } from '../auth/config';
import { useAuth } from '../auth/useAuth';

export function AuthDebugPanel() {
  const auth = useAuth();

  if (!authConfig.debugEnabled) {
    return null;
  }

  return (
    <aside className="authDebugPanel" data-testid="auth-debug-panel">
      <div className="authDebugTitle">Auth Debug</div>
      <div><strong>provider:</strong> {auth.provider}</div>
      <div><strong>isAuthenticated:</strong> {String(auth.isAuthenticated)}</div>
      <div><strong>roles:</strong> {auth.user?.roles.join(', ') || '(none)'}</div>
      <pre>{JSON.stringify(auth.user, null, 2)}</pre>
    </aside>
  );
}
