import {
  createContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { apiClient } from '../api/client';
import type { User, AuthResponse } from '../types';

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
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const token = apiClient.getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiClient.get<User>('/auth/me');
      if (response.data) {
        setUser(response.data);
      }
    } catch {
      apiClient.setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const response = await apiClient.post<AuthResponse>('/auth/login', {
      email,
      password,
    });

    if (response.data) {
      apiClient.setToken(response.data.token);
      setUser(response.data.user);
    }
  };

  const register = async (
    email: string,
    password: string,
    preferredIndustries?: string[]
  ) => {
    const response = await apiClient.post<AuthResponse>('/auth/register', {
      email,
      password,
      preferredIndustries,
    });

    if (response.data) {
      apiClient.setToken(response.data.token);
      setUser(response.data.user);
    }
  };

  const logout = () => {
    apiClient.setToken(null);
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
