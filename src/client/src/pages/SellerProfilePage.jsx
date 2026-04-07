import React, { useEffect, useMemo, useState } from "react";
import { fetchSellerProfile } from "../api/listingApi.js";
import { AdsList } from "../components/listing/AdsList.jsx";
import { useAdDetail } from "../hooks/useAdDetail.js";
import { AdDetailModal } from "../components/detail/AdDetailModal.jsx";

export function SellerProfilePage({ accountOid, onBack }) {
  const [data, setData] = useState({ seller: null, phones: [], listings: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedAdId, setSelectedAdId] = useState(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("ad_id");
  });
  const { detail, loading: loadingDetail, error: detailError } = useAdDetail(selectedAdId);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!accountOid) return;
      setLoading(true);
      setError("");
      try {
        const profile = await fetchSellerProfile(accountOid);
        if (!alive) return;
        setData({
          seller: profile?.seller || null,
          phones: Array.isArray(profile?.phones) ? profile.phones : [],
          listings: Array.isArray(profile?.listings) ? profile.listings : [],
        });
      } catch (e) {
        if (!alive) return;
        setError(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [accountOid]);

  const sellerName = data?.seller?.full_name || `Seller ${accountOid}`;
  const uniquePhones = useMemo(() => {
    const map = new Map();
    for (const p of data.phones) {
      const key = String(p?.phone || "").trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, p);
    }
    return Array.from(map.values());
  }, [data.phones]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (selectedAdId) params.set("ad_id", String(selectedAdId));
    else params.delete("ad_id");
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", next);
  }, [selectedAdId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function onPop() {
      const params = new URLSearchParams(window.location.search);
      setSelectedAdId(params.get("ad_id"));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Back
        </button>
        <h2 className="text-lg font-semibold text-slate-900">Seller Profile</h2>
      </div>
      <p className="text-sm text-slate-700">
        <span className="font-medium">{sellerName}</span> - account_oid: <code>{accountOid}</code>
      </p>

      {loading ? <p className="mt-3 text-sm text-slate-500">Đang tải profile seller...</p> : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <div className="mt-4 grid gap-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-sm font-medium text-slate-800">Toàn bộ số phone</p>
            {uniquePhones.length === 0 ? (
              <p className="text-xs text-slate-500">Không có dữ liệu phone.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {uniquePhones.map((p) => (
                  <span key={`${p.phone}-${p.source_ad_id || "na"}`} className="rounded-full bg-white px-2 py-1 text-xs text-slate-700">
                    {p.phone}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-sm font-medium text-slate-800">Toàn bộ bài đăng ({data.listings.length})</p>
            <AdsList
              items={data.listings}
              loading={loading}
              hasMore={false}
              onLoadMore={() => {}}
              onOpenDetail={(adId) => setSelectedAdId(String(adId))}
            />
          </div>
        </div>
      ) : null}
      <AdDetailModal
        adId={selectedAdId}
        detail={detail}
        loading={loadingDetail}
        error={detailError}
        onShareCurrent={() => {}}
        onClose={() => setSelectedAdId(null)}
      />
    </section>
  );
}

