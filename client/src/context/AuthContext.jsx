import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api/client.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Restore the session (cookie) on first load.
  useEffect(() => {
    api.get('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  // Any 401 from the API means the session ended: drop to the login screen with a hint.
  useEffect(() => {
    setUnauthorizedHandler(() => { setUser(null); setSessionExpired(true); });
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    setSessionExpired(false);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
    setSessionExpired(false);
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout, sessionExpired }), [user, ready, login, logout, sessionExpired]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
