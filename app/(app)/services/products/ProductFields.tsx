"use client";

import { useState } from "react";

export type ServiceOption = { id: string; name: string; default_unit: string | null; uses_sub_categories?: boolean };
export type SubCategoryOption = { id: string; name: string };
export type ProductValues = {
  name?: string;
  priority?: number;
  service_id?: string | null;
  uom?: string | null;
  description?: string | null;
  category?: string | null;
  is_multipiece?: boolean;
  pieces?: number;
  sub_category_id?: string | null;
};

const UNITS = [
  { v: "per_piece", l: "Per piece" },
  { v: "per_kg", l: "Per kg" },
  { v: "per_set", l: "Per set" },
];
const normUnit = (u: string | null | undefined) => (u ? (u.startsWith("per_") ? u : `per_${u}`) : "");

const field = "w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block text-[12px] font-semibold text-ink/60";
const req = <span className="text-[#b5651d]">*</span>;

/**
 * The product fields used by Add and Edit: name, priority, service type, unit,
 * description, category and multipiece. Choosing a service fills in its usual unit.
 */
export function ProductFields({
  services,
  subCategories,
  values = {},
  idPrefix,
}: {
  services: ServiceOption[];
  subCategories: SubCategoryOption[];
  values?: ProductValues;
  idPrefix: string;
}) {
  const [uom, setUom] = useState(normUnit(values.uom) || "");
  const [multi, setMulti] = useState(!!values.is_multipiece);
  const [serviceId, setServiceId] = useState(values.service_id ?? "");
  const usesSub = !!services.find((s) => s.id === serviceId)?.uses_sub_categories;
  const id = (s: string) => `${idPrefix}-${s}`;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={label + " sm:col-span-2"} htmlFor={id("name")}>
        Product name {req}
        <input id={id("name")} name="name" required defaultValue={values.name ?? ""} placeholder="e.g. Shirt, Saree, Blanket (double)" className={field + " mt-1"} />
      </label>
      <label className={label} htmlFor={id("service")}>
        Service type {req}
        <select
          id={id("service")}
          name="service_id"
          required
          defaultValue={values.service_id ?? ""}
          onChange={(e) => {
            setServiceId(e.target.value);
            const s = services.find((x) => x.id === e.target.value);
            if (s?.default_unit) setUom(normUnit(s.default_unit));
          }}
          className={field + " mt-1"}
        >
          <option value="" disabled>
            Select service type
          </option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className={label} htmlFor={id("uom")}>
        UOM (charged) {req}
        <select id={id("uom")} name="uom" required value={uom} onChange={(e) => setUom(e.target.value)} className={field + " mt-1"}>
          <option value="" disabled>
            Select UOM
          </option>
          {UNITS.map((u) => (
            <option key={u.v} value={u.v}>
              {u.l}
            </option>
          ))}
        </select>
      </label>
      {usesSub && (
        <label className={label + " sm:col-span-2"} htmlFor={id("sub")}>
          Sub category {req}
          <select id={id("sub")} name="sub_category_id" required defaultValue={values.sub_category_id ?? ""} className={field + " mt-1"}>
            <option value="" disabled>
              Select sub category
            </option>
            {subCategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={label} htmlFor={id("priority")}>
        Priority
        <input id={id("priority")} name="priority" type="number" min={0} max={9999} defaultValue={values.priority ?? 1} className={field + " mt-1"} />
        <span className="mt-0.5 block font-normal text-ink/40">Lower numbers show first.</span>
      </label>
      <label className={label} htmlFor={id("category")}>
        Category
        <input id={id("category")} name="category" defaultValue={values.category ?? ""} placeholder="e.g. Men's wear" list="item-categories" className={field + " mt-1"} />
      </label>
      <label className={label + " sm:col-span-2"} htmlFor={id("description")}>
        Description
        <textarea id={id("description")} name="description" rows={2} defaultValue={values.description ?? ""} placeholder="Description" className={field + " mt-1"} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" name="is_multipiece" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="h-4 w-4" />
          Multipiece
        </label>
        {multi && (
          <label className="flex items-center gap-2 text-[13px] text-ink/70">
            Pieces in one
            <input name="pieces" type="number" min={2} max={50} defaultValue={values.pieces && values.pieces > 1 ? values.pieces : 2} className="w-20 border border-black/10 px-2 py-1.5 text-sm" />
            <span className="text-ink/40">(each piece gets its own tag)</span>
          </label>
        )}
      </div>
    </div>
  );
}
