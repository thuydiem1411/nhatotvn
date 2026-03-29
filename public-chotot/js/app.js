document.addEventListener("DOMContentLoaded", async function () {
    const listEl = document.getElementById("ads-list");
    const sortEl = document.getElementById("sort");
    const filterAreaEl = document.getElementById("filter-area");
    const filterWardEl = document.getElementById("filter-ward");
    const filterCompanyEl = document.getElementById("filter-company");
    const filterCategoryEl = document.getElementById("filter-category");
    const filterOnlyBackupImgEl = document.getElementById("filter-only-backup-img");
    const searchEl = document.getElementById("search-input");
    const detailModal = new bootstrap.Modal(document.getElementById('detailModal'));
    const modalContent = document.getElementById('modalContent');
    const scrollTopBtn = document.getElementById('scrollTopBtn');
    const priceMinInput = document.getElementById('price-min');
    const priceMaxInput = document.getElementById('price-max');
    const priceRangeDisplayEl = document.getElementById('price-range-display');
    const mapContainerEl = document.getElementById('ads-map');
    const focusCoordInput = document.getElementById('focus-coord');
    const focusRadiusInput = document.getElementById('focus-radius');
    const focusBtn = document.getElementById('focus-btn');
    const clearFocusBtn = document.getElementById('clear-focus-btn');

    let allAds = [];
    let displayedCount = 20;
    let isLoading = false;
    let searchTerm = '';
    let currentAd = null;
    let priceMin = 2000000;
    let priceMax = 4000000;
    let selectedPriceMin = null;
    let selectedPriceMax = null;
    let mainMap = null;
    let markersLayer = null;
    let focusCircle = null;
    let cardMapsCache = new Map(); // Cache map instances for cards

    // Reconstruct full Cloudinary URL from cloudName + relative path
    function reconstructCloudinaryUrl(bak, cloudName) {
        if (!bak || !cloudName) return null;
        
        // If already full URL, return as-is
        if (bak.startsWith('http')) return bak;
        
        // Reconstruct: https://res.cloudinary.com/{cloudName}/image/upload/{path}
        return `https://res.cloudinary.com/${cloudName}/image/upload/${bak}`;
    }

    async function loadAds() {
        try {
            const category = filterCategoryEl?.value || 'all';
            const onlyBackup = filterOnlyBackupImgEl?.checked ? 'true' : 'false';
            const res = await fetch(`/api/ads?category=${category}&only_backup=${onlyBackup}`);
            allAds = await res.json();

            // Cập nhật tổng số
            document.getElementById('total-count').textContent = allAds.length;

            initPriceSlider();
            initMainMap();
            render();
        } catch (e) {
            console.error("Lỗi load ads:", e);
            listEl.innerHTML = `<div class="text-danger">Không thể tải dữ liệu: ${e.message}</div>`;
            document.getElementById('total-count').textContent = '0';
        }
    }

    async function loadRegions() {
        try {
            const res = await fetch("/data/regions.json");
            const data = await res.json();
            const region = data?.regionFollowId?.entities?.regions?.["13000"]; // TP.HCM
            const areas = region?.area || {};
            const areaEntries = Object.entries(areas).map(([id, info]) => ({ id, name: info.name, wards: info.wards || [] }));

            // Render Area select
            filterAreaEl.innerHTML = `<option value="">Chọn Quận/Huyện</option>` +
                areaEntries.map(a => `<option value="${a.id}">${a.name}</option>`).join("");

            // Khởi tạo Select2 (đa chọn) cho Ward
            if (window.$ && typeof window.$.fn.select2 === 'function') {
                window.$(filterWardEl).select2({
                    placeholder: 'Chọn Phường/Xã',
                    width: '100%',
                    closeOnSelect: false,
                    allowClear: true
                });
            }

            // On change area -> load wards
            filterAreaEl.addEventListener('change', () => {
                const selected = areas[filterAreaEl.value];
                const wards = selected?.wards || [];
                filterWardEl.disabled = !wards.length;
                filterWardEl.innerHTML = `<option value="">Chọn Phường/Xã</option>` +
                    wards.map(w => `<option value="${w.id}">${w.name}</option>`).join("");
                if (window.$ && typeof window.$.fn.select2 === 'function') {
                    window.$(filterWardEl).val(null).trigger('change');
                    window.$(filterWardEl).prop('disabled', !wards.length);
                }
                displayedCount = 20; // reset lazy
                render();
            });

            // On change ward -> filter
            filterWardEl.addEventListener('change', () => {
                displayedCount = 20;
                render();
            });
        } catch (e) {
            console.error('Lỗi load regions:', e);
        }
    }

    function initPriceSlider() {
        try {
            if (!priceMinInput || !priceMaxInput) return;
            const step = 500000;
            const sliderMin = 0;
            const sliderMax = 10000000;

            // Set initial selected values (ưu tiên giá trị đã khai báo)
            if (selectedPriceMin == null) selectedPriceMin = (typeof priceMin === 'number' ? priceMin : sliderMin);
            if (selectedPriceMax == null) selectedPriceMax = (typeof priceMax === 'number' ? priceMax : sliderMax);

            priceMinInput.min = String(sliderMin);
            priceMinInput.max = String(sliderMax);
            priceMinInput.step = String(step);
            priceMinInput.value = String(selectedPriceMin);
            priceMaxInput.min = String(sliderMin);
            priceMaxInput.max = String(sliderMax);
            priceMaxInput.step = String(step);
            priceMaxInput.value = String(selectedPriceMax);

            const updateDisplay = (min, max) => {
                if (!priceRangeDisplayEl) return;
                const fmt = (n) => (Number(n) || 0).toLocaleString('vi-VN') + ' đ';
                priceRangeDisplayEl.value = `${fmt(min)} - ${fmt(max)}`;
            };

            const clampAndSync = () => {
                let minVal = Number(priceMinInput.value);
                let maxVal = Number(priceMaxInput.value);
                // đảm bảo khoảng cách ít nhất bằng step
                if (minVal > maxVal - step) {
                    // ưu tiên kéo cái đang chỉnh: nếu min vượt thì đẩy max, nếu max nhỏ hơn thì kéo min
                    const active = document.activeElement === priceMinInput ? 'min' : (document.activeElement === priceMaxInput ? 'max' : null);
                    if (active === 'min') {
                        maxVal = Math.min(priceMax, minVal + step);
                        priceMaxInput.value = String(maxVal);
                    } else {
                        minVal = Math.max(priceMin, maxVal - step);
                        priceMinInput.value = String(minVal);
                    }
                }
                selectedPriceMin = minVal;
                selectedPriceMax = maxVal;
                updateDisplay(selectedPriceMin, selectedPriceMax);
            };

            // Initial display
            updateDisplay(selectedPriceMin, selectedPriceMax);

            // Events: input for live display, change for render
            priceMinInput.addEventListener('input', () => {
                clampAndSync();
            });
            priceMaxInput.addEventListener('input', () => {
                clampAndSync();
            });
            const onChangeCommit = () => {
                clampAndSync();
                displayedCount = 20;
                render();
            };
            priceMinInput.addEventListener('change', onChangeCommit);
            priceMaxInput.addEventListener('change', onChangeCommit);
        } catch (e) {
            console.warn('Lỗi khởi tạo price slider:', e);
        }
    }

    function initMainMap() {
        try {
            if (!mapContainerEl || typeof L === 'undefined') return;
            if (!mainMap) {
                // Use Canvas renderer for better performance with many markers
                mainMap = L.map(mapContainerEl.id, {
                    preferCanvas: true,
                    renderer: L.canvas()
                }).setView([10.776, 106.700], 12);
                
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 18
                }).addTo(mainMap);
                
                // Use layerGroup to display all markers (no clustering)
                markersLayer = L.layerGroup().addTo(mainMap);
                
                // Right-click on map to set focus coordinates
                mainMap.on('contextmenu', (e) => {
                    const lat = e.latlng.lat.toFixed(8);
                    const lng = e.latlng.lng.toFixed(8);
                    
                    if (focusCoordInput) {
                        focusCoordInput.value = `${lat}, ${lng}`;
                        
                        // Visual feedback: add a temporary marker
                        const tempMarker = L.marker([lat, lng], {
                            icon: L.divIcon({
                                className: 'temp-focus-marker',
                                html: '<div style="background: #0d6efd; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>',
                                iconSize: [12, 12],
                                iconAnchor: [6, 6]
                            })
                        }).addTo(mainMap);
                        
                        // Remove temp marker after 2 seconds
                        setTimeout(() => {
                            mainMap.removeLayer(tempMarker);
                        }, 2000);
                        
                        // Auto trigger focus button
                        if (focusBtn) {
                            focusBtn.click();
                        }
                    }
                });
            }

            // Focus button
            if (focusBtn && focusCoordInput && focusRadiusInput) {
                focusBtn.addEventListener('click', () => {
                    const raw = String(focusCoordInput.value || '').trim();
                    if (!raw) return;
                    const parts = raw.split(/[\,\s]+/).map(Number).filter(v => !isNaN(v));
                    if (parts.length < 2) return;
                    const lat = parts[0];
                    const lng = parts[1];
                    const km = Math.max(0, Number(focusRadiusInput.value || 2));
                    const meters = km * 1000;

                    mainMap.setView([lat, lng], 14);

                    if (focusCircle) {
                        focusCircle.setLatLng([lat, lng]);
                        focusCircle.setRadius(meters);
                    } else {
                        focusCircle = L.circle([lat, lng], {
                            radius: meters,
                            color: '#0d6efd',
                            fillColor: '#0d6efd',
                            fillOpacity: 0.08,
                            weight: 1
                        }).addTo(mainMap);
                    }

                    // Fit bounds
                    try {
                        mainMap.fitBounds(focusCircle.getBounds(), { padding: [20, 20] });
                    } catch (e) {}
                    
                    // Show clear button
                    if (clearFocusBtn) {
                        clearFocusBtn.style.display = 'inline-block';
                    }
                    
                    // Re-render markers to apply focus filter
                    render();
                });

                // Update radius on change
                focusRadiusInput.addEventListener('change', () => {
                    if (!focusCircle) return;
                    const km = Math.max(0, Number(focusRadiusInput.value || 2));
                    focusCircle.setRadius(km * 1000);
                    
                    // Re-render markers when radius changes
                    render();
                });
                
                // Clear focus button
                if (clearFocusBtn) {
                    clearFocusBtn.addEventListener('click', () => {
                        // Remove focus circle from map
                        if (focusCircle) {
                            mainMap.removeLayer(focusCircle);
                            focusCircle = null;
                        }
                        
                        // Clear input
                        focusCoordInput.value = '';
                        
                        // Hide clear button
                        clearFocusBtn.style.display = 'none';
                        
                        // Re-render to show all markers
                        render();
                    });
                }
            }
        } catch (e) {
            console.warn('Lỗi khởi tạo map:', e);
        }
    }

    // ==== Heatmap-like marker coloring by price ====
    function interpolateColor(startHex, endHex, t) {
        const sh = startHex.replace('#','');
        const eh = endHex.replace('#','');
        const sr = parseInt(sh.substring(0,2), 16), sg = parseInt(sh.substring(2,4), 16), sb = parseInt(sh.substring(4,6), 16);
        const er = parseInt(eh.substring(0,2), 16), eg = parseInt(eh.substring(2,4), 16), eb = parseInt(eh.substring(4,6), 16);
        const r = Math.round(sr + (er - sr) * t);
        const g = Math.round(sg + (eg - sg) * t);
        const b = Math.round(sb + (eb - sb) * t);
        const toHex = (n) => n.toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    function getPriceColor(value, minV, maxV) {
        if (!isFinite(value)) return '#cccccc';
        const range = Math.max(1, maxV - minV);
        let t = (value - minV) / range; // 0..1
        t = Math.max(0, Math.min(1, t));
        // rẻ (nhạt) -> đắt (đỏ đậm)
        const light = '#fee5e5';
        const deep = '#b30000';
        return interpolateColor(light, deep, t);
    }

    function createPinIcon(color) {
        const svg = `
        <svg width="30" height="46" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z" fill="${color}" stroke="#7a0000" stroke-width="1"/>
            <circle cx="12.5" cy="12.5" r="5.5" fill="#ffffff" opacity="0.9"/>
        </svg>`;
        return L.divIcon({
            html: svg,
            className: 'pin-svg-icon',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34]
        });
    }

    // Tính khoảng cách giữa 2 điểm (km)
    function getDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Bán kính Trái Đất (km)
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // (Đơn giản hóa) Không dùng icon tùy biến nữa, dùng marker mặc định

    // Update map markers - show ALL markers (no clustering, no limit)
    function updateMapMarkers(filteredAds) {
        try {
            if (!mainMap || !markersLayer) return;
            
            markersLayer.clearLayers();

            // Get focus center and radius
            let focusCenter = null;
            let focusRadiusKm = 0;
            if (focusCircle) {
                focusCenter = focusCircle.getLatLng();
                focusRadiusKm = focusCircle.getRadius() / 1000;
            }

            // Calculate min/max price for color mapping
            const prices = filteredAds.map(a => Number(a.price || 0)).filter(v => !isNaN(v) && v >= 0);
            const minP = prices.length ? Math.min(...prices) : 0;
            const maxP = prices.length ? Math.max(...prices) : 1;

            const bounds = [];
            const markers = [];

            // Group ads by exact lat/lng so multiple ads at the same coordinate are combined
            const groupsByLocation = new Map(); // key: "lat|lng" -> { lat, lng, ads: [] }

            filteredAds.forEach((ad) => {
                if (!ad || !ad.location) return;
                try {
                    const [lat, lng] = String(ad.location).split(',').map(Number);
                    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

                    // Filter by focus circle
                    if (focusCenter) {
                        const distance = getDistance(focusCenter.lat, focusCenter.lng, lat, lng);
                        if (distance > focusRadiusKm + 1) return;
                    }

                    const key = `${lat.toFixed(6)}|${lng.toFixed(6)}`;
                    let group = groupsByLocation.get(key);
                    if (!group) {
                        group = { lat, lng, ads: [] };
                        groupsByLocation.set(key, group);
                    }
                    group.ads.push(ad);
                } catch {}
            });

            // Create one marker per coordinate group
            groupsByLocation.forEach((group) => {
                const { lat, lng, ads } = group;
                if (!ads || ads.length === 0) return;

                // Derive color from average price in this group
                const groupPrices = ads
                    .map(a => Number(a.price || 0))
                    .filter(v => !isNaN(v) && v >= 0);
                const avgPrice = groupPrices.length
                    ? groupPrices.reduce((a, b) => a + b, 0) / groupPrices.length
                    : 0;
                const color = getPriceColor(avgPrice, minP, maxP);

                const marker = L.circleMarker([lat, lng], {
                    radius: 8,
                    fillColor: color,
                    color: '#7a0000',
                    weight: 1,
                    opacity: 0.8,
                    fillOpacity: 0.7
                });

                // Tooltip: show count + price info
                const firstAd = ads[0];
                const firstPriceStr =
                    (firstAd.price_string && firstAd.price_string.split('/tháng')[0]) ||
                    formatMoneyVND(firstAd.price);
                const tooltipText =
                    ads.length === 1
                        ? firstPriceStr
                        : `${ads.length} tin - từ ${firstPriceStr}`;
                marker.bindTooltip(tooltipText, {
                    permanent: false,
                    direction: 'top',
                    offset: [0, -10]
                });

                // Popup: list all ads at this coordinate
                const itemsHtml = ads
                    .map(a => {
                        const priceStr =
                            (a.price_string && a.price_string.split('/tháng')[0]) ||
                            formatMoneyVND(a.price);
                        const address = [a?.street_number, a?.street_name, a?.ward_name, a?.area_name]
                            .filter(Boolean)
                            .join(', ');
                        return `
                            <div class="mb-2 pb-2 border-bottom">
                                <div class="fw-bold" style="font-size:13px;">${a.subject || 'Không có tiêu đề'}</div>
                                <div class="text-danger" style="font-weight:600">${priceStr}</div>
                                <div class="text-muted" style="font-size:11px;">${address}</div>
                                <div class="mt-1">
                                    <button class="btn btn-sm btn-primary" onclick="openDetailModal('${a.ad_id}')">Xem chi tiết</button>
                                </div>
                            </div>
                        `;
                    })
                    .join('');

                const popupHtml = `
                    <div style="min-width:240px; max-height:320px; overflow:auto;">
                        ${itemsHtml}
                    </div>
                `;

                marker.bindPopup(popupHtml, { maxWidth: 360 });

                markers.push(marker);
                bounds.push([lat, lng]);
            });

            // Add all markers at once (batch) - faster than individual adds
            if (markers.length > 0) {
                markers.forEach(m => markersLayer.addLayer(m));
            }

            // Fit bounds if markers exist
            if (bounds.length > 0 && !focusCircle) {
                try {
                    mainMap.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 });
                } catch {}
            }
            
            console.log(`📍 Hiển thị ${markers.length} nhóm tọa độ / ${filteredAds.length} ads trên bản đồ`);
        } catch (e) {
            console.warn('Lỗi cập nhật marker:', e);
        }
    }

    function parsePrice(ad) {
        return Number(ad.price || 0);
    }

    function formatMoneyVND(amount) {
        if (!amount) return 'Liên hệ';
        return (Number(amount) || 0).toLocaleString('vi-VN') + ' đ';
    }

    // Convert timestamp to datetime
    function formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleString('vi-VN');
    }

    function render() {
        if (!allAds || allAds.length === 0) {
            listEl.innerHTML = `
                <div class="col-12 text-center">
                    <div class="alert alert-info">
                        <i class="mdi mdi-information"></i>
                        Chưa có dữ liệu. Vui lòng chờ crawler hoàn thành.
                    </div>
                </div>
            `;
            return;
        }

        // Filter theo search term
        let filteredAds = allAds;

        // Filter theo Area/Ward
        const selectedArea = filterAreaEl?.value || "";
        // Hỗ trợ đa chọn phường (Select2)
        let selectedWards = [];
        if (window.$ && typeof window.$.fn.select2 === 'function') {
            selectedWards = (window.$(filterWardEl).val() || []).filter(Boolean);
        } else {
            const val = filterWardEl?.value || "";
            selectedWards = val ? [val] : [];
        }
        if (selectedArea) {
            filteredAds = filteredAds.filter(ad => String(ad.area_v2 || ad.area || ad.area_id) === String(selectedArea));
        }
        if (selectedWards.length > 0) {
            const wardSet = new Set(selectedWards.map(String));
            filteredAds = filteredAds.filter(ad => wardSet.has(String(ad.ward || ad.ward_id)));
        }

        // Filter theo khoảng giá (min-max)
        if (selectedPriceMin != null && selectedPriceMax != null) {
            filteredAds = filteredAds.filter(ad => {
                const p = Number(ad.price || 0);
                if (isNaN(p)) return false;
                return p >= selectedPriceMin && p <= selectedPriceMax;
            });
        }

        // Filter theo company_ad (true = Môi giới, false/undefined = Cá nhân)
        const companyFilter = filterCompanyEl?.value || "";
        if (companyFilter === 'agent') {
            filteredAds = filteredAds.filter(ad => ad.company_ad === true);
        } else if (companyFilter === 'personal') {
            filteredAds = filteredAds.filter(ad => ad.company_ad !== true);
        }

        // Only ads with at least one successfully backed-up image (imgs_bak entry with s === 'ok')
        if (filterOnlyBackupImgEl?.checked) {
            filteredAds = filteredAds.filter(
                (ad) => Array.isArray(ad.imgs_bak) && ad.imgs_bak.some((img) => img && img.s === "ok")
            );
        }

        if (searchTerm.trim()) {
            const searchLower = searchTerm.toLowerCase();
            filteredAds = filteredAds.filter(ad => {
                return (
                    (ad.subject && ad.subject.toLowerCase().includes(searchLower)) ||
                    (ad.area_name && ad.area_name.toLowerCase().includes(searchLower)) ||
                    (ad.ward_name && ad.ward_name.toLowerCase().includes(searchLower)) ||
                    (ad.street_name && ad.street_name.toLowerCase().includes(searchLower)) ||
                    (ad.street_number && ad.street_number.toLowerCase().includes(searchLower)) ||
                    (ad.price_string && ad.price_string.toLowerCase().includes(searchLower)) ||
                    (ad.full_name && ad.full_name.toLowerCase().includes(searchLower)) ||
                    (ad.account_name && ad.account_name.toLowerCase().includes(searchLower)) ||
                    (ad.body && ad.body.toLowerCase().includes(searchLower)) ||
                    (ad.price && ad.price.toString().includes(searchLower))
                );
            });
        }

        const sortVal = sortEl.value;
        const sorted = [...filteredAds].sort((a, b) => {
            const pa = parsePrice(a);
            const pb = parsePrice(b);
            if (sortVal === 'price-asc') return pa - pb;
            if (sortVal === 'price-desc') return pb - pa;
            if (sortVal === 'newest') return b.list_time - a.list_time;
            if (sortVal === 'oldest') return a.list_time - b.list_time;
            return 0;
        });

        // Update total count (show ratio when search or backup-only filter narrows the list)
        const totalCountEl = document.getElementById("total-count");
        const showRatio = searchTerm.trim() || filterOnlyBackupImgEl?.checked;
        if (totalCountEl) {
            totalCountEl.textContent = showRatio
                ? `${filteredAds.length}/${allAds.length}`
                : String(filteredAds.length);
        }

        // Cập nhật bản đồ với toàn bộ danh sách đã lọc
        updateMapMarkers(filteredAds);

        // Chỉ hiển thị số lượng đã định
        const displayAds = sorted.slice(0, displayedCount);

        listEl.innerHTML = displayAds.map(ad => {
            // Reconstruct backup URL if available
            const backupImg = ad.imgs_bak?.find(img => img.s === 'ok');
            const backupUrl = backupImg ? reconstructCloudinaryUrl(backupImg.bak, backupImg.c) : '';
            
            return `
            <div class="col-md-4 col-lg-3 col-xl-3 mb-2">
                <div class="card h-100 ${ad.company_ad === true ? 'agent' : ''}"">
                    <div class="image-container" data-ad-id="${ad.ad_id}" onclick="openDetailModal('${ad.ad_id}')">
                        <img src="${ad.images?.[0] || backupUrl || 'https://placehold.co/300x180?text=No+Image'}" 
                             data-backup="${backupUrl}"
                             alt="thumb" class="card-img-top ad-thumbnail" 
                             style="height: 180px; object-fit: cover;" 
                             loading="lazy"
                             onerror="handleImageError(this)">
                        <div class="image-overlay">
                            <i class="mdi mdi-magnify"></i>
                        </div>
                        ${ad.imgs_bak?.some(img => img.s === 'ok') ? '<span class="backup-badge"><i class="mdi mdi-cloud-check"></i></span>' : ''}
                    </div>
                    <div class="card-body d-flex flex-column">
                        <div class="d-flex justify-content-between align-items-start mb-1 flex-wrap gap-1">
                            <div class="d-flex gap-1 align-items-center">
                                <span class="price-badge">${ad.price_string || formatMoneyVND(ad.price)}</span>
                                ${ad.category === '1050' ? '<span class="category-badge category-tro"><i class="mdi mdi-bunk-bed"></i> Trọ</span>' : 
                                  ad.category === '1020' ? '<span class="category-badge category-nha"><i class="mdi mdi-home"></i> Nhà ở</span>' : ''}
                            </div>
                            <small class="text-muted d-flex align-items-center gap-1">
                                ${ad.company_ad === true ? '<span class="badge-agent">Môi giới</span>' : ''}
                                <i class="mdi mdi-clock"></i> ${formatDate(ad.list_time)}
                            </small>
                        </div>
                        
                        <h6 class="card-title span-house mb-1" style="font-size: 0.85rem; line-height: 1.2;">
                            ${ad.subject || 'Không có tiêu đề'}
                        </h6>
                        
                        <div class="info-grid-compact">
                            <div class="info-item-compact">
                                <i class="mdi mdi-map-marker"></i>
                                <span>${[ad?.street_number, ad?.street_name, ad?.ward_name, ad?.area_name].filter(Boolean).join(', ')}</span>
                            </div>
                            <div class="info-item-compact">
                                <i class="mdi mdi-home"></i>
                                <span>${ad.size || 'N/A'} m²</span>
                            </div>
                            <div class="info-item-compact">
                                <i class="mdi mdi-account"></i>
                                <span>${ad.full_name || ad.account_name || 'N/A'}</span>
                            </div>
                            <div class="info-item-compact">
                                <i class="mdi mdi-image-multiple"></i>
                                <span>${ad.number_of_images || ad.images?.length || 0}</span>
                            </div>
                        </div>
                        
                        <div class="mt-auto">
                            <small class="description-text">
                                ${ad.body ? ad.body.substring(0, 60) + '...' : 'Không có mô tả'}
                            </small>
                        </div>

                        <div class="mt-2">
                            <button class="btn btn-sm btn-outline-primary w-100 show-map-btn" data-ad-id="${ad.ad_id}" data-location="${ad.location || ''}">
                                <i class="mdi mdi-map-marker"></i> Xem bản đồ
                            </button>
                            <div id="map-${ad.ad_id}" class="leaflet-map mt-2" style="height: 200px; width: 100%; border-radius: 4px; display: none;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        }).join('') +

            // Thêm loading indicator nếu còn ads chưa hiển thị
            (displayedCount < sorted.length ? `
            <div class="col-12 text-center mt-2">
                <div class="spinner-border spinner-border-sm text-primary" role="status">
                    <span class="visually-hidden">Đang tải thêm...</span>
                </div>
                <div class="mt-1 text-muted small">
                    Hiển thị ${displayedCount}/${sorted.length} tin đăng
                </div>
            </div>
        ` : '');
        
        // Setup lazy map loading for card maps (only load on button click)
        setTimeout(() => {
            setupCardMapButtons();
        }, 100);
    }

    // Lazy load card maps only when user clicks "Show map" button
    function setupCardMapButtons() {
        const mapButtons = document.querySelectorAll('.show-map-btn');
        mapButtons.forEach(btn => {
            // Remove old listeners by cloning
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', function() {
                const adId = this.dataset.adId;
                const location = this.dataset.location;
                const mapEl = document.getElementById(`map-${adId}`);
                
                if (!mapEl || !location) return;
                
                // Toggle map visibility
                if (mapEl.style.display === 'none') {
                    mapEl.style.display = 'block';
                    this.innerHTML = '<i class="mdi mdi-map-marker-off"></i> Ẩn bản đồ';
                    
                    // Initialize map if not already cached
                    if (!cardMapsCache.has(adId)) {
                        try {
                            const [lat, lng] = location.split(',').map(Number);
                            if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                                const map = L.map(`map-${adId}`).setView([lat, lng], 15);
                                
                                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                    attribution: '© OpenStreetMap contributors',
                                    maxZoom: 18
                                }).addTo(map);
                                
                                L.marker([lat, lng]).addTo(map);
                                
                                // Cache the map instance
                                cardMapsCache.set(adId, map);
                                
                                // Force resize after showing
                                setTimeout(() => map.invalidateSize(), 100);
                            }
                        } catch (e) {
                            console.warn(`Lỗi khởi tạo map cho ad ${adId}:`, e);
                        }
                    } else {
                        // Map exists, just invalidate size
                        const cachedMap = cardMapsCache.get(adId);
                        setTimeout(() => cachedMap.invalidateSize(), 100);
                    }
                } else {
                    mapEl.style.display = 'none';
                    this.innerHTML = '<i class="mdi mdi-map-marker"></i> Xem bản đồ';
                }
            });
        });
    }

    // Hàm load thêm ads
    function loadMore() {
        if (isLoading || displayedCount >= allAds.length) return;

        isLoading = true;
        displayedCount += 20;
        render();
        isLoading = false;
    }

    // Kiểm tra cuộn đến cuối trang
    function isBottomOfPage() {
        return window.innerHeight + window.scrollY >= document.body.offsetHeight - 100;
    }

    // Debounce để tránh gọi quá nhiều
    function debounce(func, delay) {
        let timeout;
        return function () {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, arguments), delay);
        };
    }

    // Lazy load khi cuộn
    const handleScroll = debounce(() => {
        if (isBottomOfPage()) {
            loadMore();
        }
    }, 200);

    window.addEventListener('scroll', handleScroll);

    // Debounce cho search
    const debouncedSearch = debounce((value) => {
        searchTerm = value;
        displayedCount = 20;
        render();
    }, 300);

    // Event listeners
    searchEl.addEventListener('input', (e) => {
        debouncedSearch(e.target.value);
    });

    sortEl.addEventListener('change', () => {
        displayedCount = 20;
        render();
    });

    // Category filter - reload ads when changed
    if (filterCategoryEl) {
        filterCategoryEl.addEventListener('change', async () => {
            displayedCount = 20;
            await loadAds(); // Reload ads from API with new category filter
        });
    }

    // Only backup filter - reload ads when changed
    if (filterOnlyBackupImgEl) {
        filterOnlyBackupImgEl.addEventListener("change", async () => {
            displayedCount = 20;
            await loadAds(); // Reload ads from API with new only_backup filter
        });
    }

    // Hàm mở modal detail
    window.openDetailModal = function (adId) {
        currentAd = allAds.find(ad => ad.ad_id == adId);
        if (!currentAd) return;

        const images = currentAd.images || [];
        const hasImages = images.length > 0;
        let carouselHtml = '';
        if (hasImages) {
            const items = images.map((img, index) => `
                <a data-fancybox="gallery-${currentAd.ad_id}" href="${img}" data-caption="${currentAd.subject || ''}">
                    <img src="${img}" class="img-fluid rounded mb-2" style="max-height: 120px; object-fit: cover;" alt="Image ${index + 1}">
                </a>
            `).join('');
            carouselHtml = `
                <div class="d-flex flex-wrap gap-2">
                    ${items}
                </div>
            `;
        } else {
            // Reconstruct backup URL if available
            const backupImg = currentAd.imgs_bak?.find(img => img.s === 'ok');
            const backupUrl = backupImg ? reconstructCloudinaryUrl(backupImg.bak, backupImg.c) : null;
            
            carouselHtml = `
                <div class="text-center mb-2">
                    <img src="${currentAd.images?.[0] || backupUrl || 'https://placehold.co/600x400?text=No+Image'}" 
                        class="img-fluid rounded" style="max-height: 300px;" alt="Main Image">
                </div>
            `;
        }

        modalContent.innerHTML = `
            <div class="row g-3">
                <div class="col-lg-8">
                    ${carouselHtml}
                </div>
                <div class="col-lg-4">
                    <div class="detail-section">
                        <h6><i class="mdi mdi-currency-vnd"></i> Thông tin giá</h6>
                        <div class="info-grid">
                            <div class="info-item">
                                <i class="mdi mdi-tag"></i>
                                <span class="fw-bold text-danger">${currentAd.price_string || formatMoneyVND(currentAd.price)}</span>
                            </div>
                            <div class="info-item">
                                <i class="mdi mdi-home"></i>
                                <span>${currentAd.size || 'N/A'} m²</span>
                            </div>
                            <div class="info-item">
                                <i class="mdi mdi-calendar"></i>
                                <span>${formatDate(currentAd.list_time)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <h6><i class="mdi mdi-map-marker"></i> Địa chỉ</h6>
                        <div class="info-grid">
                            <div class="info-item">
                                <i class="mdi mdi-city"></i>
                                <span>${currentAd.area_name || 'N/A'}</span>
                            </div>
                            <div class="info-item">
                                <i class="mdi mdi-map"></i>
                                <span>${currentAd.ward_name || 'N/A'}</span>
                            </div>
                            <div class="info-item">
                                <i class="mdi mdi-road"></i>
                                <span>${currentAd.street_name || ''} ${currentAd.street_number || ''}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <h6><i class="mdi mdi-account"></i> Người đăng</h6>
                        <div class="info-grid">
                            <div class="info-item">
                                <i class="mdi mdi-account-circle"></i>
                                <span>${currentAd.full_name || currentAd.account_name || 'N/A'}</span>
                            </div>
                            <div class="info-item">
                                <i class="mdi mdi-phone"></i>
                                <span><a href="tel:${currentAd.phone || 'N/A'}">${currentAd.phone || 'N/A'}</a></span>
                            </div>
                            <div class="info-item">
                                <i class="mdi mdi-star"></i>
                                <span>Đánh giá: ${currentAd.average_rating || 'N/A'}/5</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <h6><i class="mdi mdi-information"></i> Thông tin khác</h6>
                        <div class="info-grid">
                            <div class="info-item">
                                <i class="mdi mdi-image-multiple"></i>
                                <span>${currentAd.number_of_images || images.length} ảnh</span>
                            </div>
                            <div class="info-item">
                                <i class="mdi mdi-video"></i>
                                <span>${currentAd.videos?.length || 0} video</span>
                            </div>
                            <div class="info-item">
                                <i class="mdi mdi-eye"></i>
                                <span>Trạng thái: ${currentAd.status || 'N/A'}</span>
                            </div>
                            <div class="info-item">
                                <i class="mdi mdi-calendar-clock"></i>
                                <span>Đăng: ${formatDate(currentAd.list_time)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row mt-3">
                <div class="col-12">
                    <div class="detail-section">
                        <h6><i class="mdi mdi-text"></i> Mô tả chi tiết</h6>
                        <p class="description-text" style="white-space: pre-line;">${currentAd.body || 'Không có mô tả'}</p>
                    </div>
                </div>
            </div>
        `;

        detailModal.show();

        // Bind fancybox and manage z-index/backdrop while open
        try {
            const selector = `#modalContent a[data-fancybox="gallery-${currentAd.ad_id}"]`;
            Fancybox.bind(selector, {
                Thumbs: { autoStart: true },
                Toolbar: { display: ["close"] },
                trapFocus: false,
                on: {
                    init: () => {
                        document.querySelectorAll('.modal-backdrop').forEach(b => {
                            b.dataset._origZ = b.style.zIndex || '';
                            b.dataset._origOpacity = b.style.opacity || '';
                            b.dataset._origPE = b.style.pointerEvents || '';
                            b.style.zIndex = '0';
                            b.style.opacity = '0';
                            b.style.pointerEvents = 'none';
                        });
                    },
                    destroy: () => {
                        document.querySelectorAll('.modal-backdrop').forEach(b => {
                            b.style.zIndex = b.dataset._origZ;
                            b.style.opacity = b.dataset._origOpacity;
                            b.style.pointerEvents = b.dataset._origPE;
                        });
                    }
                }
            });
        } catch (e) {
            console.warn('Fancybox bind error:', e);
        }
    };

    // Scroll to top button
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            scrollTopBtn.style.display = 'block';
        } else {
            scrollTopBtn.style.display = 'none';
        }
    });

    scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Event: company filter
    filterCompanyEl.addEventListener('change', () => {
        displayedCount = 20;
        render();
    });

    await Promise.all([loadRegions(), loadAds()]);
});

// Global function to handle image error - fallback to backup
window.handleImageError = function(img) {
    const backupUrl = img.dataset.backup;
    
    // If has backup and not already using backup
    if (backupUrl && img.src !== backupUrl) {
        console.log('📸 Loading backup image:', backupUrl);
        img.src = backupUrl;
        img.onerror = function() {
            // If backup also fails, use placeholder
            this.src = 'https://placehold.co/300x180?text=Image+Not+Available';
            this.onerror = null;
        };
    } else {
        // No backup or backup failed, use placeholder
        img.src = 'https://placehold.co/300x180?text=Image+Not+Available';
        img.onerror = null;
    }
};


