import React, { useEffect, useRef, useState } from "react";
import { buildImageCandidates, reconstructCloudinaryUrl } from "../../utils/imageResolver.js";
import { fetchSellerPhones } from "../../api/listingApi.js";
import { InlineAdMap } from "../map/InlineAdMap.jsx";
import Hls from "hls.js";
import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveVideoUrl(videoItem) {
  if (typeof videoItem === "string") return videoItem;
  if (!videoItem || typeof videoItem !== "object") return "";
  return videoItem.url || videoItem.thumbnail || videoItem.gif_url || "";
}

function isM3u8(url) {
  return typeof url === "string" && /\.m3u8(\?|$)/i.test(url);
}

function extractFilename(url) {
  if (!url || typeof url !== "string") return "";
  const clean = url.split("?")[0].split("#")[0];
  const parts = clean.split("/");
  return parts.length ? parts[parts.length - 1] : "";
}

function formatDateTime(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "N/A";
  const candidates = [n, n * 1000, Math.floor(n / 1000)];
  const dates = candidates.map((v) => new Date(v)).filter((d) => Number.isFinite(d.getTime()));
  if (!dates.length) return "N/A";
  return dates[0].toLocaleString("vi-VN");
}

function formatPriceValue(detail) {
  if (detail?.price_string) return detail.price_string;
  if (detail?.price == null) return "N/A";
  return `${Number(detail.price || 0).toLocaleString("vi-VN")} đ`;
}

function buildGallerySlots(primaryImages, backups) {
  const primaries = Array.isArray(primaryImages) ? primaryImages.filter(Boolean) : [];
  const bakList = Array.isArray(backups) ? backups : [];
  const backupByKey = new Map();
  bakList.forEach((b) => {
    const key = typeof b?.src === "string" ? b.src : "";
    const url = reconstructCloudinaryUrl(b?.bak, b?.c);
    if (!key || !url || backupByKey.has(key)) return;
    backupByKey.set(key, url);
  });

  const slots = [];
  const primaryNames = new Set();
  primaries.forEach((url, idx) => {
    const name = extractFilename(url);
    if (name) primaryNames.add(name);
    slots.push({
      id: `p-${idx}-${name || "na"}`,
      current: url,
      fallback: name ? backupByKey.get(name) || "" : "",
    });
  });

  bakList.forEach((b, idx) => {
    const key = typeof b?.src === "string" ? b.src : "";
    const url = reconstructCloudinaryUrl(b?.bak, b?.c);
    if (!url) return;
    if (key && primaryNames.has(key)) return;
    slots.push({
      id: `b-${idx}-${key || "na"}`,
      current: url,
      fallback: "",
    });
  });

  return slots;
}

function HlsVideoPlayer({ url }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return undefined;

    // Safari can play HLS natively.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      return undefined;
    }

    // Other browsers use hls.js.
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
      };
    }

    return undefined;
  }, [url]);

  return (
    <video
      ref={videoRef}
      controls
      className="h-52 w-full rounded-lg bg-black object-cover"
      preload="metadata"
      playsInline
    />
  );
}

