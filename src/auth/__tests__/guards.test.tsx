import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../AuthProvider';
import { RequireAuth } from '../RequireAuth';
import { RequireRole } from '../RequireRole';

const baseContext = {
  provider: 'netlify' as const,
  user: null,
  isLoaded: true,
  isAuthenticated: false,
  accessToken: null,
  error: null,
  profileKey: null,
  signupEnabled: false,
  login: vi.fn(),
  logout: vi.fn(),
  signup: vi.fn(),
  refreshSession: vi.fn(),
  getAccessToken: vi.fn(),
  hasRole: vi.fn(() => false),
  hasAnyRole: vi.fn(() => false),
};

describe('auth guards', () => {
  it('renders fallback while unauthenticated', () => {
    render(
      <AuthContext.Provider value={baseContext}>
        <RequireAuth fallback={<div>please log in</div>}>
          <div>secret view</div>
        </RequireAuth>
      </AuthContext.Provider>,
    );

    expect(screen.getByText('please log in')).toBeInTheDocument();
    expect(screen.queryByText('secret view')).not.toBeInTheDocument();
  });

  it('renders children when the user has one of the required roles', () => {
    render(
      <AuthContext.Provider
        value={{
          ...baseContext,
          user: {
            id: 'u1',
            email: 'admin@example.com',
            displayName: 'Admin',
            roles: ['admin'],
            authProvider: 'netlify',
          },
          isAuthenticated: true,
          profileKey: 'netlify:u1',
          hasAnyRole: vi.fn((roles: string[]) => roles.includes('admin')),
        }}
      >
        <RequireRole roles={['admin']} fallback={<div>forbidden</div>}>
          <div>admin panel</div>
        </RequireRole>
      </AuthContext.Provider>,
    );

    expect(screen.getByText('admin panel')).toBeInTheDocument();
    expect(screen.queryByText('forbidden')).not.toBeInTheDocument();
  });
});
