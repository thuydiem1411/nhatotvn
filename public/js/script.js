let _lastKey = 0;
document.addEventListener("DOMContentLoaded", async function () {
    const districtSelect = document.getElementById("district");
    const wardSelect = document.getElementById("ward");
    const roomList = document.getElementById("room-list");
    const filterForm = document.getElementById("filterForm");
    const modalElement = document.getElementById('exampleModalScrollable');

    const savedFilters = JSON.parse(localStorage.getItem('savedFilters')) || {};

    // Hàm xử lý tải xuống file
    document.querySelector('[data-sub-action="download-data"]').addEventListener('click', function () {
        const link = document.createElement('a');
        link.href = '/data/data.json'; // Đường dẫn đến file data.json trong thư mục public
        link.download = 'data.json'; // Tên file khi tải về
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    document.querySelectorAll('span.text-color.fw-bold').forEach(span => {
        if (span.textContent.includes('✘')) {
          span.classList.add('text-danger');
        } else if (span.textContent.includes('✔')) {
          span.classList.add('text-primary');
        }
    });

    // Tải dữ liệu quận/huyện và phường/xã
    const [districts, wards] = await Promise.all([
        fetch("/data/districts.json").then(res => res.json()),
        fetch("/data/wards.json").then(res => res.json())
    ]);

    // Render quận/huyện
    districtSelect.innerHTML += districts.map(d => `<option value="${d.code}">${d.name_with_type}</option>`).join("");

    // Load phường/xã
    const loadWards = (districtCode) => {
        wardSelect.innerHTML = '<option value="">Chọn Phường/Xã</option>' +
            (wards[districtCode] || []).map(w => `<option value="${w.code}">${w.name_with_type}</option>`).join("");
        wardSelect.disabled = !districtCode;
    };

    // Sự kiện thay đổi quận/huyện
    districtSelect.addEventListener("change", () => {
        loadWards(districtSelect.value);
        fetchRooms();
    });

    // Set filters và giả lập sự kiện
    filterForm.querySelectorAll("input, select").forEach(input => {
        if (savedFilters[input.name]) input.value = savedFilters[input.name];
    });

    if (savedFilters["district_id"]) {
        districtSelect.value = savedFilters["district_id"];
        districtSelect.dispatchEvent(new Event('change'));

        if (savedFilters["ward_id"]) {
            setTimeout(() => {
                wardSelect.value = savedFilters["ward_id"];
                fetchRooms();
            }, 0);
        }
    }

    // Phát hiện thay đổi trên bất kỳ input nào trong form
    filterForm.addEventListener("change", function (event) {
        const allFilterFields = [...filterForm.querySelectorAll("input, select")].map(el => el.id);

        if (allFilterFields.includes(event.target.id)) {
            _lastKey = 0; // Reset lại _lastKey khi có thay đổi
            fetchRooms();

            // Lưu các filter vào localStorage
            const filters = {};
            filterForm.querySelectorAll("input, select").forEach(input => {
                if (input.value) {
                    filters[input.name] = input.value;
                }
            });

            // Lưu vào localStorage và cập nhật URL
            localStorage.setItem('savedFilters', JSON.stringify(filters));
            const params = new URLSearchParams(filters);
            window.history.pushState({}, '', `?${params.toString()}`);
        }
    });

    // input-search change on input
    document.getElementById('input-search').addEventListener('blur', function () {
        _lastKey = 0;
        fetchRooms();
    });


    let isFetching = false;
    let hasMore = true; // Kiểm soát việc fetch khi còn dữ liệu

    // Kiểm tra cuộn đến cuối trang
    function isBottomOfPage() {
        return window.innerHeight + window.scrollY >= document.body.offsetHeight - 50;
    }

    // Debounce để ngăn gọi liên tục
    function debounce(func, delay) {
        let timeout;
        return function () {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, arguments), delay);
        };
    }

    // Lazy load khi cuộn đến cuối trang
    const handleScroll = debounce(() => {
        if (isBottomOfPage() && !isFetching && hasMore) {
            isFetching = true;
            _lastKey += 10;
            fetchRooms().finally(() => {
                isFetching = false;
            });
        }
    }, 200); // 200ms delay

    window.addEventListener('scroll', handleScroll);



    async function fetchRooms() {
        document.body.insertAdjacentHTML('beforeend', '<div id="loading">Đang tải...</div>');
        const query = new URLSearchParams(new FormData(filterForm)).toString();

        try {
            const response = await fetch(`/api/rooms?${query}&_lastKey=${_lastKey}`);
            if (!response.ok) throw new Error(`Lỗi HTTP! Status: ${response.status}`);

            const res = await response.json();
            const rooms = res.data;
            const total = res.total;
            document.getElementById('total-rooms').innerHTML = `(${total})`;
            renderRooms(rooms);
            // console.log(rooms);
        } catch (error) {
            console.error("Lỗi fetch dữ liệu:", error);
        } finally {
            document.getElementById('loading')?.remove();
        }
    }

    async function loadRoomTemplate() {
        const response = await fetch("/room-template");
        return await response.text();
    }

    async function renderRooms(rooms) {
        const template = await loadRoomTemplate();

        // console.log(rooms);
        const html = rooms.map(room => {
            // Thay thế các key trong template trước khi parse
            let roomHTML = template;

            const replacements = [
                ['<%= room._id %>', room._id],
                ['<%= room.house_key %>', room.house_key],
                ['<%= room.fake_address %>', room.fake_address],
                ['<%= room.room_code + " - " %>', room.room_code ? room.room_code + " - " : ''],
                ['<%= room.last_update %>', room.last_update],
                ['<%= room.house_address %>', room.house_address],
                ['<%= room.gia_cho_thue %>', room.gia_cho_thue],
                ['<%= room.info_tgi_kyhd %>', room.info_tgi_kyhd],
                ['<%= room.electricity %>', room.electricity],
                ['<%= room.electricity_unit %>', room.electricity_unit],
                ['<%= room.water %>', room.water],
                ['<%= room.water_unit %>', room.water_unit],
                ['<%= room.parking %>', room.parking],
                ['<%= room.parking_unit %>', room.parking_unit],
                ['<%= room.garbagefee %>', room.garbagefee],
                ['<%= room.garbagefee_unit %>', room.garbagefee_unit],
                ['<%= room.show_text_wifi %>', room.show_text_wifi],
                ['<%= room.washingmachinefee %>', room.washingmachinefee],
                ['<%= room.washingmachinefee_unit %>', room.washingmachinefee_unit],
                ['<%= room.card %>', room.card],
                ['<%= room.card_unit %>', room.card_unit],
                ['<%= room.otherfee %>', room.otherfee],
                ['<%= room.room_info.cooling_type %>', room.room_info.cooling_type],
                ['<%= room.room_info.location %>', room.room_info.location],
                ['<%= room.room_info.room_area %>', room.room_info.room_area],
                ['<%= room.room_info.opt_toilet %>', room.room_info.opt_toilet],
                ['<%= room.room_info.opt_nhaxe %>', room.room_info.opt_nhaxe],
                ['<%= room.room_info.opt_sanphoi %>', room.room_info.opt_sanphoi],
                ['<%= room.room_info.opt_gatelocktype %>', room.room_info.opt_gatelocktype],
                ['<%= room.room_info.opt_ghe %>', room.room_info.opt_ghe],
                ['<%= room.room_info.slxe %>', room.room_info.slxe],
                ['<%= room.room_info.slnguoio %>', room.room_info.slnguoio],
                ['<%= room.room_info.cgicho %>', room.room_info.cgicho],
                ['<%= room.room_info.thgibscoc %>', room.room_info.thgibscoc],
                ['<%= room.room_info.thgivaoo %>', room.room_info.thgivaoo],
                ['<%= room.room_info.opt_gac=="Y" ? "✔" : "✘" %>', room.room_info.opt_gac == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_window=="Y" ? "✔" : "✘" %>', room.room_info.opt_window == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_bancong=="Y" ? "✔" : "✘" %>', room.room_info.opt_bancong == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_tulanh=="Y" ? "✔" : "✘" %>', room.room_info.opt_tulanh == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_tivi=="Y" ? "✔" : "✘" %>', room.room_info.opt_tivi == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_maygiat %>', room.room_info.opt_maygiat],
                ['<%= room.room_info.opt_bep=="Y" ? "✔" : "✘" %>', room.room_info.opt_bep == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_bonruachen=="Y" ? "✔" : "✘" %>', room.room_info.opt_bonruachen == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_nuocnong=="Y" ? "✔" : "✘" %>', room.room_info.opt_nuocnong == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_giuong=="Y" ? "✔" : "✘" %>', room.room_info.opt_giuong == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_nem=="Y" ? "✔" : "✘" %>', room.room_info.opt_nem == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_tuquanao=="Y" ? "✔" : "✘" %>', room.room_info.opt_tuquanao == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_ban=="Y" ? "✔" : "✘" %>', room.room_info.opt_ban == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_elevator=="Y" ? "✔" : "✘" %>', room.room_info.opt_elevator == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_bve=="Y" ? "✔" : "✘" %>', room.room_info.opt_bve == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.mlanh=="Y" ? "✔" : "✘" %>', room.room_info.mlanh == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.gitroi=="Y" ? "✔" : "✘" %>', room.room_info.gitroi == "Y" ? "✔" : "✘"],
                ['<%= room.room_info.opt_pet %>', room.room_info.opt_pet],
                ['<%= room.nhan_xe_dien %>', room.nhan_xe_dien],
                ['<%= room.room_info.info_remark %>', room.room_info.info_remark],
                ['<%= room.room_info.tien_ich_xq %>', room.room_info.tien_ich_xq],
                ['<%= room.status_desc %>', room.status_desc],
                ['<%= room.partner_name %>', room.partner_name],

            ];

            replacements.forEach(([key, value]) => {
                roomHTML = roomHTML.replaceAll(key, value ?? '');
            });

            // Parse HTML sau khi đã thay thế key
            let parser = new DOMParser();
            let doc = parser.parseFromString(roomHTML, 'text/html');

            // Thay thế carousel
            let carouselElement = doc.getElementById('carousel');
            if (carouselElement) {
                const hasImages = room.images && room.images.length > 0;

                const indicators = hasImages
                    ? room.images.map((_, index) => `
                        <button type="button" data-bs-target="#carouselExampleIndicators-${room._id}"
                            data-bs-slide-to="${index}" class="${index === 0 ? 'active' : ''}"
                            aria-current="${index === 0 ? 'true' : 'false'}"
                            aria-label="Slide ${index + 1}"></button>
                    `).join('')
                    : '';

                const carouselItems = hasImages
                    ? room.images.map((image, index) => `
                        <div class="carousel-item ${index === 0 ? 'active' : ''}">
                            <img loading="lazy" src="https://quanly.nhatrovn.vn${image}"
                                class="d-block w-100 object-fit-cover" alt="Room Image ${index + 1}"
                                style="height: 200px;">
                        </div>
                    `).join('')
                    : `
                        <div class="carousel-item active">
                            <img src="https://quanly.nhatrovn.vn/static/images/logo-nhatrovn.png"
                                alt="Room Image" class="d-block w-100 object-fit-cover" loading="lazy" style="height: 200px;">
                        </div>
                    `;

                carouselElement.innerHTML = `
                    <div id="carouselExampleIndicators-${room._id}" class="carousel slide">
                        <div class="carousel-indicators">
                            ${indicators}
                        </div>
                        <div class="carousel-inner">
                            ${carouselItems}
                        </div>
                        <button class="carousel-control-prev" type="button"
                            data-bs-target="#carouselExampleIndicators-${room._id}" data-bs-slide="prev">
                            <span class="carousel-control-prev-icon" aria-hidden="true"></span>
                            <span class="visually-hidden">Previous</span>
                        </button>
                        <button class="carousel-control-next" type="button"
                            data-bs-target="#carouselExampleIndicators-${room._id}" data-bs-slide="next">
                            <span class="carousel-control-next-icon" aria-hidden="true"></span>
                            <span class="visually-hidden">Next</span>
                        </button>
                    </div>
                `;
            }

            return doc.body.innerHTML;
        }).join('');

        // Render lại danh sách phòng
        if (_lastKey == 0) {
            roomList.innerHTML = html;
        } else {
            roomList.innerHTML += html;
        }

        // Khởi tạo carousel
        document.querySelectorAll('.carousel').forEach(carousel => {
            new bootstrap.Carousel(carousel);
        });

        document.querySelectorAll('span.text-color.fw-bold').forEach(span => {
            if (span.textContent.includes('✘')) {
              span.classList.add('text-danger');
            } else if (span.textContent.includes('✔')) {
              span.classList.add('text-primary');
            }
        });

        shareRoom(); // Gọi lại hàm chia sẻ
    }

    document.getElementById('resetFilters').addEventListener('click', function () {
        const filters = document.querySelectorAll('#filter-furniture select, #filter-furniture input');
        filters.forEach(filter => {
            if (filter.tagName === 'SELECT') {
                filter.value = 'ALL'; // đặt về giá trị mặc định
            } else if (filter.tagName === 'INPUT') {
                filter.value = ''; // xóa nội dung input
            }
        });
        fetchRooms();
    });

    modalElement.addEventListener('hidden.bs.modal', function () {
        document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.remove());
    });

    // Lắng nghe sự kiện click trên tất cả các nút share
    // Đưa vào 1 function riêng để dễ quản lý
    function shareRoom() {
        document.querySelectorAll('[data-sub-action="share-social-network"]').forEach(button => {
            button.addEventListener('click', async () => {
                const roomId = button.dataset.id;
                if (!roomId) return alert('Không tìm thấy room ID.');

                try {
                    // Fetch dữ liệu
                    const res = await fetch('/data/data.json');
                    const data = await res.json();
                    const room = data.find(room => room._id === roomId);
                    if (!room) return alert('Không tìm thấy phòng.');
                    const images = room.images.length ? room.images : [room?.url_image_first];
                    if (!images.length) return alert('Không tìm thấy hình ảnh.');

                    let options = [
                        room.room_info.opt_pet != "Không" ? "Cho nuôi thú cưng" : "",
                        room.room_info.opt_toilet == "Riêng" ? "Toilet " + room.room_info.opt_toilet.toLowerCase() : "",
                        room.room_info.opt_gatelocktype != "Khóa thường" ? "Khóa " + room.room_info.opt_gatelocktype.toLowerCase() : "",
                    ].filter(Boolean).join(", ");

                    let furniture = [
                        room.room_info.opt_gac == "Y" ? "gác" : "",
                        room.room_info.mlanh == "Y" ? "máy lạnh" : "",
                        room.room_info.opt_tulanh == "Y" ? "tủ lạnh" : "",
                        room.room_info.opt_bep == "Y" ? "kệ bếp" : "",
                        room.room_info.opt_bonruachen == "Y" ? "bồn rửa chén" : ""
                    ].filter(Boolean);
                    furniture = furniture.length ? `Có ${furniture.join(", ")}` : "Không";

                    const formatFee = (label, value, unit) => parseInt(value) ? `${label} ${formatVietnameseCurrency(value)}${unit || ""}` : "";
                    const fees = [
                        formatFee("điện", room.electricity, room.electricity_unit),
                        formatFee("nước", room.water, room.water_unit),
                        formatFee("phí qlý", room.garbagefee, room.garbagefee_unit),
                        formatFee("phí dv", room.otherfee, room.otherfee_unit),
                        formatFee("xe", room.parking, room.parking_unit)
                    ].filter(Boolean).join(", ");

                    const shareText = `
Phòng ${formatVietnameseCurrency(room.gia_cho_thue)}, ${room.fake_address}

${options}
Nội thất: ${furniture}
Phí: ${fees}

LH(Zalo): 0866956654 - tìm phòng cho bạn
`.trim();
                    // console.log(shareText);

                    // Copy text vào clipboard
                    await navigator.clipboard.writeText(shareText);

                    // Tải ảnh
                    const files = (await Promise.all(
                        images.map(async (url, i) => {
                            try {
                                const blob = await fetch('https://quanly.nhatrovn.vn/' + url).then(res => res.blob());
                                return new File([blob], `img${i + 1}.jpg`, { type: blob.type });
                            } catch { return null; }
                        })
                    )).filter(Boolean);

                    // Chia sẻ hình ảnh
                    if (navigator.canShare?.({ files })) {
                        await navigator.share({ files });
                    } else {
                        alert('Trình duyệt không hỗ trợ chia sẻ hình ảnh.');
                    }
                } catch (err) {
                    alert('Đã có lỗi xảy ra.');
                    console.error(err);
                }
            });
        });

        document.querySelectorAll('[data-sub-action="share-list-room"]').forEach(button => {
            let isLoading = false; // Biến kiểm soát trạng thái load
        
            button.addEventListener('click', async () => {
                if (isLoading) return; // Ngăn double click khi đang load
                isLoading = true;
        
                const query = new URLSearchParams(new FormData(filterForm)).toString();
                try {
                    const response = await fetch(`/api/rooms?${query}`);
                    if (!response.ok) throw new Error(`Lỗi HTTP! Status: ${response.status}`);
        
                    const res = await response.json();
                    const rooms = res.data;
        
                    const uniqueRooms = Object.values(
                        rooms.reduce((acc, room) => {
                            const key = `${room.fake_road}-${room.gia_cho_thue}`;
                            if (!acc[key] || room.images.length > acc[key].images.length) {
                                acc[key] = room;
                            }
                            return acc;
                        }, {})
                    );
        
                    const roomMap = uniqueRooms.reduce((acc, room) => {
                        const price = room.gia_cho_thue.replace(/,/g, '');
                        if (!acc[price]) acc[price] = new Set();
                        if (acc[price].size < 5) acc[price].add(room.fake_road);
                        return acc;
                    }, {});
        
                    const sortedRoomMap = Object.entries(roomMap)
                        .sort(([priceA], [priceB]) => parseInt(priceA) - parseInt(priceB))
                        .reduce((acc, [price, addresses]) => {
                            acc[parseInt(price).toLocaleString('vi-VN').replace(/\./g, ',')] = Array.from(addresses).join(', ');
                            return acc;
                        }, {});
        
                    let output = `PHÒNG GIÁ RẺ, ĐẸP Ở ${districts.find(d => d.code == districtSelect.value).name_with_type.toUpperCase()}

${Object.entries(sortedRoomMap).map(([price, addresses]) => {
    const priceInMillions = formatVietnameseCurrency(price);
    return `${priceInMillions} ${addresses}`;
}).join('\n')}

Ngoài ra mình còn một số box, ktx, phòng trọ từ 2tr đến 7tr nhiều khu vực khác
Chỉ cần ib trực tiếp hoặc liên hệ zalo để được tư vấn xem phòng

LH(Zalo): 0866956654 - tìm phòng cho bạn`;
        
                    await navigator.clipboard.writeText(output);
        
                    // Render modalBody
                    const modalBody = document.querySelector('#exampleModalScrollable .modal-body');
                    modalBody.innerHTML = uniqueRooms.map(room => `
                        <div class="room-item" data-room-id="${room._id}">
                            <h5>${room.room_code} - ${room.fake_address} - ${formatVietnameseCurrency(room.gia_cho_thue)}</h5>
                            <div class="images row">
                                ${room.images.map(img => `
                                    <div class="col-4 col-md-2 mb-2 px-0">
                                        <label style="display: block; margin: 5px; cursor: pointer; position: relative;">
                                            <input type="checkbox" value="${img}" style="display: none;">
                                            <img src="https://quanly.nhatrovn.vn${img}" class="img-fluid" style="object-fit: cover; height: 150px; width: 100%" loading="lazy">
                                            <div class="checkbox-overlay text-danger mdi fs-6" style="display: none; position: absolute; top: 5px; left: 5px; background: rgba(255, 255, 255, 0.8); padding: 2px 5px; border-radius: 3px;">✓</div>
                                        </label>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('');
        
                    // Show modal
                    const modalElement = document.getElementById('exampleModalScrollable');
                    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
                    modal.show();
        
                    // Clear backdrops
                    modalElement.addEventListener('hidden.bs.modal', () => {
                        document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
                        document.body.classList.remove('modal-open');
                        document.body.style.overflow = '';
                    });
        
                } catch (err) {
                    console.error('Lỗi khi tải phòng:', err);
                    alert('Không thể tải danh sách phòng.');
                } finally {
                    isLoading = false; // Reset trạng thái sau khi load xong
                }
            });
        });

        document.querySelector('#exampleModalScrollable .modal-body').addEventListener('click', (e) => {
            const label = e.target.closest('label');
            if (label) {
                const checkbox = label.querySelector('input[type="checkbox"]');
                const overlay = label.querySelector('.checkbox-overlay');
                checkbox.checked = !checkbox.checked;
                overlay.style.display = checkbox.checked ? 'block' : 'none';
            }
        });

        document.querySelector('#exampleModalScrollable #share-list-room').addEventListener('click', async () => {
            const checkboxes = document.querySelectorAll('#exampleModalScrollable input[type="checkbox"]:checked');
            const selectedImages = Array.from(checkboxes).map(cb => cb.value);
            // console.log(selectedImages);

            if (!selectedImages.length) return alert('Vui lòng chọn ít nhất một ảnh để chia sẻ.');

            try {
                const files = (await Promise.all(
                    selectedImages.map(async (url, i) => {
                        try {
                            const blob = await fetch('https://quanly.nhatrovn.vn' + url).then(res => res.blob());
                            return new File([blob], `img${i + 1}.jpg`, { type: blob.type });
                        } catch (err) {
                            console.error('Lỗi khi tải ảnh:', err);
                            return null;
                        }
                    })
                )).filter(Boolean);

                if (files.length && navigator.canShare?.({ files })) {
                    await navigator.share({ files });
                } else {
                    alert('Trình duyệt không hỗ trợ chia sẻ hình ảnh hoặc không có ảnh hợp lệ.');
                }
            } catch (err) {
                alert('Đã có lỗi xảy ra khi chia sẻ ảnh.');
                console.error(err);
            }
        });

    }
    shareRoom();

    function formatVietnameseCurrency(amount) {
        // Chuyển giá trị sang số và loại bỏ dấu phẩy
        amount = parseInt(amount.replace(/,/g, ''), 10);

        if (isNaN(amount)) return '0';

        if (amount >= 1_000_000) {
            let millions = Math.floor(amount / 1_000_000); // phần triệu
            let thousandRemainder = amount % 1_000_000; // phần lẻ dưới 1 triệu
            let hundredThousands = Math.floor(thousandRemainder / 100_000); // số trăm nghìn
            let thousands = Math.floor((thousandRemainder % 100_000) / 1_000); // số nghìn lẻ

            if (hundredThousands > 0) {
                return thousands > 0
                    ? `${millions}tr${hundredThousands}${thousands}k`
                    : `${millions}tr${hundredThousands}`;
            } else {
                return thousands > 0
                    ? `${millions}tr${thousands}k`
                    : `${millions}tr`;
            }
        }
        if (amount >= 1_000) {
            let thousands = Math.floor(amount / 1_000);
            let hundreds = Math.floor((amount % 1_000) / 100);
            return hundreds > 0 ? `${thousands},${hundreds}k` : `${thousands}k`;
        }

        return amount.toString();
    }

    // Test thử
    // console.log(formatVietnameseCurrency("2,500,000")); // 2tr5
    // console.log(formatVietnameseCurrency("2,550,000")); // 2tr550k
    // console.log(formatVietnameseCurrency("1,100,000")); // 1tr1
    // console.log(formatVietnameseCurrency("1,155,000")); // 1tr1
    // console.log(formatVietnameseCurrency("500,000"));   // 500k
    // console.log(formatVietnameseCurrency("100,000"));   // 100k
    // console.log(formatVietnameseCurrency("3,800"));     // 3,8k
    // console.log(formatVietnameseCurrency("3,500"));     // 3,5k
});
