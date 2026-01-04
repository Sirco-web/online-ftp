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

  const login = async (email, password) => {
    const data = await api.post('/api/auth/login', { email, password }, csrfToken);
    setUser(data.user);
    setCsrfToken(data.csrfToken);
    return data;
  };

  const register = async (email, password) => {
    const data = await api.post('/api/auth/register', { email, password }, csrfToken);
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
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
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
