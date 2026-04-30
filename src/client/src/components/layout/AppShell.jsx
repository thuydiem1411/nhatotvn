import React from "react";

const MENU_ITEMS = [
  { key: "ads", label: "Ads", href: "/" },
  { key: "favorites", label: "Favorites", href: "/favorites" },
  { key: "disliked", label: "Disliked", href: "/disliked" },
  { key: "alerts", label: "Alerts", href: "/alerts" },
  { key: "settings", label: "Settings", href: "/settings" },
];

export function AppShell({ currentPath, user, onLogout, children }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:px-6">
          <a href="/" className="text-base font-semibold text-slate-900">
            RoomListing
          </a>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-600">
            {user ? (
              <>
                <span className="rounded-full bg-slate-100 px-3 py-1">Hi, {user.username}</span>
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                >
                  Logout
                </button>
              </>
            ) : (
              <a href="/settings" className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50">
                Login
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-4 md:grid-cols-[220px_minmax(0,1fr)] md:px-6">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:sticky md:top-[72px] md:h-fit">
          <nav className="grid gap-1">
            {MENU_ITEMS.map((item) => {
              const active = item.href === "/" ? currentPath === "/" : currentPath.startsWith(item.href);
              return (
                <a
                  key={item.key}
                  href={item.href}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </aside>

        <section>{children}</section>
      </div>
    </div>
  );
}

