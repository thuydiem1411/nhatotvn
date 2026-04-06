import React, { useEffect, useState } from "react";

export function AdsFilterBar({ filters, onApply, areas = [], wards = [], regionName = "", loadingRegion = false }) {
  const [local, setLocal] = useState(filters);

  useEffect(() => {
    setLocal(filters);
  }, [filters]);

  useEffect(() => {
    // Debounce text search to avoid firing API on every keystroke.
    const timer = setTimeout(() => {
      if (local.q !== filters.q) {
        onApply(local);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [local.q, local, filters.q, onApply]);

  function handleReset() {
    const resetValue = {
      category: "all",
      area_v2: "",
      ward: "",
      price_min: "2000000",
      price_max: "4000000",
      company: "personal",
      q: "",
      only_backup: true,
      sort: "newest",
    };
    setLocal(resetValue);
    onApply(resetValue);
  }

  function updateField(key, value) {
    setLocal((prev) => {
      let next = prev;
      if (key === "area_v2") {
        next = { ...prev, area_v2: value, ward: "" };
      } else {
        next = { ...prev, [key]: value };
      }

      // Apply immediately for structured filters to keep UX responsive.
      if (key !== "q") {
        onApply(next);
      }
      return next;
    });
  }

  function handleApply() {
    onApply(local);
  }

  function applyPricePreset(min, max) {
    const next = {
      ...local,
      price_min: min,
      price_max: max,
    };
    setLocal(next);
    onApply(next);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">Bộ lọc</h2>
        <span className="text-xs text-slate-500">
          {loadingRegion ? "Đang tải vùng..." : `Region: ${regionName || "N/A"}`}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          value={local.category}
          onChange={(e) => updateField("category", e.target.value)}
        >
          <option value="all">Tất cả danh mục</option>
          <option value="1050">Phòng trọ</option>
          <option value="1020">Nhà ở</option>
        </select>

        <select
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          value={local.area_v2}
          onChange={(e) => updateField("area_v2", e.target.value)}
        >
          <option value="">Tất cả quận/huyện</option>
          {areas.map((a) => (
            <option key={a.area_v2} value={a.area_v2}>
              {a.area_name}
            </option>
          ))}
        </select>

        <select
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          value={local.ward}
          onChange={(e) => updateField("ward", e.target.value)}
          disabled={!local.area_v2}
        >
          <option value="">Tất cả phường/xã</option>
          {wards.map((w) => (
            <option key={w.ward_id} value={w.ward_id}>
              {w.ward_name}
            </option>
          ))}
        </select>

        <select
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          value={local.company}
          onChange={(e) => updateField("company", e.target.value)}
        >
          <option value="all">Tất cả người đăng</option>
          <option value="personal">Chính chủ</option>
          <option value="agent">Môi giới</option>
        </select>

        <input
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          type="number"
          placeholder="Giá từ (VND)"
          value={local.price_min}
          onChange={(e) => updateField("price_min", e.target.value)}
        />

        <input
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          type="number"
          placeholder="Giá đến (VND)"
          value={local.price_max}
          onChange={(e) => updateField("price_max", e.target.value)}
        />

        <select
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          value={local.sort}
          onChange={(e) => updateField("sort", e.target.value)}
        >
          <option value="newest">Mới nhất</option>
          <option value="oldest">Cũ nhất</option>
          <option value="price_asc">Giá tăng dần</option>
          <option value="price_desc">Giá giảm dần</option>
        </select>

        <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(local.only_backup)}
            onChange={(e) => updateField("only_backup", e.target.checked)}
          />
          Chỉ tin có backup ảnh
        </label>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto]">
        <input
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          placeholder="Tìm kiếm tiêu đề, mô tả... (tự lọc sau 350ms)"
          value={local.q}
          onChange={(e) => updateField("q", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleApply();
          }}
        />
        <button
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          onClick={handleApply}
          type="button"
        >
          Áp dụng
        </button>
        <button
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          onClick={handleReset}
          type="button"
        >
          Đặt lại
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
          onClick={() => applyPricePreset("", "")}
        >
          Tất cả mức giá
        </button>
        <button
          type="button"
          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
          onClick={() => applyPricePreset("0", "3000000")}
        >
          Dưới 3 triệu
        </button>
        <button
          type="button"
          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
          onClick={() => applyPricePreset("3000000", "5000000")}
        >
          3 - 5 triệu
        </button>
        <button
          type="button"
          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
          onClick={() => applyPricePreset("5000000", "10000000")}
        >
          5 - 10 triệu
        </button>
        <button
          type="button"
          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
          onClick={() => applyPricePreset("10000000", "")}
        >
          Trên 10 triệu
        </button>
      </div>
    </section>
  );
}

