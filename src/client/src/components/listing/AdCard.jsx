import React, { useEffect, useMemo, useState } from "react";
import { buildImageCandidates, reconstructCloudinaryUrl } from "../../utils/imageResolver.js";
import { InlineAdMap } from "../map/InlineAdMap.jsx";

function formatPrice(ad) {
  if (ad.price_string) return ad.price_string;
  if (ad.price == null) return "N/A";
  return `${Number(ad.price).toLocaleString("vi-VN")} VND`;
}

function formatDate(ad) {
  if (!ad.list_time) return "Unknown time";
  const raw = Number(ad.list_time);
  if (!Number.isFinite(raw)) return "Unknown time";

  // Accept both seconds and milliseconds timestamps from mixed sources.
  const candidates = [raw, raw * 1000, raw / 1000]
    .map((v) => new Date(v))
    .filter((d) => Number.isFinite(d.getTime()));

  if (!candidates.length) return "Unknown time";

  const now = Date.now();
  const best = candidates.reduce((picked, current) => {
    const currentYear = current.getFullYear();
    const pickedYear = picked.getFullYear();
    const currentPlausible = currentYear >= 2000 && currentYear <= 2100;
    const pickedPlausible = pickedYear >= 2000 && pickedYear <= 2100;
    if (currentPlausible && !pickedPlausible) return current;
    if (!currentPlausible && pickedPlausible) return picked;
    return Math.abs(current.getTime() - now) < Math.abs(picked.getTime() - now) ? current : picked;
  });

  return best.toLocaleString("vi-VN");
}

function extractFilename(url) {
  if (!url || typeof url !== "string") return "";
  const clean = url.split("?")[0].split("#")[0];
  const parts = clean.split("/");
  return parts.length ? parts[parts.length - 1] : "";
}

export function AdCard({ ad, onOpenDetail }) {
  const backups = useMemo(() => (Array.isArray(ad.imgs_bak) ? ad.imgs_bak : []), [ad.imgs_bak]);
  const candidates = useMemo(() => buildImageCandidates(ad.images || [], backups), [ad.images, backups]);
  const backupCandidates = useMemo(() => buildImageCandidates([], backups), [backups]);
  const backupBySourceKey = useMemo(() => {
    const map = new Map();
    backups.forEach((b) => {
      const key = typeof b?.src === "string" ? b.src : "";
      const url = reconstructCloudinaryUrl(b?.bak, b?.c);
      if (!key || !url) return;
      if (!map.has(key)) map.set(key, url);
    });
    return map;
  }, [backups]);
  const [thumbIdx, setThumbIdx] = useState(0);
  const [forcedSrc, setForcedSrc] = useState("");
  const [showInlineMap, setShowInlineMap] = useState(false);
  const thumb = forcedSrc || candidates[thumbIdx] || "";

  useEffect(() => {
    setThumbIdx(0);
    setForcedSrc("");
  }, [ad.ad_id, candidates.length]);
  useEffect(() => {
    setShowInlineMap(false);
  }, [ad.ad_id]);
  const address = `${ad.street_number || ""} ${ad.street_name || ""}, ${ad.ward_name || ""}, ${ad.area_name || ad.area_v2 || ""}`
    .replace(/\s+,/g, ",")
    .replace(/^,\s*/, "")
    .trim();

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      {thumb && (
        <img
          src={thumb}
          alt={`ad-${ad.ad_id}-thumb`}
          className="h-52 w-full bg-slate-100 object-cover"
          loading="lazy"
          onError={() => {
            const currentSrc = forcedSrc || candidates[thumbIdx] || "";
            if (!forcedSrc) {
              // Prefer backup matched by backup_source_key of the failing primary.
              const key = extractFilename(currentSrc);
              const matchedBackup = key ? backupBySourceKey.get(key) : "";
              if (matchedBackup && matchedBackup !== currentSrc) {
                setForcedSrc(matchedBackup);
                return;
              }
              setThumbIdx((prev) => {
                if (prev + 1 >= candidates.length) return prev;
                return prev + 1;
              });
              return;
            }

            // Already in backup mode: try next backup URL.
            if (backupCandidates.length > 0) {
              const currentIdx = backupCandidates.findIndex((u) => u === currentSrc);
              if (currentIdx >= 0 && currentIdx + 1 < backupCandidates.length) {
                setForcedSrc(backupCandidates[currentIdx + 1]);
                return;
              }
            }

            setForcedSrc("https://placehold.co/600x400?text=Image+Not+Available");
          }}
        />
      )}
      <div className="grid gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-800">
            {ad.subject || "(No subject)"}
          </h3>
          <span className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
            #{ad.ad_id}
          </span>
        </div>

        <p className="text-lg font-bold text-rose-600">{formatPrice(ad)}</p>
        <p className="text-xs text-slate-500">{formatDate(ad)}</p>
        <div className="flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${
              ad.company_ad ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            <i className={`mdi ${ad.company_ad ? "mdi-account-tie" : "mdi-account-check"} text-sm`} />
            {ad.company_ad ? "Môi giới" : "Chính chủ"}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${
              String(ad.category) === "1050" ? "bg-cyan-50 text-cyan-700" : "bg-lime-50 text-lime-700"
            }`}
          >
            <i className={`mdi ${String(ad.category) === "1050" ? "mdi-bed" : "mdi-home-city"} text-sm`} />
            {String(ad.category) === "1050" ? "Phòng trọ" : "Nhà ở"}
          </span>
        </div>
        <p className="line-clamp-1 text-xs text-slate-600">{address || "No address"}</p>
        <div className="line-clamp-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <i className="mdi mdi-phone-outline text-sm" />
            {ad.phone || "An/khong co"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <span
            className={`rounded-full px-2 py-1 text-[11px] font-medium ${
              ad.has_img_backup_ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {ad.has_img_backup_ok ? "Backup OK" : "Chưa backup"}
          </span>
          {ad.size ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-700">{ad.size} m2</span> : null}
        </div>

        <button
          type="button"
          onClick={() => onOpenDetail(ad.ad_id)}
          className="mt-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Xem chi tiết
        </button>
        <button
          type="button"
          onClick={() => setShowInlineMap((v) => !v)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {showInlineMap ? "Ẩn vị trí" : "Xem vị trí"}
        </button>
        <InlineAdMap ad={ad} visible={showInlineMap} />
      </div>
    </article>
  );
}

