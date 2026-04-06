import { useEffect, useMemo, useState } from "react";
import { fetchRegionTree } from "../api/adsApi.js";

export function useRegionTree(regionId = 13000, selectedArea = "") {
  const [tree, setTree] = useState({ region: null, areas: [] });
  const [loadingRegion, setLoadingRegion] = useState(false);
  const [regionError, setRegionError] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadingRegion(true);
      setRegionError(null);
      try {
        const data = await fetchRegionTree(regionId);
        if (!active) return;
        setTree({
          region: data?.region || null,
          areas: Array.isArray(data?.areas) ? data.areas : [],
        });
      } catch (err) {
        if (!active) return;
        setRegionError(err.message || String(err));
      } finally {
        if (active) setLoadingRegion(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [regionId]);

  const wards = useMemo(() => {
    if (!selectedArea) return [];
    const area = tree.areas.find((a) => String(a.area_v2) === String(selectedArea));
    return area?.wards || [];
  }, [tree.areas, selectedArea]);

  return {
    region: tree.region,
    areas: tree.areas,
    wards,
    loadingRegion,
    regionError,
  };
}

