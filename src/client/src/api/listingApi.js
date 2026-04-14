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

export async function fetchSellerProfile(accountOid) {
  const res = await fetch(`${API_BASE}/sellers/${accountOid}/profile`);
  if (!res.ok) {
    throw new Error(`Failed to fetch seller profile (${res.status})`);
  }
  return res.json();
}

export async function fetchAlertRules() {
  const userId = window.localStorage.getItem("rl_user_id");
  const suffix = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const res = await fetch(`${API_BASE}/alert-rules${suffix}`);
  if (!res.ok) throw new Error(`Failed to fetch alert rules (${res.status})`);
  return res.json();
}

export async function createAlertRule(payload) {
  const userId = window.localStorage.getItem("rl_user_id");
  const res = await fetch(`${API_BASE}/alert-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(payload || {}), user_id: userId ? Number(userId) : null }),
  });
  if (!res.ok) throw new Error(`Failed to create alert rule (${res.status})`);
  return res.json();
}

export async function updateAlertRule(id, payload) {
  const res = await fetch(`${API_BASE}/alert-rules/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) throw new Error(`Failed to update alert rule (${res.status})`);
  return res.json();
}

export async function deleteAlertRule(id) {
  const res = await fetch(`${API_BASE}/alert-rules/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete alert rule (${res.status})`);
  return res.json();
}

export async function registerUser(payload) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) throw new Error(`Failed to register (${res.status})`);
  return res.json();
}

export async function loginUser(payload) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) throw new Error(`Failed to login (${res.status})`);
  return res.json();
}

export async function fetchMe(userId) {
  const res = await fetch(`${API_BASE}/auth/me?user_id=${encodeURIComponent(String(userId || ""))}`);
  if (!res.ok) throw new Error(`Failed to fetch me (${res.status})`);
  return res.json();
}

export async function fetchMyFavorites(userId) {
  const res = await fetch(`${API_BASE}/me/favorites?user_id=${encodeURIComponent(String(userId || ""))}`);
  if (!res.ok) throw new Error(`Failed to fetch favorites (${res.status})`);
  return res.json();
}

export async function addFavorite(userId, adId) {
  const res = await fetch(`${API_BASE}/me/favorites/${encodeURIComponent(String(adId))}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: Number(userId) }),
  });
  if (!res.ok) throw new Error(`Failed to add favorite (${res.status})`);
  return res.json();
}

export async function removeFavorite(userId, adId) {
  const res = await fetch(
    `${API_BASE}/me/favorites/${encodeURIComponent(String(adId))}?user_id=${encodeURIComponent(String(userId || ""))}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(`Failed to remove favorite (${res.status})`);
  return res.json();
}

export async function fetchNotificationSettings(userId) {
  const res = await fetch(`${API_BASE}/me/settings/notifications?user_id=${encodeURIComponent(String(userId || ""))}`);
  if (!res.ok) throw new Error(`Failed to fetch notification settings (${res.status})`);
  return res.json();
}

export async function savePushmoreSettings(userId, payload) {
  const res = await fetch(`${API_BASE}/me/settings/notifications/pushmore`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: Number(userId),
      webhook_url: payload?.webhook_url || "",
      is_enabled: payload?.is_enabled !== false,
    }),
  });
  if (!res.ok) throw new Error(`Failed to save pushmore settings (${res.status})`);
  return res.json();
}

