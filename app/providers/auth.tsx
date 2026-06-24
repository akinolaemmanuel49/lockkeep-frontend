import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { User } from "~/types";
import { ACCESS_TOKEN_KEY, clearSession, getSessionItem, setAccessToken, setRefreshToken } from "~/utils/sessionStorage";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User, accessToken: string, refreshToken?: string) => void;
  logout: () => void;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const USER_KEY = "vault_user";
export const CREDENTIALS_META = "vault_credentials_meta";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = sessionStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  const login = useCallback((userData: User, accessToken: string, refreshToken?: string) => {
    sessionStorage.setItem(USER_KEY, JSON.stringify(userData));
    setAccessToken(accessToken);
    if (refreshToken) {
      setRefreshToken(refreshToken);
    }
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const getAccessToken = useCallback(() => {
    return getSessionItem(ACCESS_TOKEN_KEY);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: user !== null, login, logout, getAccessToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}