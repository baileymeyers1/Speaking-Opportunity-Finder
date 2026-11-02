import { createContext, useState, useEffect, type ReactNode } from 'react';
import { apiClient } from '../api/client';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    preferredIndustries?: string[]
  ) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

interface AuthCookieResponse {
  user: User;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check the session cookie once on mount; a cancelled check (StrictMode
  // remount, provider unmount) must not touch state afterwards.
  useEffect(() => {
    let active = true;
    apiClient
      .get<User>('/auth/me')
      .then((response) => {
        if (active && response.data) setUser(response.data);
      })
      .catch(() => {
        // No valid cookie — user is not authenticated
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const response = await apiClient.post<AuthCookieResponse>('/auth/login', {
      email,
      password,
    });

    if (response.data) {
      setUser(response.data.user);
    }
  };

  const register = async (
    email: string,
    password: string,
    preferredIndustries?: string[]
  ) => {
    const response = await apiClient.post<AuthCookieResponse>(
      '/auth/register',
      {
        email,
        password,
        preferredIndustries,
      }
    );

    if (response.data) {
      setUser(response.data.user);
    }
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout', {});
    } catch {
      // Clear local state even if server call fails
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
