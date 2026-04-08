import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Configure marker icon paths for Vite bundling.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function parseLatLng(point) {
  const hasNum = point.latitude != null && point.longitude != null;
  if (hasNum) {
    const lat = Number(point.latitude);
    const lng = Number(point.longitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat !== 0 && lng !== 0) {
      return [lat, lng];
    }
  }

  if (typeof point.location === "string" && point.location.includes(",")) {
    const [latRaw, lngRaw] = point.location.split(",");
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat !== 0 && lng !== 0) {
      return [lat, lng];
    }
  }
  return null;
}

function interpolateColor(startHex, endHex, t) {
  const sh = startHex.replace("#", "");
  const eh = endHex.replace("#", "");
  const sr = Number.parseInt(sh.slice(0, 2), 16);
  const sg = Number.parseInt(sh.slice(2, 4), 16);
  const sb = Number.parseInt(sh.slice(4, 6), 16);
  const er = Number.parseInt(eh.slice(0, 2), 16);
  const eg = Number.parseInt(eh.slice(2, 4), 16);
  const eb = Number.parseInt(eh.slice(4, 6), 16);
  const r = Math.round(sr + (er - sr) * t);
  const g = Math.round(sg + (eg - sg) * t);
  const b = Math.round(sb + (eb - sb) * t);
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getPriceColor(value, minV, maxV) {
  if (!Number.isFinite(value)) return "#cccccc";
  const range = Math.max(1, maxV - minV);
  let t = (value - minV) / range;
  t = Math.max(0, Math.min(1, t));
  return interpolateColor("#fee5e5", "#b30000", t);
}

function formatMoneyVND(amount) {
  if (!amount) return "Liên hệ";
  return `${Number(amount || 0).toLocaleString("vi-VN")} đ`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildAddress(ad) {
  if (ad?.address) return String(ad.address);
  return [ad?.street_number, ad?.street_name, ad?.ward_name, ad?.area_name].filter(Boolean).join(", ");
}

export function MapPanel({ points, onSelectAd }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const markersRef = useRef(null);
  const autoFitDoneRef = useRef(false);
  const mapInteractedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Create map only once and keep it across rerenders.
    const map = L.map(containerRef.current, {
      preferCanvas: true,
    }).setView([10.775, 106.7], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    mapRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);
    map.on("dragstart zoomstart", () => {
      mapInteractedRef.current = true;
    });
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;
    const group = markersRef.current;
    group.clearLayers();

    const grouped = new Map();
    const allPrices = [];
    points.forEach((point) => {
      const latlng = parseLatLng(point);
      if (!latlng) return;
      const priceNum = Number(point.price || 0);
      if (Number.isFinite(priceNum) && priceNum >= 0) allPrices.push(priceNum);
      const key = `${latlng[0].toFixed(6)},${latlng[1].toFixed(6)}`;
      if (!grouped.has(key)) {
        grouped.set(key, { latlng, ads: [] });
      }
      grouped.get(key).ads.push(point);
    });
    const minP = allPrices.length ? Math.min(...allPrices) : 0;
    const maxP = allPrices.length ? Math.max(...allPrices) : 1;

    const bounds = [];
    const renderer = L.canvas({ padding: 0.5 });
    grouped.forEach(({ latlng, ads }) => {
      const sample = ads[0] || {};
      const groupPrices = ads
        .map((a) => Number(a.price || 0))
        .filter((v) => Number.isFinite(v) && v >= 0);
      const avgPrice = groupPrices.length
        ? groupPrices.reduce((a, b) => a + b, 0) / groupPrices.length
        : 0;
      const color = getPriceColor(avgPrice, minP, maxP);
      const marker = L.circleMarker(latlng, {
        renderer,
        radius: 8,
        color: "#7a0000",
        weight: 1,
        opacity: 0.8,
        fillColor: color,
        fillOpacity: 0.7,
      });

      const firstPriceStr =
        (sample.price_string && String(sample.price_string).split("/tháng")[0]) ||
        formatMoneyVND(sample.price);
      const tooltipText = ads.length === 1 ? firstPriceStr : `${ads.length} tin - từ ${firstPriceStr}`;
      marker.bindTooltip(tooltipText, {
        permanent: false,
        direction: "top",
        offset: [0, -10],
      });

      const itemsHtml = ads
        .map((a) => {
          const companyLabel = a.company_ad ? "Môi giới" : "Chính chủ";
          const companyIcon = a.company_ad ? "mdi-account-tie" : "mdi-account-check";
          const categoryLabel = String(a.category) === "1050" ? "Phòng trọ" : "Nhà ở";
          const categoryIcon = String(a.category) === "1050" ? "mdi-bed" : "mdi-home-city";
          const pStr =
            (a.price_string && String(a.price_string).split("/tháng")[0]) ||
            formatMoneyVND(a.price);
          const address = buildAddress(a);
          return `
            <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;">
              <div style="font-size:13px;font-weight:600;color:#0f172a;">${escapeHtml(a.subject || "Không có tiêu đề")}</div>
              <div style="font-size:13px;font-weight:700;color:#e11d48;">${escapeHtml(pStr)}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
                <span style="font-size:11px;color:#be123c;background:#fff1f2;padding:2px 8px;border-radius:999px;"><i class="mdi ${companyIcon}"></i> ${companyLabel}</span>
                <span style="font-size:11px;color:#0f766e;background:#ecfeff;padding:2px 8px;border-radius:999px;"><i class="mdi ${categoryIcon}"></i> ${categoryLabel}</span>
              </div>
              <div style="font-size:11px;color:#475569;margin-top:4px;"><i class="mdi mdi-map-marker-outline"></i> ${escapeHtml(address || "Chưa có địa chỉ")}</div>
              <div style="font-size:11px;color:#475569;margin-top:2px;"><i class="mdi mdi-phone-outline"></i> ${escapeHtml(a.phone || "An/khong co")}</div>
              <div style="margin-top:6px;">
                <button data-ad-id="${a.ad_id}" class="open-detail-btn" style="border:0;border-radius:8px;background:#0f172a;color:#fff;font-size:12px;font-weight:600;padding:6px 10px;cursor:pointer;">Xem chi tiết</button>
              </div>
            </div>
          `;
        })
        .join("");

      marker.bindPopup(
        `<div style="min-width:240px;max-height:320px;overflow:auto;font-family:system-ui,sans-serif;">
          <div style="margin-bottom:6px;font-size:12px;color:#64748b;">${ads.length} tin tại vị trí này</div>
          ${itemsHtml}
        </div>`
      );
      marker.on("popupopen", (event) => {
        const popupEl = event.popup?.getElement?.();
        const btns = popupEl?.querySelectorAll?.(".open-detail-btn");
        if (!btns) return;
        btns.forEach((btn) => {
          const adId = btn.getAttribute("data-ad-id");
          if (!adId) return;
          btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelectAd(adId);
          };
        });
      });
      marker.addTo(group);
      bounds.push(latlng);
    });

    // Avoid expensive fitBounds on every filter change once user interacted with map.
    const shouldAutoFit = !mapInteractedRef.current && (!autoFitDoneRef.current || grouped.size <= 300);
    if (bounds.length > 0 && shouldAutoFit) {
      mapRef.current.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 });
      autoFitDoneRef.current = true;
    }
  }, [points, onSelectAd]);

  return <div ref={containerRef} style={{ height: 380, borderRadius: 8, border: "1px solid #ddd" }} />;
}

