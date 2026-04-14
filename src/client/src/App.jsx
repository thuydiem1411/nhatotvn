import React from "react";
import { AdsPage } from "./pages/AdsPage.jsx";
import { SellerProfilePage } from "./pages/SellerProfilePage.jsx";
import { AlertsPage } from "./pages/AlertsPage.jsx";
import { FavoritesPage } from "./pages/FavoritesPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { AppShell } from "./components/layout/AppShell.jsx";
import { useSimpleUser } from "./hooks/useSimpleUser.js";
import { useFavorites } from "./hooks/useFavorites.js";

function getSellerOidFromPath() {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/^\/seller\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function isAlertsPath() {
  if (typeof window === "undefined") return false;
  return /^\/alerts\/?$/.test(window.location.pathname);
}

function isFavoritesPath() {
  if (typeof window === "undefined") return false;
  return /^\/favorites\/?$/.test(window.location.pathname);
}

function isSettingsPath() {
  if (typeof window === "undefined") return false;
  return /^\/settings\/?$/.test(window.location.pathname);
}

export function App() {
  const { user, login, register, logout } = useSimpleUser();
  const { favoriteItems, isFavorite, toggleFavorite } = useFavorites(user?.id);
  const currentPath = typeof window === "undefined" ? "/" : window.location.pathname;

  if (isAlertsPath()) {
    return (
      <AppShell currentPath={currentPath} user={user} onLogout={logout}>
        <AlertsPage userId={user?.id} />
      </AppShell>
    );
  }
  if (isFavoritesPath()) {
    return (
      <AppShell currentPath={currentPath} user={user} onLogout={logout}>
        <FavoritesPage favoriteItems={favoriteItems} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} />
      </AppShell>
    );
  }
  if (isSettingsPath()) {
    return (
      <AppShell currentPath={currentPath} user={user} onLogout={logout}>
        <SettingsPage user={user} onLogin={login} onRegister={register} />
      </AppShell>
    );
  }
  const sellerOid = getSellerOidFromPath();
  if (sellerOid) {
    return (
      <AppShell currentPath={currentPath} user={user} onLogout={logout}>
        <main className="mx-auto max-w-7xl p-4 md:p-6">
          <SellerProfilePage accountOid={sellerOid} onBack={() => (window.location.href = "/")} />
        </main>
      </AppShell>
    );
  }
  return (
    <AppShell currentPath={currentPath} user={user} onLogout={logout}>
      <AdsPage isFavorite={isFavorite} onToggleFavorite={toggleFavorite} />
    </AppShell>
  );
}
