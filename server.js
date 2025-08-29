// const https = require('https');
import fs from "fs";
import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import fetchRooms from './fetchRooms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Cấu hình view engine EJS
app.set("view engine", "ejs");
app.use(express.static("public"));

// Bản đồ ánh xạ các tham số truy vấn thành key trong dữ liệu
const queryKeyMapping = {
    "room-info-cooling-type": "cooling_type",
    "room-info-location": "location",
    "optGac": "opt_gac",
    "mlanh": "mlanh",
    "gitroi": "gitroi",
    "optToilet": "opt_toilet",
    "optBep": "opt_bep",
    "optBonRuaChen": "opt_bonruachen",
    "optSanPhoi": "opt_sanphoi",
    "optWindow": "opt_window",
    "optBanCong": "opt_bancong",
    "optNhaXe": "opt_nhaxe",
    "optTuLanh": "opt_tulanh",
    "optTivi": "opt_tivi",
    "optMayGiat": "opt_maygiat",
    "optLoViSong": "opt_lovisong",
    "optElevator": "opt_elevator",
    "optNuocNong": "opt_nuocnong",
    "optGiuong": "opt_giuong",
    "optNem": "opt_nem",
    "optDrap": "opt_drap",
    "optGateLockType": "opt_gatelocktype",
    "optTuQuanAo": "opt_tuquanao",
    "optBan": "opt_ban",
    "optGhe": "opt_ghe",
    "optPet": "opt_pet"
};

// Định nghĩa khoảng giá dựa trên price-room
const priceRanges = {
    "1": { min: 0, max: 2000000 },
    "2": { min: 2000000, max: 3000000 },
    "3": { min: 3000000, max: 4000000 },
    "4": { min: 4000000, max: 5000000 },
    "5": { min: 5000000, max: 6000000 },
    "6": { min: 6000000, max: 8000000 },
    "7": { min: 8000000, max: Infinity }
};

// Route hiển thị trang chính
app.get("/", (req, res) => {
    fs.readFile(path.join(__dirname, "public/data/data.json"), "utf8", (err, data) => {
        if (err) {
            return res.status(500).send("Lỗi đọc file JSON");
        }
        let rooms = JSON.parse(data);
        rooms = removeDeletedData(rooms);
        rooms = rooms.slice(0, 10);
        res.render("index", { rooms });
    });
});

// API lấy danh sách phòng theo các tiêu chí lọc
app.get("/api/rooms", (req, res) => {
    fs.readFile(path.join(__dirname, "public/data/data.json"), "utf8", (err, data) => {
        if (err) {
            return res.status(500).json({ error: "Lỗi đọc file JSON" });
        }

        // console.log(req.query);
        let rooms = JSON.parse(data);
        !req.query['show-soft-delete'] && (rooms = removeDeletedData(rooms)); // Loại bỏ các phòng đã bị xóa

        req.query['show-soft-delete'] && (rooms = rooms.filter(room => room.deleted_at != null));

        // Lọc theo Quận/Huyện
        if (req.query["district_id"]) {
            rooms = rooms.filter(room => room.district_id == req.query["district_id"]);
        }

        // Lọc theo Phường/Xã
        if (req.query["ward_id"]) {
            rooms = rooms.filter(room => room.ward_id == req.query["ward_id"]);
        }

        // Lọc theo input-search
        if (req.query["input-search"]) {
            const search = req.query["input-search"].toLowerCase();
            const pattern = search.split("").join(".*"); // Tạo regex kiểu %a%b%c%
            const regex = new RegExp(pattern, "i"); // "i" để không phân biệt hoa thường

            rooms = rooms.filter(room => regex.test(room.fake_address));
        }

        // Lọc theo khoảng giá dựa trên price-room
        if (req.query["price-room"] && priceRanges[req.query["price-room"]]) {
            const { min, max } = priceRanges[req.query["price-room"]];
            rooms = rooms.filter(room => {
                const price = parseInt(room.gia_cho_thue.replace(/[^0-9]/g, ""), 10) || 0;
                return price >= min && price <= max;
            });
        }

        // Duyệt qua tất cả các tham số truy vấn để lọc dữ liệu
        Object.keys(req.query).forEach(key => {
            const value = req.query[key];
            if (value && value != "ALL" && value.trim() != "" && queryKeyMapping[key]) {
                // console.log(key, value);
                rooms = rooms.filter(room => {
                    const mappedKey = queryKeyMapping[key] || key; // Chuyển đổi key nếu cần
                    if (key in room) {
                        return room[key].toString().toLowerCase().includes(value.toLowerCase());
                    }
                    if (room.room_info && mappedKey in room.room_info) {
                        return room.room_info[mappedKey].toString().toLowerCase().includes(value.toLowerCase());
                    }
                    return false;
                });
            }
        });
        // console.log(rooms);

        // Sắp xếp dữ liệu theo tiêu chí sort-by
        const parseDate = (dateString) => {
            if (!dateString) return new Date(0); // Trả về ngày cực nhỏ nếu không có dữ liệu
            const [datePart, timePart] = dateString.split(' ');
            const [day, month, year] = datePart.split('/');
            return new Date(`${year}-${month}-${day}T${timePart}`);
        };

        const parsePrice = (priceString) => {
            return parseInt(priceString?.replace(/[^0-9]/g, ""), 10) || 0; // Xử lý giá và mặc định về 0 nếu null
        };

        if (req.query["sort-by"]) {
            rooms.sort((a, b) => {
                switch (req.query["sort-by"]) {
                    case "1": // Sắp xếp theo ngày cập nhật mới nhất
                        return parseDate(b.last_update) - parseDate(a.last_update);
                    case "3": // Sắp xếp theo giá tăng dần
                        return parsePrice(a.gia_cho_thue) - parsePrice(b.gia_cho_thue);
                    case "4": // Sắp xếp theo giá giảm dần
                        return parsePrice(b.gia_cho_thue) - parsePrice(a.gia_cho_thue);
                    default:
                        return 0; // Không làm gì nếu giá trị không hợp lệ
                }
            });
        }
        const totalRooms = rooms.length;

        '_lastKey' in req.query && (rooms = rooms.slice(req.query['_lastKey'], +req.query['_lastKey'] + 10)); // Giới hạn số lượng phòng trả v

        res.json({
            total: totalRooms, // Tổng tất cả phòng
            data: rooms,       // Danh sách phòng sau phân trang
        }); // Trả về danh sách phòng sau khi lọc và sắp xếp
    });
});

// API để lấy template Room Card
app.get("/room-template", (req, res) => {
    fs.readFile(path.join(__dirname, "views/partials/room-card.ejs"), "utf8", (err, data) => {
        if (err) {
            return res.status(500).send("Lỗi tải template");
        }
        res.send(data);
    });
});

// Hàm loại bỏ các phòng đã bị xóa (deleted_at không null)
function removeDeletedData(rooms) {
    return rooms.filter(room => room.deleted_at === null);
}

fetchRooms();

// Khởi động server tại cổng 3000
app.listen(3000, () => {
    console.log("Server đang chạy trên cổng 3000");
});
