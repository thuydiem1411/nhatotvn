import React, { useCallback, useEffect, useState } from "react";
import { AdsFilterBar } from "../components/filters/AdsFilterBar.jsx";
import { AdsList } from "../components/listing/AdsList.jsx";
import { useAdsList } from "../hooks/useAdsList.js";
import { useAdsMap } from "../hooks/useAdsMap.js";
import { useAdDetail } from "../hooks/useAdDetail.js";
import { MapPanel } from "../components/map/MapPanel.jsx";
import { AdDetailModal } from "../components/detail/AdDetailModal.jsx";
import { useRegionTree } from "../hooks/useRegionTree.js";

export function AdsPage() {
  const { filters, setFilters, items, total, hasMore, loading, error, loadMore, refresh } = useAdsList();
  const { points, loadingMap, mapError } = useAdsMap(filters);
  const { region, areas, wards, loadingRegion, regionError } = useRegionTree(13000, filters.area_v2);
  const [selectedAdId, setSelectedAdId] = useState(() => {
    if (typeof window === "undefined") return null;
    const id = new URLSearchParams(window.location.search).get("ad_id");
    return id || null;
  });
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === "undefined") return "list";
    const v = new URLSearchParams(window.location.search).get("view");
    return v === "list" || v === "map" || v === "split" ? v : "list";
  });
  const { detail, loadingDetail, detailError } = useAdDetail(selectedAdId);
  const handleSelectAd = useCallback((adId) => {
    setSelectedAdId(adId);
  }, []);
  const selectedArea = areas.find((a) => String(a.area_v2) === String(filters.area_v2));
  const selectedWard = wards.find((w) => String(w.ward_id) === String(filters.ward));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("view", viewMode);
    if (selectedAdId) {
      params.set("ad_id", String(selectedAdId));
    } else {
      params.delete("ad_id");
    }
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", next);
  }, [viewMode, selectedAdId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function handlePopState() {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("view");
      if (v === "list" || v === "map" || v === "split") {
        setViewMode(v);
      }
      const adId = params.get("ad_id");
      setSelectedAdId(adId || null);
    }
    window.addEventListener("popstate", handlePopState);
    handlePopState();
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  async function handleShareLink() {
    const href = window.location.href;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
        window.alert("Đã copy link bộ lọc/view hiện tại");
        return;
      }
    } catch {}
    window.prompt("Copy link này:", href);
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <header className="mb-4 flex flex-col gap-2 rounded-2xl bg-slate-900 p-5 text-white shadow-lg sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-bold">Chợ Tốt Listing Dashboard</h1>
        <a
          href="/admin/data-files"
          className="shrink-0 text-sm font-medium text-sky-300 underline decoration-sky-400/70 underline-offset-2 hover:text-white"
        >
          Quản lý file data (admin)
        </a>
      </header>

      <div className="mb-3 md:sticky md:top-3 md:z-[1000]">
        <AdsFilterBar
          filters={filters}
          onApply={(next) => setFilters(next)}
          areas={areas}
          wards={wards}
          regionName={region?.region_name || ""}
          loadingRegion={loadingRegion}
        />
      </div>
      {regionError ? (
        <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Region error: {regionError}
        </p>
      ) : null}

      <div className="my-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={handleShareLink}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Share link
        </button>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
          Items: {total}
        </span>
        {loading ? <span className="text-sm text-slate-500">Đang tải dữ liệu...</span> : null}
        <div className="ml-auto inline-flex rounded-xl border border-slate-300 bg-white p-1">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${viewMode === "list" ? "bg-slate-900 text-white" : "text-slate-700"}`}
            onClick={() => setViewMode("list")}
          >
            Danh sách
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${viewMode === "map" ? "bg-slate-900 text-white" : "text-slate-700"}`}
            onClick={() => setViewMode("map")}
          >
            Bản đồ
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${viewMode === "split" ? "bg-slate-900 text-white" : "text-slate-700"}`}
            onClick={() => setViewMode("split")}
          >
            Chia đôi
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {filters.category !== "all" ? (
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            Danh mục: {filters.category === "1050" ? "Phòng trọ" : "Nhà ở"}
          </span>
        ) : null}
        {selectedArea ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            Quận/Huyện: {selectedArea.area_name}
          </span>
        ) : null}
        {selectedWard ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            Phường/Xã: {selectedWard.ward_name}
          </span>
        ) : null}
        {filters.only_backup ? (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">Chỉ tin đã backup</span>
        ) : null}
        {filters.q ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">Từ khóa: {filters.q}</span>
        ) : null}
      </div>

      {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Error: {error}</p>}

      <section className="grid gap-4">
        {viewMode !== "list" ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <h2 className="mb-2 text-base font-semibold text-slate-800">Bản đồ tin đăng</h2>
            {mapError ? <p className="mb-2 rounded-lg bg-red-50 px-2 py-1 text-sm text-red-600">Map error: {mapError}</p> : null}
            {!loadingMap && !mapError && points.length === 0 ? (
              <p className="mb-2 rounded-lg bg-slate-50 px-2 py-1 text-sm text-slate-500">
                Không có điểm bản đồ cho bộ lọc hiện tại.
              </p>
            ) : null}
            {loadingMap && points.length === 0 ? (
              <div className="h-[380px] animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
            ) : (
              <div className="relative">
                <MapPanel points={points} onSelectAd={handleSelectAd} />
                {loadingMap && points.length > 0 ? (
                  <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center rounded-lg bg-white/35 backdrop-blur-[1px]">
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                      <span className="text-sm font-medium text-slate-700">Dang tai diem moi...</span>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {viewMode !== "map" ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <AdsList
              items={items}
              loading={loading}
              hasMore={hasMore}
              onLoadMore={loadMore}
              onOpenDetail={handleSelectAd}
            />
          </div>
        ) : null}
      </section>

      <AdDetailModal
        adId={selectedAdId}
        detail={detail}
        loading={loadingDetail}
        error={detailError}
        onShareCurrent={handleShareLink}
        onClose={() => setSelectedAdId(null)}
      />
    </main>
  );
}

