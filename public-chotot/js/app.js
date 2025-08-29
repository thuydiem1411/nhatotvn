document.addEventListener("DOMContentLoaded", async function () {
    const listEl = document.getElementById("ads-list");
    const sortEl = document.getElementById("sort-price");
    const filterAreaEl = document.getElementById("filter-area");
    const filterWardEl = document.getElementById("filter-ward");
    const filterCompanyEl = document.getElementById("filter-company");
    const searchEl = document.getElementById("search-input");
    const detailModal = new bootstrap.Modal(document.getElementById('detailModal'));
    const modalContent = document.getElementById('modalContent');
    const scrollTopBtn = document.getElementById('scrollTopBtn');
    
    let allAds = [];
    let displayedCount = 20;
    let isLoading = false;
    let searchTerm = '';
    let currentAd = null;

    async function loadAds() {
        try {
            const res = await fetch("/data/ads.json");
            allAds = await res.json();
            
            // Cập nhật tổng số
            document.getElementById('total-count').textContent = allAds.length;
            
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

            // On change area -> load wards
            filterAreaEl.addEventListener('change', () => {
                const selected = areas[filterAreaEl.value];
                const wards = selected?.wards || [];
                filterWardEl.disabled = !wards.length;
                filterWardEl.innerHTML = `<option value="">Chọn Phường/Xã</option>` +
                    wards.map(w => `<option value="${w.id}">${w.name}</option>`).join("");
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

    function parsePrice(ad) {
        return Number(ad.price || 0);
    }

    function formatMoneyVND(amount) {
        if (!amount) return 'Liên hệ';
        return (Number(amount) || 0).toLocaleString('vi-VN') + ' đ';
    }

    function formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleDateString('vi-VN');
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
        const selectedWard = filterWardEl?.value || "";
        if (selectedArea) {
            filteredAds = filteredAds.filter(ad => String(ad.area_v2 || ad.area || ad.area_id) === String(selectedArea));
        }
        if (selectedWard) {
            filteredAds = filteredAds.filter(ad => String(ad.ward || ad.ward_id) === String(selectedWard));
        }

        // Filter theo company_ad (true = Môi giới, false/undefined = Cá nhân)
        const companyFilter = filterCompanyEl?.value || "";
        if (companyFilter === 'agent') {
            filteredAds = filteredAds.filter(ad => ad.company_ad === true);
        } else if (companyFilter === 'personal') {
            filteredAds = filteredAds.filter(ad => ad.company_ad !== true);
        }
        if (searchTerm.trim()) {
            const searchLower = searchTerm.toLowerCase();
            filteredAds = allAds.filter(ad => {
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
            if (sortVal === 'asc') return pa - pb;
            if (sortVal === 'desc') return pb - pa;
            return 0;
        });

        // Cập nhật tổng số hiển thị
        document.getElementById('total-count').textContent = searchTerm.trim() ? 
            `${filteredAds.length}/${allAds.length}` : allAds.length;

        // Chỉ hiển thị số lượng đã định
        const displayAds = sorted.slice(0, displayedCount);

        listEl.innerHTML = displayAds.map(ad => `
            <div class="col-md-4 col-lg-3 col-xl-3 mb-2">
                <div class="card h-100 ${ad.company_ad === true ? 'agent' : ''}" data-ad-id="${ad.ad_id}" onclick="openDetailModal('${ad.ad_id}')">
                    <div class="image-container">
                        <img src="${ad.image || ad.webp_image || 'https://via.placeholder.com/300x180?text=No+Image'}" 
                             alt="thumb" class="card-img-top" 
                             style="height: 180px; object-fit: cover;" 
                             loading="lazy"
                             onerror="this.src='https://via.placeholder.com/300x180?text=Error'">
                        <div class="image-overlay">
                            <i class="mdi mdi-magnify"></i>
                        </div>
                    </div>
                    <div class="card-body d-flex flex-column">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <span class="price-badge">${ad.price_string || formatMoneyVND(ad.price)}</span>
                            <small class="text-muted d-flex align-items-center gap-1">
                                ${ad.company_ad === true ? '<span class="badge-agent">Môi giới</span>' : ''}
                                <i class="mdi mdi-clock"></i> ${ad.date || formatDate(ad.list_time)}
                            </small>
                        </div>
                        
                        <h6 class="card-title span-house mb-1" style="font-size: 0.85rem; line-height: 1.2;">
                            ${ad.subject || 'Không có tiêu đề'}
                        </h6>
                        
                        <div class="info-grid-compact">
                            <div class="info-item-compact">
                                <i class="mdi mdi-map-marker"></i>
                                <span>${ad.area_name || ''}${ad.ward_name ? ', ' + ad.ward_name : ''}</span>
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
                    </div>
                </div>
            </div>
        `).join('') + 
        
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

    // Hàm mở modal detail
    window.openDetailModal = function(adId) {
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
            carouselHtml = `
                <div class="text-center mb-2">
                    <img src="${currentAd.image || currentAd.webp_image || 'https://via.placeholder.com/600x400?text=No+Image'}" 
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
                                <span>${currentAd.date || formatDate(currentAd.list_time)}</span>
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
                                <span>Đăng: ${formatDate(currentAd.orig_list_time)}</span>
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


