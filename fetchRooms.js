import axios from "axios";
import fs from "fs";
import * as cheerio from "cheerio";
import cron from "node-cron";
import qs from "qs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://quanly.nhatrovn.vn";
const USERNAME = "0866956654";
const PASSWORD = "12345678@X";

const session = axios.create({ withCredentials: true });

// Load dữ liệu từ file JSON
const districts = JSON.parse(fs.readFileSync(path.join(__dirname, "public/data/districts.json"), "utf-8")).sort((a, b) => a.code - b.code);
const wardsData = JSON.parse(fs.readFileSync(path.join(__dirname, "public/data/wards.json"), "utf-8"));
let oldData = [];
try {
    oldData = JSON.parse(fs.readFileSync(path.join(__dirname, "public/data/data.json"), "utf-8"));
} catch (err) {
    console.error("Không thể đọc data.json, sử dụng mảng rỗng.");
}
const oldDataDict = Object.fromEntries(oldData.map(record => [record._id, record]));

const districtMap = Object.fromEntries(districts.map(d => [d.name_with_type, d.code]));
const wardMap = Object.entries(wardsData).reduce((acc, [districtCode, wardList]) => {
    wardList.forEach(ward => acc[ward.name_with_type] = ward.code);
    return acc;
}, {});

// Đăng nhập lấy CSRF token
const login = async () => {
    try {
        const loginPage = await axios.get(`${BASE_URL}/login`, { withCredentials: true });
        let csrfToken = loginPage.headers["x-csrf-token"] || loginPage.headers["set-cookie"]?.find(cookie => cookie.startsWith("XSRF-TOKEN="))?.split("=")[1]?.split(";")[0];
        if (!csrfToken) throw new Error("Không tìm thấy CSRF token");

        // console.log("✅ CSRF token:", csrfToken);
        const loginResponse = await axios.post(
            `${BASE_URL}/authenticate`,
            qs.stringify({ _csrf: csrfToken, j_username: USERNAME, j_password: PASSWORD }),
            {
                headers: { "X-CSRF-TOKEN": csrfToken, "Cookie": loginPage.headers["set-cookie"]?.join("; ") || "" },
                withCredentials: true
            }
        );

        if (loginResponse.data?.responseData === "SUCCESS") {
            console.log("✅ Đăng nhập thành công!");
            return { csrfToken, cookies: loginPage.headers["set-cookie"]?.join("; ") || "" };
        } else {
            console.error("❌ Đăng nhập thất bại!");
        }
    } catch (error) {
        console.error("❌ Đăng nhập thất bại!");
    }
};

const getRoomImages = async (auth, houseKey, roomId) => {
    try {
        const response = await session.post(
            `${BASE_URL}/main/room-sale/init-edit-images-room`,
            qs.stringify({ house_key: houseKey, _id: roomId }),
            {
                headers: { "X-CSRF-TOKEN": auth.csrfToken, "Cookie": auth.cookies },
                withCredentials: true,
                timeout: 1500
            }
        );
        const $ = cheerio.load(response.data);
        return $("img.img-fluid").map((_, img) => $(img).attr("src")).get();
    } catch (error) {
        console.error("      ❌ Lỗi khi lấy hình ảnh");
        return [];
    }
};

const capitalizeWords = str => {
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.substring(1)).join(' ');
};

const refineAddress = address => {
    address = address.replace(/\s*-\s*/g, "-");
    address = address.replace(/\(.*?\)/g, "").trim();
    const match = address.match(/(\d+)/);
    if (match) {
        const houseNumber = parseInt(match[1]) + 20;
        const remainingPart = address.replace(/^\D*\d+[\w/.-]*/, "").trim().replace(/^[ ,.-]+|[ ,.-]+$/g, "");
        return `${houseNumber} ${capitalizeWords(remainingPart)}`;
    }
    return capitalizeWords(address);
};

const getFakeAddress = houseAddress => {
    const parts = houseAddress.split(",").map(p => p.trim());
    const mainAddress = parts.length > 3 ? parts.slice(0, -3).join(", ") : houseAddress;
    return refineAddress(mainAddress);
};

const getFakeRoad = houseAddress => {
    const parts = houseAddress.split(",").map(p => p.trim());
    const mainAddress = parts.length > 3 ? parts.slice(0, -3).join(", ") : houseAddress;
    const refinedAddress = refineAddress(mainAddress);
    const match = refinedAddress.match(/\d+\s+(.*)/);
    return match ? capitalizeWords(match[1]) : capitalizeWords(refinedAddress);
};

