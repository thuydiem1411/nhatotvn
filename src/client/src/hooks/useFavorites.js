import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDisliked,
  addFavorite,
  fetchMyDisliked,
  fetchMyFavorites,
  removeDisliked,
  removeFavorite,
} from "../api/listingApi.js";

export function useFavorites(userId) {
  const [items, setItems] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [dislikedItems, setDislikedItems] = useState([]);
  const [dislikedIds, setDislikedIds] = useState([]);

  const reloadFavorites = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setFavoriteIds([]);
      setDislikedItems([]);
      setDislikedIds([]);
      return;
    }
    const [fav, disliked] = await Promise.all([fetchMyFavorites(userId), fetchMyDisliked(userId)]);
    const favoriteList = Array.isArray(fav?.items) ? fav.items : [];
    const dislikedList = Array.isArray(disliked?.items) ? disliked.items : [];
    setItems(favoriteList);
    setFavoriteIds(favoriteList.map((x) => String(x.ad_id)));
    setDislikedItems(dislikedList);
    setDislikedIds(dislikedList.map((x) => String(x.ad_id)));
  }, [userId]);

  useEffect(() => {
    reloadFavorites().catch(() => {
      setItems([]);
      setFavoriteIds([]);
      setDislikedItems([]);
      setDislikedIds([]);
    });
  }, [reloadFavorites]);

  const idSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const dislikedSet = useMemo(() => new Set(dislikedIds), [dislikedIds]);
  const isFavorite = useCallback((adId) => idSet.has(String(adId)), [idSet]);
  const isDisliked = useCallback((adId) => dislikedSet.has(String(adId)), [dislikedSet]);

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

  const toggleDisliked = useCallback(
    async (adId) => {
      if (!userId) return;
      const id = String(adId);
      if (dislikedSet.has(id)) {
        await removeDisliked(userId, id);
      } else {
        await addDisliked(userId, id);
      }
      await reloadFavorites();
    },
    [dislikedSet, reloadFavorites, userId]
  );

  const removeDislikedById = useCallback(
    async (adId) => {
      if (!userId) return;
      await removeDisliked(userId, adId);
      await reloadFavorites();
    },
    [reloadFavorites, userId]
  );

  return {
    favoriteIds,
    favoriteItems: items,
    dislikedIds,
    dislikedItems,
    isFavorite,
    isDisliked,
    toggleFavorite,
    toggleDisliked,
    removeFavorite: removeFavoriteById,
    removeDisliked: removeDislikedById,
    reloadFavorites,
  };
}

