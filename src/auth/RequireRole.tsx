import type { PropsWithChildren, ReactNode } from 'react';
import { useAuth } from './useAuth';

interface RequireRoleProps extends PropsWithChildren {
  roles: string[];
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}

export function RequireRole({ children, roles, fallback = null, loadingFallback = null }: RequireRoleProps) {
  const auth = useAuth();

  if (!auth.isLoaded) {
    return <>{loadingFallback}</>;
  }

  if (!auth.isAuthenticated) {
    return <>{fallback}</>;
  }

  if (roles.length === 0 || auth.hasAnyRole(roles)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
