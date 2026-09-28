import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // The session lives in an httpOnly cookie, so the client cannot read it
  // directly — it has to ask the server once on boot before it knows whether
  // to render the app or the login screen.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api('/auth/session')
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // `identifier` is a username or an e-mail address. It travels as `username`
  // because that is what POST /api/auth/login has always called the field.
  const login = useCallback(async (identifier, password) => {
    const data = await api('/auth/login', { body: { username: identifier, password } });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
