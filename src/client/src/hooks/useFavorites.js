import { useCallback, useEffect, useMemo, useState } from "react";
import { addFavorite, fetchMyFavorites, removeFavorite } from "../api/listingApi.js";

export function useFavorites(userId) {
  const [items, setItems] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);

  const reloadFavorites = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setFavoriteIds([]);
      return;
    }
    const r = await fetchMyFavorites(userId);
    const list = Array.isArray(r?.items) ? r.items : [];
    setItems(list);
    setFavoriteIds(list.map((x) => String(x.ad_id)));
  }, [userId]);

  useEffect(() => {
    reloadFavorites().catch(() => {
      setItems([]);
      setFavoriteIds([]);
    });
  }, [reloadFavorites]);

  const idSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const isFavorite = useCallback((adId) => idSet.has(String(adId)), [idSet]);

  const toggleFavorite = useCallback(
    async (adId) => {
      if (!userId) return;
      const id = String(adId);
      if (idSet.has(id)) {
        await removeFavorite(userId, id);
      } else {
        await addFavorite(userId, id);
      }
      await reloadFavorites();
    },
    [idSet, reloadFavorites, userId]
  );

  const removeFavoriteById = useCallback(
    async (adId) => {
      if (!userId) return;
      await removeFavorite(userId, adId);
      await reloadFavorites();
    },
    [reloadFavorites, userId]
  );

  return { favoriteIds, favoriteItems: items, isFavorite, toggleFavorite, removeFavorite: removeFavoriteById, reloadFavorites };
}

