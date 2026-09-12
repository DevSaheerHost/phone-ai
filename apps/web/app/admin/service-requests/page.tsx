import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { updateServiceRequestStatus } from "./actions";

export const dynamic = "force-dynamic";

const STATUSES = ["new", "contacted", "converted", "closed"] as const;

export default async function ServiceRequestsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: requests } = await supabase
    .from("service_requests")
    .select("id, device_model, issue, status, created_at, customers(name, phone_number)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Service Requests</h1>
        <p className="text-muted text-sm">Requests customers logged over the phone without a specific booking time.</p>
      </div>

      <div className="surface overflow-x-auto rounded-xl">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-muted border-b text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Device</th>
              <th className="px-4 py-3">Issue</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(requests ?? []).map((r) => {
              const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {customer?.name ?? "—"} <span className="text-muted">{customer?.phone_number}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.device_model}</td>
                  <td className="px-4 py-3">{r.issue}</td>
                  <td className="px-4 py-3">
                    <form action={updateServiceRequestStatus} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <select
                        name="status"
                        defaultValue={r.status}
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
            {(!requests || requests.length === 0) && (
              <tr>
                <td colSpan={5} className="text-muted px-4 py-8 text-center">
                  No service requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
