import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createDevicePrice, deactivateDevicePrice } from "./actions";
import { Badge } from "../../../components/Badge";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: prices } = await supabase
    .from("device_pricing")
    .select("*")
    .order("model", { ascending: true })
    .limit(200);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Repair Pricing</h1>
        <p className="text-muted text-sm">
          The AI receptionist only ever quotes prices from this table — it never guesses. Keep it current.
        </p>
      </div>

      <div className="surface rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold">Add a price</h2>
        <form action={createDevicePrice} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <input name="model" placeholder="Model (e.g. Samsung A15)" required className="input" />
          <input name="variant" placeholder="Variant (optional)" className="input" />
          <input name="part" placeholder="Part (e.g. display)" required className="input" />
          <input
            name="quality"
            placeholder="Quality (e.g. original)"
            required
            defaultValue="standard"
            className="input"
          />
          <input name="price" type="number" min="0" step="0.01" placeholder="Price" required className="input" />
          <input
            name="laborCharge"
            type="number"
            min="0"
            step="0.01"
            placeholder="Labor charge"
            required
            defaultValue="0"
            className="input"
          />
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 col-span-2 rounded-md px-4 py-2 text-sm font-medium text-white transition sm:col-span-1"
          >
            Add price
          </button>
        </form>
      </div>

      <div className="surface overflow-x-auto rounded-xl">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-muted border-b text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Variant</th>
              <th className="px-4 py-3">Part</th>
              <th className="px-4 py-3">Quality</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Labor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(prices ?? []).map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-3 whitespace-nowrap">{p.model}</td>
                <td className="px-4 py-3 whitespace-nowrap">{p.variant ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{p.part}</td>
                <td className="px-4 py-3 whitespace-nowrap">{p.quality}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {p.currency} {p.price}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {p.currency} {p.labor_charge}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {p.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {p.active && (
                    <form action={deactivateDevicePrice}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="text-sm text-red-600 hover:underline dark:text-red-400">
                        Deactivate
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {(!prices || prices.length === 0) && (
              <tr>
                <td colSpan={8} className="text-muted px-4 py-8 text-center">
                  No pricing configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
