import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile } from '../types/index.ts';
import { apiRequest } from '../api/client.ts';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  dbConnected: boolean;
  dbError: string | null;
  login: (data: UserProfile) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  refreshDbStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Store ONLY the user's public profile (never the token!)
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbConnected, setDbConnected] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  const refreshDbStatus = async () => {
    try {
      const res = await apiRequest<{ status: string; database: { connected: boolean; error: string | null } }>(
        '/api/health'
      );
      if (res.data?.database) {
        setDbConnected(res.data.database.connected);
        setDbError(res.data.database.error);
      }
    } catch {
      // ignore
    }
  };

  const checkAuth = async () => {
    setLoading(true);
    await refreshDbStatus();

    try {
      const res = await apiRequest<UserProfile>('/api/auth/me');
      if (res.success && res.data) {
        setUser(res.data);
      } else {
        setUser(null);
        if (res.error === 'DATABASE_NOT_CONFIGURED') {
          setDbConnected(false);
          setDbError(res.message || null);
        }
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();

    const handleUnauthorized = () => {
      setUser(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = (userData: UserProfile) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        dbConnected,
        dbError,
        login,
        logout,
        checkAuth,
        refreshDbStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
