import React from "react";
import { AdCard } from "./AdCard.jsx";

function ListingSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="h-52 w-full bg-slate-200" />
      <div className="grid gap-2 p-4">
        <div className="h-4 w-4/5 rounded bg-slate-200" />
        <div className="h-4 w-2/5 rounded bg-slate-200" />
        <div className="h-3 w-3/5 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-200" />
        <div className="mt-2 h-9 w-full rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}

export function AdsList({ items, loading, hasMore, onLoadMore, onOpenDetail, isFavorite, onToggleFavorite }) {
  const showSkeleton = loading && items.length === 0;
  const showEmpty = !loading && items.length === 0;
  const showOverlayLoading = loading && items.length > 0;

  return (
    <div className="relative">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {showSkeleton
          ? Array.from({ length: 6 }).map((_, idx) => <ListingSkeleton key={`skeleton-${idx}`} />)
          : null}
        {items.map((ad) => (
          <AdCard
            key={ad.ad_id}
            ad={ad}
            onOpenDetail={onOpenDetail}
            isFavorite={isFavorite ? isFavorite(ad.ad_id) : false}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
      {showOverlayLoading ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/55 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span className="text-sm font-medium text-slate-700">Dang tai du lieu...</span>
          </div>
        </div>
      ) : null}

      {showEmpty ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-sm font-medium text-slate-700">Không tìm thấy tin phù hợp</p>
          <p className="mt-1 text-xs text-slate-500">
            Thử nới lỏng bộ lọc khu vực, giá hoặc từ khóa để có thêm kết quả.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-center">
        {hasMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Dang tai them..." : "Load more"}
          </button>
        ) : (
          <p className="text-sm text-slate-500">No more items.</p>
        )}
      </div>
    </div>
  );
}

