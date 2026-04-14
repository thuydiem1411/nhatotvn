import React, { useEffect, useState } from "react";
import { fetchNotificationSettings, savePushmoreSettings } from "../api/listingApi.js";

export function SettingsPage({ user, onLogin, onRegister }) {
  const [authMode, setAuthMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  const [pushmoreUrl, setPushmoreUrl] = useState("");
  const canManagePushmore = Boolean(user?.id);
  useEffect(() => {
    let alive = true;
    if (!canManagePushmore) {
      setPushmoreUrl("");
      return;
    }
    fetchNotificationSettings(user.id)
      .then((r) => {
        if (!alive) return;
        setPushmoreUrl(r?.pushmore?.webhook_url || "");
      })
      .catch(() => {
        if (!alive) return;
        setPushmoreUrl("");
      });
    return () => {
      alive = false;
    };
  }, [canManagePushmore, user?.id]);

  async function submitAuth(e) {
    e.preventDefault();
    setStatus("");
    try {
      if (authMode === "login") {
        await onLogin({ username, password });
        setStatus("Login success.");
      } else {
        await onRegister({ username, email, password });
        setStatus("Register success.");
      }
      setPassword("");
    } catch (err) {
      setStatus(err?.message || String(err));
    }
  }

  async function savePushmore() {
    if (!canManagePushmore) return;
    await savePushmoreSettings(user.id, { webhook_url: String(pushmoreUrl || "").trim(), is_enabled: true });
    setStatus("Saved Pushmore webhook.");
  }

  return (
    <main className="grid gap-4">
      <header className="rounded-2xl bg-slate-900 p-5 text-white shadow-lg">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-slate-200">Login don gian + Pushmore webhook theo tung user.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 inline-flex rounded-xl border border-slate-300 bg-white p-1">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${authMode === "login" ? "bg-slate-900 text-white" : "text-slate-700"}`}
            onClick={() => setAuthMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${authMode === "register" ? "bg-slate-900 text-white" : "text-slate-700"}`}
            onClick={() => setAuthMode("register")}
          >
            Register
          </button>
        </div>
        <form className="grid gap-2 md:max-w-lg" onSubmit={submitAuth}>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="password (plain text)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
            {authMode === "login" ? "Login" : "Create account"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-slate-900">Pushmore</h2>
        {!canManagePushmore ? (
          <p className="text-sm text-slate-600">Please login to manage your Pushmore webhook.</p>
        ) : (
          <div className="grid gap-2 md:max-w-2xl">
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="https://pushmore.example/webhook"
              value={pushmoreUrl}
              onChange={(e) => setPushmoreUrl(e.target.value)}
            />
            <button type="button" onClick={savePushmore} className="w-fit rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
              Save webhook
            </button>
          </div>
        )}
      </section>

      {status ? <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{status}</p> : null}
    </main>
  );
}