let isRunning = false;
const fetchData = async (auth) => {
    console.log("\n\n\n");
    console.log("________");
    console.log("🕑 Chạy cron job");
    isRunning = true; // Đặt cờ khi bắt đầu chạy

    let allRows = { ...oldDataDict };
    const newIds = [];
    const restoredIds = [];

    try {
        for (const district of districts) {
            let lastKey = 0;
            const listIds = [];
            const removedIds = [];
            let hasError = false;
            let retryCount = 0;
            console.log(`📍 Đang tìm kiếm dữ liệu cho: ${district.code}`);

            while (retryCount < 3) {
                let response;
                try {
                    response = await axios.post(
                        `${BASE_URL}/main/room-sale/search`,
                        qs.stringify({ _lastKey: lastKey, "sort-by": "1", "district-code": district.code }),
                        { 
                            headers: { "X-CSRF-TOKEN": auth.csrfToken, "Cookie": auth.cookies },
                            withCredentials: true,
                            timeout: 2000
                        }
                    );
                } catch (error) {
                    retryCount++;
                    if (retryCount >= 3) {
                        hasError = true;
                        console.error(`❌ Lỗi từ server khi tìm kiếm: ${district.code}`);
                        break; // Dừng lại nếu vượt quá 3 lần retry
                    }
                    continue; // Thử lại nếu chưa đủ 3 lần
                }
                let rows = response.data.rows || [];
                if (!rows.length) break; // Nếu hết data thì thoát vòng lặp

                for (const row of rows) {
                    row._id = row._id.toString();
                    row.province_id = 79;
                    row.district_id = district.code;
                    row.ward_id = null;
                    row.deleted_at = null;
                    row.fake_address = getFakeAddress(row.house_address);
                    row.fake_road = getFakeRoad(row.fake_address);

                    const addressParts = row.house_address.split(", ");
                    if (addressParts.length >= 3) {
                        row.ward_id = wardMap[addressParts.at(-3)] || null;
                        row.district_id = districtMap[addressParts.at(-2)] || null;
                    }
                    listIds.push(row._id);

                    row.images = await getRoomImages(auth, row.house_key, row._id);
                    if (oldDataDict[row._id]) {
                        const mergedImages = Array.from(
                            new Set([...(oldDataDict[row._id].images || []), ...(row.images || [])])
                        );

                        allRows[row._id] = {
                            ...oldDataDict[row._id],
                            ...row,
                            images: mergedImages,
                        };
                    } else {
                        newIds.push(row._id);
                        allRows[row._id] = row;
                    }

                    if (oldDataDict[row._id]?.deleted_at) {
                        row.deleted_at = null;
                        restoredIds.push(row._id);
                    }
                }
                lastKey += 10;
            }

            if (!hasError) { // Chỉ cập nhật dữ liệu nếu không có lỗi
                const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                for (const oldId in oldDataDict) {
                    if (oldDataDict[oldId].district_id === district.code && !listIds.includes(oldId)) {
                        oldDataDict[oldId].deleted_at = nowStr;
                        allRows[oldId] = oldDataDict[oldId];
                        removedIds.push(oldId);
                    }
                }

                const parseDate = (dateString) => {
                    if (!dateString) return new Date(0);
                    const [datePart, timePart] = dateString.split(' ');
                    const [day, month, year] = datePart.split('/');
                    return new Date(`${year}-${month}-${day}T${timePart}`);
                };

                const updatedData = Object.values(allRows).sort((a, b) => parseDate(b.last_update) - parseDate(a.last_update));

                fs.writeFileSync(path.join(__dirname, "public/data/data.json"), JSON.stringify(updatedData, null, 4), "utf-8");
                Object.assign(oldDataDict, allRows);
                console.log(`      ✅ Đã cập nhật dữ liệu cho: ${district.code}`);
                if (newIds.length) console.log(`      🚀 ID mới: ${newIds.length}`);
                if (restoredIds.length) console.log(`      🔄 ID đã khôi phục: ${restoredIds.length}`);
                if (removedIds.length) console.log(`      🗑️ ID đã xóa: ${removedIds.length}`);
            }
            console.log(`      🔹 _lastKey = ${lastKey}`);
        }
    } catch (error) {
        console.error("❌ Lỗi trong quá trình fetch dữ liệu");
    }

    isRunning = false;
    console.log("________");
    console.log("\n\n\n");
};

cron.schedule("* * * * *", async () => {
    if (!isRunning) {
        const auth = await login();
        if (auth) await fetchData(auth);
    } else {
        console.log("      ⚠️ Cron job đang chạy");
    }
});

cron.schedule('*/5 * * * *', async () => {
    const endTime = Date.now() + 4 * 60 * 1000; // Giới hạn 3 phút

    while (Date.now() < endTime) {
        try {
            const response = await axios.get('https://quanly-nhatrovn.onrender.com/', { timeout: 10000 });
            console.log('✅ Phản hồi https://quanly-nhatrovn.onrender.com/:', response.status);
             if (response.status === 200) return;
        } catch {
            // console.error('❌ Lỗi khi gọi https://quanly-nhatrovn.onrender.com/');
        }
        await new Promise(r => setTimeout(r, 2000)); // Chờ 2 giây
    }
    console.warn('⏹️ Hết 4 phút, dừng vòng lặp.');
});

(async () => {
    console.log("🚀 Bắt đầu chạy script...");
    const auth = await login();
    if (auth) await fetchData(auth);
})();

export default () => {
    // This allows us to import and run this file without any explicit calls.
};
