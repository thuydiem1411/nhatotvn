import React, { useEffect, useRef, useState } from "react";
import { buildImageCandidates, reconstructCloudinaryUrl } from "../../utils/imageResolver.js";
import { fetchSellerPhones } from "../../api/listingApi.js";
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

export function AdDetailModal({ adId, detail, loading, error, onClose, onShareCurrent }) {
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
            <p className="whitespace-pre-line text-sm leading-6 text-slate-700">{detail.body || "No description"}</p>
            <p className="text-sm text-slate-700">
              Price: <strong>{detail.price_string || detail.price || "N/A"}</strong>
            </p>
            <p className="text-sm text-slate-700">
              Seller:{" "}
              {detail.account_oid ? (
                <a
                  href={`/seller/${encodeURIComponent(detail.account_oid)}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {detail.full_name || detail.account_name || "Unknown"}
                </a>
              ) : (
                <span>{detail.full_name || detail.account_name || "Unknown"}</span>
              )}
            </p>
            <p className="text-sm text-slate-700">
              Phone: {detail.phone || "Hidden/Unavailable"}
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
            <p className="text-sm text-slate-700">
              Address: {detail.street_number || ""} {detail.street_name || ""}, {detail.ward_name || ""}, {detail.area_name || ""}
            </p>
            {detail.list_id && (
              <p className="text-sm text-slate-700">
                Link on Chotot:{" "}
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

