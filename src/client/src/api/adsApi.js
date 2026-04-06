const API_BASE = "/api";

function toQueryString(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  return search.toString();
}

export async function fetchAdsList(params) {
  const query = toQueryString(params);
  const res = await fetch(`${API_BASE}/ads?${query}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ads list (${res.status})`);
  }
  return res.json();
}

export async function fetchAdsMapPoints(params) {
  const query = toQueryString(params);
  const res = await fetch(`${API_BASE}/ads/map?${query}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch map points (${res.status})`);
  }
  return res.json();
}

export async function fetchAdDetail(adId) {
  const res = await fetch(`${API_BASE}/ads/${adId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ad detail (${res.status})`);
  }
  return res.json();
}

export async function fetchRegionTree(region = 13000) {
  const res = await fetch(`${API_BASE}/regions?region=${region}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch region tree (${res.status})`);
  }
  return res.json();
}

export async function fetchSellerPhones(accountOid) {
  const res = await fetch(`${API_BASE}/sellers/${accountOid}/phones`);
  if (!res.ok) {
    throw new Error(`Failed to fetch seller phones (${res.status})`);
  }
  return res.json();
}

export async function fetchAndSyncSellerPhones(accountOid) {
  const res = await fetch(`${API_BASE}/sellers/${accountOid}/phones/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch/sync seller phones (${res.status})`);
  }
  return res.json();
}

