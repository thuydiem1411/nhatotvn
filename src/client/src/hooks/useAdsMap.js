import { useEffect, useState } from "react";
import { fetchAdsMapPoints } from "../api/adsApi.js";

export function useAdsMap(filters) {
  const [points, setPoints] = useState([]);
  const [loadingMap, setLoadingMap] = useState(false);
  const [mapError, setMapError] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadMap() {
      setLoadingMap(true);
      setMapError(null);
      try {
        const data = await fetchAdsMapPoints({
          ...filters,
          only_backup: filters.only_backup ? "true" : "false",
        });
        if (!active) return;
        setPoints(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        if (!active) return;
        setMapError(err.message || String(err));
      } finally {
        if (active) setLoadingMap(false);
      }
    }

    loadMap();
    return () => {
      active = false;
    };
  }, [filters]);

  return { points, loadingMap, mapError };
}

