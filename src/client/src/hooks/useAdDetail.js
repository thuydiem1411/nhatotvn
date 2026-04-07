import { useEffect, useState } from "react";
import { fetchAdDetail } from "../api/listingApi.js";

export function useAdDetail(adId) {
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  useEffect(() => {
    let active = true;
    if (!adId) {
      setDetail(null);
      setDetailError(null);
      setLoadingDetail(false);
      return undefined;
    }

    async function loadDetail() {
      setLoadingDetail(true);
      setDetailError(null);
      try {
        const data = await fetchAdDetail(adId);
        if (!active) return;
        setDetail(data);
      } catch (err) {
        if (!active) return;
        setDetailError(err.message || String(err));
      } finally {
        if (active) setLoadingDetail(false);
      }
    }

    loadDetail();
    return () => {
      active = false;
    };
  }, [adId]);

  return { detail, loadingDetail, detailError };
}

