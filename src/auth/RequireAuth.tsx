import type { PropsWithChildren, ReactNode } from 'react';
import { useAuth } from './useAuth';

interface RequireAuthProps extends PropsWithChildren {
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}

export function RequireAuth({ children, fallback = null, loadingFallback = null }: RequireAuthProps) {
  const auth = useAuth();

  if (!auth.isLoaded) {
    return <>{loadingFallback}</>;
  }

  if (!auth.isAuthenticated) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
