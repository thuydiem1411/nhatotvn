import React, { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function parseAdLatLng(ad) {
  const lat = Number(ad?.latitude);
  const lng = Number(ad?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
    return [lat, lng];
  }

  const raw = ad?.location;
  if (typeof raw === "string" && raw.includes(",")) {
    const [latRaw, lngRaw] = raw.split(",");
    const lat2 = Number(latRaw);
    const lng2 = Number(lngRaw);
    if (Number.isFinite(lat2) && Number.isFinite(lng2) && lat2 !== 0 && lng2 !== 0) {
      return [lat2, lng2];
    }
  }

  return null;
}

export function InlineAdMap({ ad, visible }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const latLng = useMemo(() => parseAdLatLng(ad), [ad]);

  useEffect(() => {
    if (!visible || !mapElRef.current || !latLng) return undefined;
    if (!mapRef.current) {
      const map = L.map(mapElRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView(latLng, 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);
      markerRef.current = L.circleMarker(latLng, {
        radius: 7,
        color: "#7a0000",
        weight: 1,
        fillColor: "#e11d48",
        fillOpacity: 0.8,
      }).addTo(map);
      mapRef.current = map;
    } else {
      mapRef.current.setView(latLng, 15);
      if (markerRef.current) markerRef.current.setLatLng(latLng);
    }

    const resizeTimer = window.setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 80);

    return () => window.clearTimeout(resizeTimer);
  }, [visible, latLng]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  if (!latLng) return null;

  return (
    <div className={visible ? "mt-2" : "mt-2 hidden"}>
      <div ref={mapElRef} className="h-48 w-full overflow-hidden rounded-xl border border-slate-200" />
    </div>
  );
}

