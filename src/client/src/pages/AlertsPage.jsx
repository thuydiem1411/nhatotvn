import React, { useEffect, useState } from "react";
import { createAlertRule, deleteAlertRule, fetchAlertRules, fetchRegionTree, updateAlertRule } from "../api/listingApi.js";

const EMPTY_FORM = {
  name: "",
  enabled: true,
  areas: [],
  wards: [],
  categories: ["1050", "1020"],
  price_min: "",
  price_max: "",
  company_mode: "all",
  keyword: "",
};

function ruleToForm(r) {
  return {
    name: r.name || "",
    enabled: !!r.enabled,
    areas: Array.isArray(r.areas) ? r.areas.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [],
    wards: Array.isArray(r.wards) ? r.wards.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [],
    categories: Array.isArray(r.categories) ? r.categories.filter((x) => x === "1050" || x === "1020") : ["1050", "1020"],
    price_min: r.price_min ?? "",
    price_max: r.price_max ?? "",
    company_mode: r.company_mode || "all",
    keyword: r.keyword || "",
  };
}

export function AlertsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [areas, setAreas] = useState([]);
  const [wardByArea, setWardByArea] = useState(new Map());

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const r = await fetchAlertRules();
      setItems(Array.isArray(r?.items) ? r.items : []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadRegion() {
      try {
        const tree = await fetchRegionTree(13000);
        if (!alive) return;
        const nextAreas = Array.isArray(tree?.areas) ? tree.areas : [];
        setAreas(nextAreas);
        const m = new Map();
        nextAreas.forEach((a) => {
          m.set(Number(a.area_v2), Array.isArray(a.wards) ? a.wards : []);
        });
        setWardByArea(m);
      } catch {
        if (!alive) return;
        setAreas([]);
        setWardByArea(new Map());
      }
    }
    loadRegion();
    return () => {
      alive = false;
    };
  }, []);

  const selectedAreaSet = new Set((form.areas || []).map((n) => Number(n)));
  const wardOptions = areas
    .filter((a) => selectedAreaSet.has(Number(a.area_v2)))
    .flatMap((a) => wardByArea.get(Number(a.area_v2)) || [])
    .filter((w) => Number.isFinite(Number(w.ward_id)));

  async function submit(e) {
    e.preventDefault();
    const payload = {
      name: form.name,
      enabled: !!form.enabled,
      areas: (form.areas || []).map((n) => Number(n)).filter((n) => Number.isFinite(n)),
      wards: (form.wards || []).map((n) => Number(n)).filter((n) => Number.isFinite(n)),
      categories: Array.isArray(form.categories) ? form.categories.filter((x) => x === "1050" || x === "1020") : [],
      price_min: form.price_min === "" ? null : Number(form.price_min),
      price_max: form.price_max === "" ? null : Number(form.price_max),
      company_mode: form.company_mode,
      keyword: form.keyword.trim(),
    };
    if (editId) await updateAlertRule(editId, payload);
    else await createAlertRule(payload);
    setForm(EMPTY_FORM);
    setEditId(null);
    await reload();
  }

  function onChangeMultiNumber(field, event) {
    const values = Array.from(event.target.selectedOptions)
      .map((o) => Number(o.value))
      .filter((n) => Number.isFinite(n));
    setForm((s) => ({ ...s, [field]: values }));
  }

  function toggleCategory(cat) {
    setForm((s) => {
      const prev = Array.isArray(s.categories) ? s.categories : [];
      const has = prev.includes(cat);
      const next = has ? prev.filter((x) => x !== cat) : [...prev, cat];
      return { ...s, categories: next };
    });
  }

  function toggleCompanyMode(mode) {
    setForm((s) => {
      if (s.company_mode === mode) return { ...s, company_mode: "all" };
      return { ...s, company_mode: mode };
    });
  }

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <header className="mb-4 rounded-2xl bg-slate-900 p-5 text-white shadow-lg">
        <h1 className="text-2xl font-bold">Alert Rules Config</h1>
        <p className="mt-1 text-sm text-slate-200">Rule match ad moi trong crawl se gui Pushmore.</p>
      </header>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
          <input className="rounded border px-3 py-2" placeholder="Rule name" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
          <div className="rounded border px-3 py-2">
            <p className="mb-1 text-xs text-slate-600">Company mode</p>
            <label className="mr-3 inline-flex items-center gap-1 text-sm">
              <input type="checkbox" checked={form.company_mode === "personal"} onChange={() => toggleCompanyMode("personal")} />
              personal
            </label>
            <label className="inline-flex items-center gap-1 text-sm">
              <input type="checkbox" checked={form.company_mode === "agent"} onChange={() => toggleCompanyMode("agent")} />
              agent
            </label>
            <span className="ml-3 text-xs text-slate-500">(none checked = all)</span>
          </div>
          <div className="grid gap-1">
            <label className="text-xs text-slate-600">Areas (multi-select)</label>
            <select
              multiple
              className="min-h-[140px] rounded border px-2 py-2"
              value={(form.areas || []).map(String)}
              onChange={(e) => onChangeMultiNumber("areas", e)}
            >
              {areas.map((a) => (
                <option key={a.area_v2} value={a.area_v2}>
                  {a.area_name} ({a.area_v2})
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-xs text-slate-600">Wards (multi-select, filtered by selected areas)</label>
            <select
              multiple
              className="min-h-[140px] rounded border px-2 py-2"
              value={(form.wards || []).map(String)}
              onChange={(e) => onChangeMultiNumber("wards", e)}
            >
              {wardOptions.map((w) => (
                <option key={w.ward_id} value={w.ward_id}>
                  {w.ward_name} ({w.ward_id})
                </option>
              ))}
            </select>
          </div>
          <div className="rounded border px-3 py-2">
            <p className="mb-1 text-xs text-slate-600">Categories</p>
            <label className="mr-3 inline-flex items-center gap-1 text-sm">
              <input type="checkbox" checked={(form.categories || []).includes("1050")} onChange={() => toggleCategory("1050")} />
              1050 (tro)
            </label>
            <label className="inline-flex items-center gap-1 text-sm">
              <input type="checkbox" checked={(form.categories || []).includes("1020")} onChange={() => toggleCategory("1020")} />
              1020 (nha)
            </label>
          </div>
          <input className="rounded border px-3 py-2" placeholder="Keyword in subject/body" value={form.keyword} onChange={(e) => setForm((s) => ({ ...s, keyword: e.target.value }))} />
          <input className="rounded border px-3 py-2" type="number" placeholder="price_min" value={form.price_min} onChange={(e) => setForm((s) => ({ ...s, price_min: e.target.value }))} />
          <input className="rounded border px-3 py-2" type="number" placeholder="price_max" value={form.price_max} onChange={(e) => setForm((s) => ({ ...s, price_max: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))} />
            Enabled
          </label>
          <div className="md:col-span-2 flex gap-2">
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">
              {editId ? "Update rule" : "Create rule"}
            </button>
            {editId ? (
              <button type="button" className="rounded border px-4 py-2 text-sm" onClick={() => { setEditId(null); setForm(EMPTY_FORM); }}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">Current Rules</h2>
        {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="grid gap-2">
          {items.map((r) => (
            <div key={r.id} className="rounded border p-3 text-sm">
              <div className="font-medium">{r.name} {r.enabled ? "" : "(disabled)"}</div>
              <div className="text-xs text-slate-600">areas: {(r.areas || []).join(",") || "all"} | wards: {(r.wards || []).join(",") || "all"} | cats: {(r.categories || []).join(",") || "all"}</div>
              <div className="text-xs text-slate-600">price: {r.price_min ?? "-"} .. {r.price_max ?? "-"} | company: {r.company_mode} | keyword: {r.keyword || "-"}</div>
              <div className="mt-2 flex gap-2">
                <button className="rounded border px-2 py-1 text-xs" onClick={() => { setEditId(r.id); setForm(ruleToForm(r)); }}>Edit</button>
                <button className="rounded border border-red-300 px-2 py-1 text-xs text-red-700" onClick={async () => { await deleteAlertRule(r.id); await reload(); }}>Delete</button>
              </div>
            </div>
          ))}
          {!loading && items.length === 0 ? <p className="text-sm text-slate-500">No rules yet.</p> : null}
        </div>
      </section>
    </main>
  );
}

