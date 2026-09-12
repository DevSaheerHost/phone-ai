import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { updateBookingStatus } from "./actions";

export const dynamic = "force-dynamic";

const STATUSES = ["requested", "confirmed", "cancelled", "completed"] as const;

export default async function BookingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, service, requested_at, status, notes, customers(name, phone_number)")
    .order("requested_at", { ascending: true })
    .limit(100);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Bookings</h1>
        <p className="text-muted text-sm">Upcoming and past appointments booked over the phone.</p>
      </div>

      <div className="surface overflow-x-auto rounded-xl">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-muted border-b text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(bookings ?? []).map((b) => {
              const customer = Array.isArray(b.customers) ? b.customers[0] : b.customers;
              return (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(b.requested_at).toLocaleString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {customer?.name ?? "—"} <span className="text-muted">{customer?.phone_number}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{b.service}</td>
                  <td className="px-4 py-3">{b.notes ?? "—"}</td>
                  <td className="px-4 py-3">
                    <form action={updateBookingStatus} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={b.id} />
                      <select
                        name="status"
                        defaultValue={b.status}
                        className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-brand-600 text-sm font-medium hover:underline">
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {(!bookings || bookings.length === 0) && (
              <tr>
                <td colSpan={5} className="text-muted px-4 py-8 text-center">
                  No bookings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
