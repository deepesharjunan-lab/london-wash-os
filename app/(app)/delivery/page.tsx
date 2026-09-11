import { createClient } from "@/lib/supabase/server";
import {
  addDriver,
  toggleDriverActive,
  addDeliveryZone,
  addRoute,
  updateRouteStatus,
  createPickup,
  updatePickupStatus,
  createDelivery,
  updateDeliveryStatus,
} from "./actions";

function formatMinor(minor) {
  if (minor === null || minor === undefined) return "-";
  return "₹" + (minor / 100).toFixed(2);
}

export default async function DeliveryPage() {
  const supabase = createClient();

  const [
    { data: drivers },
    { data: zones },
    { data: routes },
    { data: pickups },
    { data: deliveries },
    { data: orders },
    { data: customers },
    { data: addresses },
  ] = await Promise.all([
    supabase.from("driver").select("*").is("deleted_at", null).order("full_name"),
    supabase.from("delivery_zone").select("*").is("deleted_at", null).order("name"),
    supabase.from("route").select("*").order("route_date", { ascending: false }),
    supabase.from("pickup").select("*").order("created_at", { ascending: false }),
    supabase.from("delivery").select("*").order("created_at", { ascending: false }),
    supabase.from("order").select("id, order_number, customer_id").order("order_number"),
    supabase.from("customer").select("id, full_name"),
    supabase.from("customer_address").select("id, customer_id, label, address_line"),
  ]);

  const driverName = new Map((drivers || []).map((d) => [d.id, d.full_name]));
  const zoneName = new Map((zones || []).map((z) => [z.id, z.name]));
  const orderNumber = new Map((orders || []).map((o) => [o.id, o.order_number]));
  const orderCustomer = new Map((orders || []).map((o) => [o.id, o.customer_id]));
  const customerName = new Map((customers || []).map((c) => [c.id, c.full_name]));
  const addressLabel = new Map(
    (addresses || []).map((a) => [a.id, (a.label ? a.label + ": " : "") + a.address_line])
  );
  const routeLabel = new Map(
    (routes || []).map((r) => [r.id, r.route_date + " (" + (zoneName.get(r.delivery_zone_id) || "-") + ")"])
  );

  const deliveryStatuses = ["scheduled", "en_route", "completed", "failed", "cancelled"];
  const pickupStatuses = ["scheduled", "en_route", "completed", "failed", "cancelled"];
  const routeStatuses = ["planned", "in_progress", "completed"];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Delivery Ops</h1>
        <p className="text-sm text-slate-500">Drivers, delivery zones, routes, pickups and deliveries.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Drivers</h2>
          <details className="relative">
            <summary className="cursor-pointer rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              Add Driver
            </summary>
            <form
              action={addDriver}
              className="absolute right-0 z-10 mt-2 w-72 space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-600">Full Name</label>
                <input name="full_name" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Phone</label>
                <input name="phone" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Vehicle Number</label>
                <input name="vehicle_number" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                Save Driver
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Phone</th>
              <th className="py-2">Vehicle</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(drivers || []).map((d) => (
              <tr key={d.id} className="border-b border-slate-100">
                <td className="py-2 font-medium text-slate-900">{d.full_name}</td>
                <td className="py-2 text-slate-600">{d.phone}</td>
                <td className="py-2 text-slate-600">{d.vehicle_number || "-"}</td>
                <td className="py-2">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (d.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {d.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <form action={toggleDriverActive}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="next_active" value={d.is_active ? "false" : "true"} />
                    <button type="submit" className="text-xs font-medium text-blue-600 hover:underline">
                      {d.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!drivers || drivers.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No drivers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Delivery Zones</h2>
          <details className="relative">
            <summary className="cursor-pointer rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              Add Zone
            </summary>
            <form
              action={addDeliveryZone}
              className="absolute right-0 z-10 mt-2 w-72 space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-600">Zone Name</label>
                <input name="name" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Pincode Prefixes (comma separated)</label>
                <input name="pincode_prefixes" placeholder="682001, 682002" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                Save Zone
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2">Zone</th>
              <th className="py-2">Pincode Prefixes</th>
            </tr>
          </thead>
          <tbody>
            {(zones || []).map((z) => (
              <tr key={z.id} className="border-b border-slate-100">
                <td className="py-2 font-medium text-slate-900">{z.name}</td>
                <td className="py-2 text-slate-600">{(z.pincode_prefixes || []).join(", ") || "-"}</td>
              </tr>
            ))}
            {(!zones || zones.length === 0) && (
              <tr>
                <td colSpan={2} className="py-4 text-center text-slate-400">
                  No delivery zones yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Routes</h2>
          <details className="relative">
            <summary className="cursor-pointer rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              Create Route
            </summary>
            <form
              action={addRoute}
              className="absolute right-0 z-10 mt-2 w-72 space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-600">Driver</label>
                <select name="driver_id" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Unassigned</option>
                  {(drivers || []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Delivery Zone</label>
                <select name="delivery_zone_id" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">None</option>
                  {(zones || []).map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Route Date</label>
                <input type="date" name="route_date" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                Save Route
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2">Date</th>
              <th className="py-2">Driver</th>
              <th className="py-2">Zone</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(routes || []).map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2 font-medium text-slate-900">{r.route_date}</td>
                <td className="py-2 text-slate-600">{driverName.get(r.driver_id) || "-"}</td>
                <td className="py-2 text-slate-600">{zoneName.get(r.delivery_zone_id) || "-"}</td>
                <td className="py-2 text-slate-600">{r.status}</td>
                <td className="py-2 text-right">
                  <form action={updateRouteStatus} className="inline-flex items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="status" defaultValue={r.status} className="rounded-md border border-slate-300 px-1.5 py-1 text-xs">
                      {routeStatuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs font-medium text-blue-600 hover:underline">
                      Update
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!routes || routes.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No routes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Pickups</h2>
          <details className="relative">
            <summary className="cursor-pointer rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              Schedule Pickup
            </summary>
            <form
              action={createPickup}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-600">Order</label>
                <select name="order_id" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Select order</option>
                  {(orders || []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number} - {customerName.get(o.customer_id) || "-"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Route</label>
                <select name="route_id" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Unassigned</option>
                  {(routes || []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {routeLabel.get(r.id)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Address</label>
                <select name="customer_address_id" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">None</option>
                  {(addresses || []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {addressLabel.get(a.id)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Window Start</label>
                <input type="datetime-local" name="scheduled_window_start" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Window End</label>
                <input type="datetime-local" name="scheduled_window_end" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                Save Pickup
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2">Order</th>
              <th className="py-2">Customer</th>
              <th className="py-2">Route</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(pickups || []).map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-2 font-medium text-slate-900">{orderNumber.get(p.order_id) || "-"}</td>
                <td className="py-2 text-slate-600">{customerName.get(p.customer_id) || "-"}</td>
                <td className="py-2 text-slate-600">{p.route_id ? routeLabel.get(p.route_id) : "-"}</td>
                <td className="py-2 text-slate-600">{p.status}</td>
                <td className="py-2 text-right">
                  <form action={updatePickupStatus} className="inline-flex items-center gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <select name="status" defaultValue={p.status} className="rounded-md border border-slate-300 px-1.5 py-1 text-xs">
                      {pickupStatuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs font-medium text-blue-600 hover:underline">
                      Update
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!pickups || pickups.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No pickups yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Deliveries</h2>
          <details className="relative">
            <summary className="cursor-pointer rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              Schedule Delivery
            </summary>
            <form
              action={createDelivery}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-600">Order</label>
                <select name="order_id" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Select order</option>
                  {(orders || []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number} - {customerName.get(o.customer_id) || "-"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Route</label>
                <select name="route_id" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Unassigned</option>
                  {(routes || []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {routeLabel.get(r.id)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Address</label>
                <select name="customer_address_id" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">None</option>
                  {(addresses || []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {addressLabel.get(a.id)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Window Start</label>
                <input type="datetime-local" name="scheduled_window_start" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Window End</label>
                <input type="datetime-local" name="scheduled_window_end" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                Save Delivery
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2">Order</th>
              <th className="py-2">Route</th>
              <th className="py-2">Status</th>
              <th className="py-2">Cash Collected</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(deliveries || []).map((d) => (
              <tr key={d.id} className="border-b border-slate-100">
                <td className="py-2 font-medium text-slate-900">{orderNumber.get(d.order_id) || "-"}</td>
                <td className="py-2 text-slate-600">{d.route_id ? routeLabel.get(d.route_id) : "-"}</td>
                <td className="py-2 text-slate-600">{d.status}</td>
                <td className="py-2 text-slate-600">{formatMinor(d.cash_collected_minor)}</td>
                <td className="py-2 text-right">
                  <form action={updateDeliveryStatus} className="inline-flex items-center gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    <select name="status" defaultValue={d.status} className="rounded-md border border-slate-300 px-1.5 py-1 text-xs">
                      {deliveryStatuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      name="cash_collected"
                      placeholder="Cash"
                      className="w-20 rounded-md border border-slate-300 px-1.5 py-1 text-xs"
                    />
                    <button type="submit" className="text-xs font-medium text-blue-600 hover:underline">
                      Update
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!deliveries || deliveries.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No deliveries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
