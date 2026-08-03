import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch (e) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // CRITICAL: If returning from OAuth callback, skip the /me check.
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const loginWithToken = useCallback((token, userData) => {
    localStorage.setItem("token", token);
    setUser(userData);
    // Hydrate the full profile (is_admin, verified, etc.) after storing the token.
    api.get("/auth/me").then((res) => setUser(res.data)).catch(() => {});
  }, []);

  const updateRegion = useCallback(async (region) => {
    await api.put("/settings/region", { region });
    setUser((prev) => (prev ? { ...prev, region } : prev));
  }, []);

  const viewAs = useCallback(async (targetUser) => {
    // Stash the admin's own token once, then switch to the short-lived read-only token.
    if (!sessionStorage.getItem("adminToken")) {
      const current = localStorage.getItem("token");
      if (current) sessionStorage.setItem("adminToken", current);
    }
    const res = await api.post(`/admin/users/${targetUser.user_id}/impersonate`);
    localStorage.setItem("token", res.data.token);
    const me = await api.get("/auth/me");
    setUser(me.data);
    return res.data;
  }, []);

  const exitViewAs = useCallback(async () => {
    const adminToken = sessionStorage.getItem("adminToken");
    if (adminToken) {
      localStorage.setItem("token", adminToken);
      sessionStorage.removeItem("adminToken");
    }
    try {
      const me = await api.get("/auth/me");
      setUser(me.data);
    } catch {
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      console.error("Logout request failed", e);
    }
    sessionStorage.removeItem("adminToken");
    localStorage.removeItem("token");
    setUser(null);
    window.location.href = "/login";
  }, []);

  const value = useMemo(
    () => ({ user, setUser, loading, loginWithToken, logout, checkAuth, updateRegion, viewAs, exitViewAs }),
    [user, loading, loginWithToken, logout, checkAuth, updateRegion, viewAs, exitViewAs]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