export function AdDetailModal({
  adId,
  detail,
  loading,
  error,
  onClose,
  onShareCurrent,
  isFavorite = false,
  onToggleFavorite,
}) {
  if (!adId) return null;

  const imageCandidates = buildImageCandidates(detail?.images || [], detail?.imgs_bak || []);
  const [gallerySlots, setGallerySlots] = useState([]);
  const galleryRootRef = useRef(null);
  const [phones, setPhones] = useState([]);
  const [loadingPhones, setLoadingPhones] = useState(false);
  const [phoneError, setPhoneError] = useState(null);

  useEffect(() => {
    let active = true;
    async function loadOtherPhones() {
      if (!detail?.account_oid) {
        setPhones([]);
        setPhoneError(null);
        setLoadingPhones(false);
        return;
      }
      setLoadingPhones(true);
      setPhoneError(null);
      try {
        const data = await fetchSellerPhones(detail.account_oid);
        if (!active) return;
        setPhones(toOtherPhones(data?.phones));
      } catch (err) {
        if (!active) return;
        setPhoneError(err.message || String(err));
      } finally {
        if (active) setLoadingPhones(false);
      }
    }
    loadOtherPhones();
    return () => {
      active = false;
    };
  }, [detail?.ad_id, detail?.account_oid]);

  useEffect(() => {
    setGallerySlots(buildGallerySlots(detail?.images || [], detail?.imgs_bak || []));
  }, [detail?.ad_id, detail?.images, detail?.imgs_bak]);

  useEffect(() => {
    if (!galleryRootRef.current) return undefined;
    Fancybox.bind(galleryRootRef.current, "[data-fancybox='ad-gallery']", {
      compact: false,
      dragToClose: false,
      Thumbs: { autoStart: false },
      Images: {
        // Allow much stronger zoom than default.
        Panzoom: {
          maxScale: 12,
          step: 0.35,
        },
        zoom: true,
      },
      wheel: "zoom",
      contentClick: "toggleCover",
      doubleClick: "iterateZoom",
    });
    return () => {
      Fancybox.unbind(galleryRootRef.current);
      Fancybox.close();
    };
  }, [detail?.ad_id, gallerySlots.length, imageCandidates.length]);

  function toOtherPhones(list) {
    const currentPhone = detail?.phone ? String(detail.phone).trim() : "";
    const currentListId = detail?.list_id != null ? String(detail.list_id) : "";
    return (Array.isArray(list) ? list : []).filter((p) => {
      const ph = p?.phone != null ? String(p.phone).trim() : "";
      const src = p?.source_ad_id != null ? String(p.source_ad_id) : "";
      if (!ph) return false;
      if (currentPhone && ph === currentPhone) return false;
      if (currentListId && src && src === currentListId) return false;
      return true;
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 p-3"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Chi tiết tin #{adId}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleFavorite && onToggleFavorite(adId)}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-base transition ${
                isFavorite
                  ? "border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100"
                  : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
              }`}
              aria-label={isFavorite ? "Unfavorite ad" : "Favorite ad"}
              title={isFavorite ? "Bo yeu thich" : "Yeu thich"}
            >
              <i className={`mdi ${isFavorite ? "mdi-heart" : "mdi-heart-outline"}`} />
            </button>
            <button
              type="button"
              onClick={onShareCurrent}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100"
            >
              Share căn này
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Đóng
            </button>
          </div>
        </div>

        {loading && <p className="text-sm text-slate-600">Đang tải chi tiết...</p>}
        {error && <p className="text-sm text-red-600">Error: {error}</p>}

        {!loading && !error && detail && (
          <div className="grid gap-4">
            <h3 className="text-xl font-semibold text-slate-900">{detail.subject || "(No subject)"}</h3>

            <div className="grid gap-3 md:grid-cols-3">
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-800">Thông tin chính</p>
                <div className="grid gap-1 text-sm text-slate-700">
                  <p>
                    Giá: <strong className="text-rose-600">{formatPriceValue(detail)}</strong>
                  </p>
                  <p>Diện tích: <strong>{detail.size || "N/A"} m2</strong></p>
                  <p>Mã tin: <strong>{detail.ad_id ?? "N/A"}</strong></p>
                  <p>List ID: <strong>{detail.list_id ?? "N/A"}</strong></p>
                  <p>
                    Loại:{" "}
                    <strong>{String(detail.category) === "1050" ? "Phòng trọ" : String(detail.category) === "1020" ? "Nhà ở" : "Khác"}</strong>
                  </p>
                  <p>
                    Người đăng:{" "}
                    <strong>{detail.company_ad ? "Môi giới" : "Chính chủ"}</strong>
                  </p>
                  <p>Ngày đăng: <strong>{formatDateTime(detail.list_time)}</strong></p>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-800">Liên hệ & địa chỉ</p>
                <div className="grid gap-1 text-sm text-slate-700">
                  <p>
                    Seller:{" "}
                    {detail.account_oid ? (
                      <a href={`/seller/${encodeURIComponent(detail.account_oid)}`} className="font-medium text-blue-600 hover:underline">
                        {detail.full_name || detail.account_name || "Unknown"}
                      </a>
                    ) : (
                      <span>{detail.full_name || detail.account_name || "Unknown"}</span>
                    )}
                  </p>
                  <p>
                    Phone:{" "}
                    <strong>{detail.phone || "Hidden/Unavailable"}</strong>
                  </p>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-sm font-medium text-slate-800">Số phone khác theo account</p>
              {loadingPhones ? <p className="text-xs text-slate-500">Đang tải số phone khác...</p> : null}
              {phoneError ? <p className="text-xs text-red-600">{phoneError}</p> : null}
              {!loadingPhones && !phoneError && phones.length === 0 ? (
                <p className="text-xs text-slate-500">Không có số phone khác.</p>
              ) : null}
              {phones.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {phones.map((p) => (
                    <span key={`${p.phone}-${p.source_ad_id || "na"}`} className="rounded-full bg-white px-2 py-1 text-xs text-slate-700">
                      {p.phone}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
                  <p>
                    Address:{" "}
                    <strong>{[detail.street_number, detail.street_name, detail.ward_name, detail.area_name].filter(Boolean).join(", ") || "N/A"}</strong>
                  </p>
                  <p>
                    Area/Ward:{" "}
                    <strong>{detail.area_name || "N/A"} / {detail.ward_name || "N/A"}</strong>
                  </p>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-800">Bản đồ</p>
                <InlineAdMap ad={detail} visible />
              </section>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <span className="rounded-full bg-slate-100 px-2 py-1">Ảnh: {detail.number_of_images || imageCandidates.length || 0}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1">Video: {asArray(detail.videos).length}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1">Rating: {detail.average_rating ?? "N/A"}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1">Status: {detail.status || "N/A"}</span>
            </div>
            {detail.list_id && (
              <p className="text-sm text-slate-700 break-words">
                Link nhanh:{" "}
                <a
                  href={`https://www.chotot.com/mua-ban-nha-dat/${detail.list_id}.htm`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-600 hover:underline"
                >
                  <i className="mdi mdi-link"></i> Bài đăng
                </a>
                <a href={`https://www.chotot.com/user/${detail.account_oid}`} target="_blank" rel="noreferrer" className=" ml-2 font-medium text-blue-600 hover:underline"><i className="mdi mdi-account"></i> Tài khoản</a>
                <a href={`https://chat.chotot.com/chatroom/join/${window.btoa(`${detail.account_id}|${detail.list_id}`)}`} target="_blank" rel="noreferrer" className=" ml-2 font-medium text-blue-600 hover:underline"><i className="mdi mdi-message"></i> Chat nhanh</a>
              </p>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-sm font-semibold text-slate-800">Mô tả chi tiết</p>
              <p className="whitespace-pre-line text-sm leading-6 text-slate-700">{detail.body || "No description"}</p>
            </section>

            <div ref={galleryRootRef}>
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Media</h4>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {gallerySlots.slice(0, 16).map((slot, idx) => (
                  <a key={slot.id} href={slot.current} data-fancybox="ad-gallery" data-caption={`Ảnh ${idx + 1}`}>
                    <img
                      src={slot.current}
                      alt={`ad-${detail.ad_id}-img-${idx}`}
                      className="h-32 w-full rounded-lg bg-slate-100 object-cover"
                      onError={() => {
                        setGallerySlots((prev) => {
                          const next = [...prev];
                          const cur = next[idx];
                          if (!cur) return prev;
                          if (cur.fallback && cur.current !== cur.fallback) {
                            next[idx] = { ...cur, current: cur.fallback };
                            return next;
                          }
                          next[idx] = { ...cur, current: "https://placehold.co/600x400?text=Image+Not+Available" };
                          return next;
                        });
                      }}
                    />
                  </a>
                ))}
              </div>
            </div>

            {asArray(detail.videos).length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-800">Videos</h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {asArray(detail.videos).slice(0, 10).map((videoItem, idx) => {
                    const url = resolveVideoUrl(videoItem);
                    if (!url) return null;
                    return (
                      <article key={`${url}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                        {isM3u8(url) ? (
                          <HlsVideoPlayer url={url} />
                        ) : (
                          <video
                            src={url}
                            controls
                            className="h-52 w-full rounded-lg bg-black object-cover"
                            preload="metadata"
                            playsInline
                          />
                        )}
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block break-all text-xs text-blue-600 hover:underline"
                        >
                          Mở link video
                        </a>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

