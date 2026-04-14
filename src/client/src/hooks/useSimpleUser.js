import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMe, loginUser, registerUser } from "../api/listingApi.js";

const SESSION_KEY = "rl_user_session_v1";
const USER_ID_KEY = "rl_user_id";

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function useSimpleUser() {
  const [session, setSession] = useState(() => {
    if (typeof window === "undefined") return null;
    return readJson(SESSION_KEY, null);
  });

  useEffect(() => {
    let alive = true;
    async function hydrate() {
      const userId = window.localStorage.getItem(USER_ID_KEY);
      if (!userId) return;
      try {
        const r = await fetchMe(userId);
        if (!alive) return;
        if (r?.user?.id) {
          writeJson(SESSION_KEY, r.user);
          setSession(r.user);
        }
      } catch {
        // Keep local session as-is on hydration failure.
      }
    }
    hydrate();
    return () => {
      alive = false;
    };
  }, []);

  const user = useMemo(() => {
    if (!session?.id) return null;
    return session;
  }, [session]);

  useEffect(() => {
    if (!session?.id) return;
    window.localStorage.setItem(USER_ID_KEY, String(session.id));
  }, [session]);

  const register = useCallback(async (payload) => {
    const r = await registerUser(payload || {});
    const safeSession = r?.user;
    if (!safeSession?.id) {
      throw new Error("Register failed");
    }
    writeJson(SESSION_KEY, safeSession);
    window.localStorage.setItem(USER_ID_KEY, String(safeSession.id));
    setSession(safeSession);
    return safeSession;
  }, []);

  const login = useCallback(async (payload) => {
    const r = await loginUser(payload || {});
    const safeSession = r?.user;
    if (!safeSession?.id) {
      throw new Error("Login failed");
    }
    writeJson(SESSION_KEY, safeSession);
    window.localStorage.setItem(USER_ID_KEY, String(safeSession.id));
    setSession(safeSession);
    return safeSession;
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(USER_ID_KEY);
    setSession(null);
  }, []);

  return { user, login, register, logout };
}

