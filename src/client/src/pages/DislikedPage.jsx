import React, { useState } from "react";
import { AdsList } from "../components/listing/AdsList.jsx";
import { useAdDetail } from "../hooks/useAdDetail.js";
import { AdDetailModal } from "../components/detail/AdDetailModal.jsx";

export function DislikedPage({
  dislikedItems,
  isFavorite,
  isDisliked,
  onToggleFavorite,
  onToggleDisliked,
  loading = false,
  error = "",
}) {
  const [selectedAdId, setSelectedAdId] = useState(null);
  const { detail, loadingDetail, detailError } = useAdDetail(selectedAdId);

  return (
    <main className="grid gap-4">
      <header className="rounded-2xl bg-slate-900 p-5 text-white shadow-lg">
        <h1 className="text-2xl font-bold">Disliked</h1>
        <p className="mt-1 text-sm text-slate-200">Danh sách tin bạn đã ẩn khỏi ads list mặc định.</p>
      </header>
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Error: {error}</p> : null}
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <AdsList
          items={Array.isArray(dislikedItems) ? dislikedItems : []}
          loading={loading}
          hasMore={false}
          onLoadMore={() => {}}
          onOpenDetail={(adId) => setSelectedAdId(adId)}
          isFavorite={isFavorite}
          isDisliked={isDisliked}
          onToggleFavorite={onToggleFavorite}
          onToggleDisliked={onToggleDisliked}
        />
      </section>
      <AdDetailModal
        adId={selectedAdId}
        detail={detail}
        loading={loadingDetail}
        error={detailError}
        isFavorite={selectedAdId ? isFavorite?.(selectedAdId) : false}
        isDisliked={selectedAdId ? isDisliked?.(selectedAdId) : false}
        onToggleFavorite={onToggleFavorite}
        onToggleDisliked={onToggleDisliked}
        onShareCurrent={() => {}}
        onClose={() => setSelectedAdId(null)}
      />
    </main>
  );
}
