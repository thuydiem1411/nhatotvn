import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAdsList } from "../api/listingApi.js";

const DEFAULT_LIMIT = 30;
const DEFAULT_FILTERS = {
  category: "all",
  area_v2: "",
  ward: "",
  price_min: "2000000",
  price_max: "4000000",
  company: "personal",
  q: "",
  only_backup: true,
  include_disliked: false,
  sort: "newest",
};

function areFiltersEqual(a, b) {
  const keys = Object.keys(DEFAULT_FILTERS);
  return keys.every((key) => a?.[key] === b?.[key]);
}

function loadInitialFiltersFromUrl() {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  return parseFiltersFromSearch(window.location.search);
}

function parseFiltersFromSearch(search) {
  const params = new URLSearchParams(search || "");
  const out = { ...DEFAULT_FILTERS };
  if (params.get("category")) out.category = params.get("category");
  if (params.get("area_v2")) out.area_v2 = params.get("area_v2");
  if (params.get("ward")) out.ward = params.get("ward");
  if (params.get("price_min")) out.price_min = params.get("price_min");
  if (params.get("price_max")) out.price_max = params.get("price_max");
  if (params.get("company")) out.company = params.get("company");
  if (params.get("q")) out.q = params.get("q");
  if (params.get("sort")) out.sort = params.get("sort");
  if (params.has("only_backup")) {
    out.only_backup = params.get("only_backup") === "true";
  }
  if (params.has("include_disliked")) {
    const raw = params.get("include_disliked");
    out.include_disliked = raw === "1" || raw === "true";
  }
  return out;
}

export function useAdsList() {
  const [filters, setFiltersState] = useState(loadInitialFiltersFromUrl);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(DEFAULT_LIMIT);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const suppressUrlWriteRef = useRef(false);
  const firstUrlSyncRef = useRef(true);

  const setFilters = useCallback((next) => {
    setFiltersState((prev) => {
      if (typeof next === "function") return next(prev);
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (suppressUrlWriteRef.current) {
      suppressUrlWriteRef.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    // Clear previous filter keys first, but preserve unrelated keys (e.g. view mode).
    Object.keys(DEFAULT_FILTERS).forEach((k) => params.delete(k));
    Object.entries(filters).forEach(([key, value]) => {
      if (value === "" || value === null || value === undefined) return;
      if (key === "only_backup") {
        if (value === true) params.set(key, "true");
        return;
      }
      if (value === false) return;
      params.set(key, String(value));
    });
    const next = params.toString();
    const nextUrl = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    if (firstUrlSyncRef.current) {
      firstUrlSyncRef.current = false;
      window.history.replaceState({}, "", nextUrl);
    } else if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
      window.history.pushState({}, "", nextUrl);
    }
  }, [filters]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function handlePopState() {
      suppressUrlWriteRef.current = true;
      const parsed = parseFiltersFromSearch(window.location.search);
      setFiltersState((prev) => {
        // Ignore hash/history changes that do not actually change filter state.
        if (areFiltersEqual(prev, parsed)) return prev;
        return parsed;
      });
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadFirstPage() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAdsList({
          ...filters,
          only_backup: filters.only_backup ? "true" : "false",
          include_disliked: filters.include_disliked ? "1" : "0",
          offset: 0,
          limit,
        });
        if (!active) return;
        const nextItems = Array.isArray(data.items) ? data.items : [];
        setItems(nextItems);
        setTotal(Number.isFinite(Number(data.total)) ? Number(data.total) : nextItems.length);
        setOffset(Number(data.offset || 0) + Number(data.limit || limit));
        setHasMore(Boolean(data.has_more));
      } catch (err) {
        if (!active) return;
        setError(err.message || String(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadFirstPage();
    return () => {
      active = false;
    };
  }, [filters, limit, refreshSeed]);

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdsList({
        ...filters,
        only_backup: filters.only_backup ? "true" : "false",
        include_disliked: filters.include_disliked ? "1" : "0",
        offset,
        limit,
      });
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setItems((prev) => {
        const merged = [...prev, ...nextItems];
        setTotal(Number.isFinite(Number(data.total)) ? Number(data.total) : merged.length);
        return merged;
      });
      setOffset(Number(data.offset || offset) + Number(data.limit || limit));
      setHasMore(Boolean(data.has_more));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  function refresh() {
    setRefreshSeed((prev) => prev + 1);
  }

  return {
    filters,
    setFilters,
    items,
    total,
    hasMore,
    loading,
    error,
    loadMore,
    refresh,
  };
}

