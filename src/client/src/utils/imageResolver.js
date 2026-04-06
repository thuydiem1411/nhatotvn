function extractFilename(url) {
  if (!url || typeof url !== "string") return "";
  const clean = url.split("?")[0].split("#")[0];
  const parts = clean.split("/");
  return parts.length ? parts[parts.length - 1] : "";
}

export function reconstructCloudinaryUrl(bak, cloudName) {
  if (!bak || typeof bak !== "string") return "";
  if (bak.startsWith("http")) return bak;
  if (!cloudName) return "";
  return `https://res.cloudinary.com/${cloudName}/image/upload/${bak}`;
}

function backupUrlByFilename(backups) {
  const map = new Map();
  (Array.isArray(backups) ? backups : []).forEach((b) => {
    const src = typeof b?.src === "string" ? b.src : "";
    const url = reconstructCloudinaryUrl(b?.bak, b?.c);
    if (!src || !url) return;
    if (!map.has(src)) map.set(src, url);
  });
  return map;
}

// Order policy:
// 1) Primary kind-image URL
// 2) Matched backup URL by filename (fallback)
// 3) Backup-only URLs whose src is not present in primary images
export function buildImageCandidates(primaryImages, backups) {
  const list = [];
  const seen = new Set();
  const pImages = Array.isArray(primaryImages) ? primaryImages.filter(Boolean) : [];
  const bMap = backupUrlByFilename(backups);
  const primaryNames = new Set();

  pImages.forEach((url) => {
    const name = extractFilename(url);
    if (name) primaryNames.add(name);
    if (!seen.has(url)) {
      list.push(url);
      seen.add(url);
    }
    const fallback = name ? bMap.get(name) : "";
    if (fallback && !seen.has(fallback)) {
      list.push(fallback);
      seen.add(fallback);
    }
  });

  (Array.isArray(backups) ? backups : []).forEach((b) => {
    const src = typeof b?.src === "string" ? b.src : "";
    const url = reconstructCloudinaryUrl(b?.bak, b?.c);
    if (!url) return;
    if (src && primaryNames.has(src)) return;
    if (!seen.has(url)) {
      list.push(url);
      seen.add(url);
    }
  });

  return list;
}

