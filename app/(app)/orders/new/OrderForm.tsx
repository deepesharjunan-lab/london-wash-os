"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrder, createCustomerQuick, getCheckoutLoyalty } from "./actions";

type Loyalty = {
  available: number;
  pointValueMinor: number;
  minRedeem: number;
  maxRedeemPct: number;
  denominations: number[];
  vouchers: { code: string; label: string; valueMinor: number; minOrderMinor: number }[];
};

type Customer = { id: string; full_name: string; phone: string };
type PriceListProfile = { id: string; name: string; is_default: boolean | null };
type PriceEntry = {
  id: string;
  price_list_profile_id: string;
  service_id: string;
  service_name: string;
  item_id: string | null;
  item_name: string | null;
  item_sub_category_id?: string | null;
  item_priority?: number;
  service_uses_sub?: boolean;
  unit: string;
  price_minor: number;
};

type CartLine = {
  key: string;
  price_list_entry_id: string;
  service_id: string;
  service_name: string;
  item_id: string | null;
  item_name: string | null;
  unit: string;
  unit_price_minor: number;
  quantity: number;
};

function formatMinor(minor: number) {
  return `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function OrderForm({
  customers,
  priceListProfiles,
  priceEntries,
  defaultCustomerId,
  subCategories = [],
}: {
  customers: Customer[];
  priceListProfiles: PriceListProfile[];
  priceEntries: PriceEntry[];
  defaultCustomerId?: string;
  subCategories?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCreatingCustomer, startCustomerTransition] = useTransition();

  const defaultProfileId =
    priceListProfiles.find((p) => p.is_default)?.id ?? priceListProfiles[0]?.id ?? "";

  const [customersList, setCustomersList] = useState<Customer[]>(customers);
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [priceListProfileId, setPriceListProfileId] = useState(defaultProfileId);
  const [channel, setChannel] = useState("pos_counter");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [lineServiceId, setLineServiceId] = useState("");
  const [lineItemId, setLineItemId] = useState("");
  const [lineSubId, setLineSubId] = useState(""); // "" = all sub categories
  const [lineQty, setLineQty] = useState("1");
  const [formError, setFormError] = useState<string | null>(null);

  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);

  const entriesForProfile = useMemo(
    () => priceEntries.filter((e) => e.price_list_profile_id === priceListProfileId),
    [priceEntries, priceListProfileId]
  );

  const servicesInProfile = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entriesForProfile) map.set(e.service_id, e.service_name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [entriesForProfile]);

  // Laundry services group their products by sub category (Men, Women, Kids...).
  const lineUsesSub = useMemo(
    () => entriesForProfile.some((e) => e.service_id === lineServiceId && e.service_uses_sub),
    [entriesForProfile, lineServiceId]
  );
  const subTabs = useMemo(() => {
    if (!lineUsesSub) return [];
    const present = new Set(entriesForProfile.filter((e) => e.service_id === lineServiceId && e.item_id).map((e) => e.item_sub_category_id ?? ""));
    return subCategories.filter((s) => present.has(s.id));
  }, [lineUsesSub, entriesForProfile, lineServiceId, subCategories]);

  const itemsForLineService = useMemo(() => {
    const opts: { id: string; name: string; priority: number }[] = [];
    let hasAny = false;
    for (const e of entriesForProfile) {
      if (e.service_id !== lineServiceId) continue;
      if (e.item_id === null) hasAny = true;
      else if (!lineSubId || e.item_sub_category_id === lineSubId) opts.push({ id: e.item_id, name: e.item_name ?? "Item", priority: e.item_priority ?? 1 });
    }
    opts.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
    return { hasAny, opts };
  }, [entriesForProfile, lineServiceId, lineSubId]);

  const subtotalMinor = cart.reduce((sum, l) => sum + l.unit_price_minor * l.quantity, 0);

  // Loyalty: points and vouchers for the selected customer
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [voucherCode, setVoucherCode] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoyalty(null);
    setRedeemPoints(0);
    setVoucherCode("");
    if (!customerId) return;
    setLoyaltyLoading(true);
    getCheckoutLoyalty(customerId)
      .then((l) => {
        if (!cancelled) setLoyalty(l as Loyalty | null);
      })
      .catch(() => {
        if (!cancelled) setLoyalty(null);
      })
      .finally(() => {
        if (!cancelled) setLoyaltyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const voucher = loyalty?.vouchers.find((v) => v.code === voucherCode) ?? null;
  const voucherMinor = voucher && subtotalMinor >= voucher.minOrderMinor ? Math.min(voucher.valueMinor, subtotalMinor) : 0;
  const pointsMinor = loyalty ? Math.round(redeemPoints * loyalty.pointValueMinor) : 0;
  const totalMinor = Math.max(0, subtotalMinor - voucherMinor - pointsMinor);
  const pointOptions = loyalty
    ? loyalty.denominations.filter(
        (d) =>
          loyalty.available >= loyalty.minRedeem &&
          d <= loyalty.available &&
          Math.round(d * loyalty.pointValueMinor) <= Math.floor((subtotalMinor * loyalty.maxRedeemPct) / 100) &&
          Math.round(d * loyalty.pointValueMinor) <= subtotalMinor - voucherMinor
      )
    : [];
  useEffect(() => {
    if (redeemPoints && !pointOptions.includes(redeemPoints)) setRedeemPoints(0);
    if (voucher && subtotalMinor < voucher.minOrderMinor) setVoucherCode("");
  }, [subtotalMinor, redeemPoints, pointOptions, voucher]);

  function addLine() {
    setFormError(null);
    if (!lineServiceId) {
      setFormError("Choose a service to add.");
      return;
    }
    const qty = Math.max(1, parseInt(lineQty || "1", 10) || 1);

    let match: PriceEntry | undefined;
    if (lineItemId) {
      match = entriesForProfile.find(
        (e) => e.service_id === lineServiceId && e.item_id === lineItemId
      );
    }
    if (!match) {
      match = entriesForProfile.find(
        (e) => e.service_id === lineServiceId && e.item_id === null
      );
    }
    if (!match) {
      setFormError("No price is set for that service/item combination on this price list.");
      return;
    }

    setCart((prev) => [
      ...prev,
      {
        key: `${match!.id}-${Date.now()}`,
        price_list_entry_id: match!.id,
        service_id: match!.service_id,
        service_name: match!.service_name,
        item_id: lineItemId || null,
        item_name: lineItemId
          ? itemsForLineService.opts.find((o) => o.id === lineItemId)?.name ?? null
          : null,
        unit: match!.unit,
        unit_price_minor: match!.price_minor,
        quantity: qty,
      },
    ]);
    setLineItemId("");
    setLineQty("1");
    // Keep the service and sub category selected, so the next garment of the same kind is quick to add.
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  function handleCreateCustomer() {
    setNewCustomerError(null);
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
      setNewCustomerError("Name and phone are required.");
      return;
    }
    startCustomerTransition(async () => {
      const result = await createCustomerQuick({
        full_name: newCustomerName,
        phone: newCustomerPhone,
      });
      if (result && "error" in result && result.error) {
        setNewCustomerError(result.error);
        return;
      }
      if (result && "customer" in result && result.customer) {
        setCustomersList((prev) => [result.customer as Customer, ...prev]);
        setCustomerId(result.customer.id);
        setShowNewCustomer(false);
        setNewCustomerName("");
        setNewCustomerPhone("");
      }
    });
  }

  function handleSubmit() {
    setFormError(null);
    if (!customerId) {
      setFormError("Select a customer.");
      return;
    }
    if (cart.length === 0) {
      setFormError("Add at least one item to the order.");
      return;
    }
    startTransition(async () => {
      const result = await createOrder({
        customer_id: customerId,
        price_list_profile_id: priceListProfileId || null,
        channel,
        lines: cart.map((l) => ({
          price_list_entry_id: l.price_list_entry_id,
          service_id: l.service_id,
          item_id: l.item_id,
          unit: l.unit,
          unit_price_minor: l.unit_price_minor,
          quantity: l.quantity,
        })),
        redeem_points: redeemPoints || undefined,
        voucher_code: voucherCode || undefined,
      });
      if (result && "error" in result && result.error) {
        setFormError(result.error);
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="rounded-lg border border-black/5 bg-white p-4 shadow-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">Order details</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium text-ink/60">Customer</label>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewCustomer((v) => !v);
                    setNewCustomerError(null);
                  }}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  {showNewCustomer ? "Cancel" : "+ New customer"}
                </button>
              </div>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">Select customer...</option>
                {customersList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} — {c.phone}
                  </option>
                ))}
              </select>

              {showNewCustomer && (
                <div className="mt-2 space-y-2 rounded-md border border-black/10 bg-black/[0.015] p-3">
                  <input
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Full name"
                    className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  <input
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="Phone"
                    className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  {newCustomerError && (
                    <p className="text-xs text-danger">{newCustomerError}</p>
                  )}
                  <button
                    type="button"
                    disabled={isCreatingCustomer}
                    onClick={handleCreateCustomer}
                    className="w-full rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
                  >
                    {isCreatingCustomer ? "Saving..." : "Save & select customer"}
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/60">Price list</label>
              <select
                value={priceListProfileId}
                onChange={(e) => {
                  setPriceListProfileId(e.target.value);
                  setLineServiceId("");
                  setLineItemId("");
                  setLineSubId("");
                }}
                className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {priceListProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/60">Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="pos_counter">Counter</option>
                <option value="phone">Phone</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="portal">Portal</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-black/5 bg-white p-4 shadow-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">Add item</div>
          {subTabs.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Sub category">
              {[{ id: "", name: "All" }, ...subTabs].map((s) => (
                <button
                  key={s.id || "all"}
                  type="button"
                  role="tab"
                  aria-selected={lineSubId === s.id}
                  onClick={() => {
                    setLineSubId(s.id);
                    setLineItemId("");
                  }}
                  className={
                    "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition " +
                    (lineSubId === s.id ? "bg-navy text-[#f8f5ef]" : "border border-black/10 bg-white text-ink/70 hover:bg-beige")
                  }
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_100px_auto]">
            <select
              value={lineServiceId}
              onChange={(e) => {
                setLineServiceId(e.target.value);
                setLineItemId("");
                setLineSubId("");
              }}
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Service...</option>
              {servicesInProfile.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={lineItemId}
              onChange={(e) => setLineItemId(e.target.value)}
              disabled={!lineServiceId}
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent disabled:bg-black/[0.02]"
            >
              <option value="">
                {itemsForLineService.hasAny ? "Any item" : "Select item..."}
              </option>
              {itemsForLineService.opts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={lineQty}
              onChange={(e) => setLineQty(e.target.value)}
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={addLine}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Add
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-4 py-3 text-sm font-bold text-ink">Order items</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 bg-black/[0.02] text-left text-[11px] font-semibold uppercase tracking-wide text-ink/50">
                <th className="px-4 py-2">Service</th>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2">Qty</th>
                <th className="px-4 py-2 text-right">Unit price</th>
                <th className="px-4 py-2 text-right">Line total</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {cart.map((l) => (
                <tr key={l.key} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{l.service_name}</td>
                  <td className="px-4 py-2.5 text-ink/60">{l.item_name ?? "Any item"}</td>
                  <td className="px-4 py-2.5 text-ink/60">{l.quantity}</td>
                  <td className="px-4 py-2.5 text-right text-ink/60">
                    {formatMinor(l.unit_price_minor)} / {l.unit.replace(/^per_/, "")}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-ink">
                    {formatMinor(l.unit_price_minor * l.quantity)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      className="text-xs font-semibold text-danger hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink/40">
                    No items added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-black/5 bg-white p-4 shadow-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">Summary</div>
          <div className="flex items-center justify-between py-1 text-sm text-ink/60">
            <span>Items</span>
            <span>{cart.reduce((n, l) => n + l.quantity, 0)}</span>
          </div>
          <div className="flex items-center justify-between py-1 text-sm text-ink/60">
            <span>Subtotal</span>
            <span>{formatMinor(subtotalMinor)}</span>
          </div>

          {customerId && (
            <div className="my-2 space-y-2 rounded-md border border-black/10 bg-black/[0.015] p-3">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink/50">
                <span>Loyalty</span>
                <span className="normal-case tracking-normal">
                  {loyaltyLoading
                    ? "Loading…"
                    : loyalty
                      ? `${loyalty.available.toLocaleString("en-IN", { maximumFractionDigits: 1 })} points`
                      : "No wallet yet"}
                </span>
              </div>
              {loyalty && (
                <>
                  <select
                    value={redeemPoints}
                    onChange={(e) => setRedeemPoints(Number(e.target.value))}
                    disabled={pointOptions.length === 0}
                    aria-label="Use points"
                    className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent disabled:bg-black/[0.02]"
                  >
                    <option value={0}>
                      {pointOptions.length ? "Don't use points" : loyalty.available < loyalty.minRedeem ? `Needs ${loyalty.minRedeem} points to redeem` : "Add items to use points"}
                    </option>
                    {pointOptions.map((d) => (
                      <option key={d} value={d}>
                        Use {d} points (−{formatMinor(Math.round(d * loyalty.pointValueMinor))})
                      </option>
                    ))}
                  </select>
                  {loyalty.vouchers.length > 0 && (
                    <select
                      value={voucherCode}
                      onChange={(e) => setVoucherCode(e.target.value)}
                      aria-label="Apply a voucher"
                      className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
                    >
                      <option value="">No voucher</option>
                      {loyalty.vouchers.map((v) => (
                        <option key={v.code} value={v.code} disabled={subtotalMinor < v.minOrderMinor}>
                          {v.code} · {v.label} (−{formatMinor(v.valueMinor)})
                          {subtotalMinor < v.minOrderMinor ? ` · min ${formatMinor(v.minOrderMinor)}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </div>
          )}

          {voucherMinor > 0 && (
            <div className="flex items-center justify-between py-1 text-sm text-ink/60">
              <span>Voucher {voucherCode}</span>
              <span>−{formatMinor(voucherMinor)}</span>
            </div>
          )}
          {pointsMinor > 0 && (
            <div className="flex items-center justify-between py-1 text-sm text-ink/60">
              <span>{redeemPoints} points</span>
              <span>−{formatMinor(pointsMinor)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-black/5 py-2 text-base font-bold text-ink">
            <span>Total</span>
            <span>{formatMinor(totalMinor)}</span>
          </div>
          {formError && (
            <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</p>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={handleSubmit}
            className="mt-3 w-full rounded-md bg-accent px-3 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
          >
            {isPending ? "Creating order..." : "Create order"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/orders")}
            className="mt-2 w-full rounded-md border border-black/10 px-3 py-2 text-sm font-semibold text-ink/70 hover:bg-black/[0.02]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
