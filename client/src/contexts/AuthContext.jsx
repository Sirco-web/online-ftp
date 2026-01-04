import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [csrfToken, setCsrfToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const data = await api.get('/api/auth/me');
      setUser(data.user);
      setCsrfToken(data.csrfToken);
    } catch (err) {
      setUser(null);
      // Get CSRF token anyway for login form
      try {
        const tokenData = await api.get('/api/auth/csrf-token');
        setCsrfToken(tokenData.csrfToken);
      } catch (e) {
        console.error('Failed to get CSRF token');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Refresh user data (useful for updating storage info)
  const refreshUser = async () => {
    try {
      const data = await api.get('/api/auth/me');
      setUser(data.user);
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  };

  const login = async (email, password) => {
    const data = await api.post('/api/auth/login', { email, password }, csrfToken);
    setUser(data.user);
    setCsrfToken(data.csrfToken);
    return data;
  };

  const register = async (email, password, ownerPin) => {
    const data = await api.post('/api/auth/register', { email, password, ownerPin }, csrfToken);
    setUser(data.user);
    setCsrfToken(data.csrfToken);
    return data;
  };

  const logout = async () => {
    await api.post('/api/auth/logout', {}, csrfToken);
    setUser(null);
    // Get new CSRF token
    const tokenData = await api.get('/api/auth/csrf-token');
    setCsrfToken(tokenData.csrfToken);
  };

  const value = {
    user,
    csrfToken,
    loading,
    login,
    register,
    logout,
    refreshUser,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin' || user?.role === 'owner',
    isOwner: user?.isOwner || user?.role === 'owner',
    storageQuota: user?.storage_quota || 5368709120,
    storageUsed: user?.storage_used || 0,
    hasUnlimitedStorage: user?.storage_quota === -1,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
