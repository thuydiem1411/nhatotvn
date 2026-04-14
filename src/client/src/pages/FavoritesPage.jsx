import React, { useState } from "react";
import { AdsList } from "../components/listing/AdsList.jsx";

export function FavoritesPage({ favoriteItems, isFavorite, onToggleFavorite, loading = false, error = "" }) {
  const [selectedAdId, setSelectedAdId] = useState(null);

  return (
    <main className="grid gap-4">
      <header className="rounded-2xl bg-slate-900 p-5 text-white shadow-lg">
        <h1 className="text-2xl font-bold">Favorites</h1>
        <p className="mt-1 text-sm text-slate-200">Tin ban da danh dau se hien thi o day.</p>
      </header>
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Error: {error}</p> : null}
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <AdsList
          items={Array.isArray(favoriteItems) ? favoriteItems : []}
          loading={loading}
          hasMore={false}
          onLoadMore={() => {}}
          onOpenDetail={(adId) => setSelectedAdId(adId)}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
        />
      </section>
      {selectedAdId ? (
        <p className="text-xs text-slate-500">Chi tiet cho ad #{selectedAdId} co the mo tu trang Ads.</p>
      ) : null}
    </main>
  );
}

