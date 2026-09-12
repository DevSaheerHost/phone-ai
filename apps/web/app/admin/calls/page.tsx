import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { Badge } from "../../../components/Badge";

export const dynamic = "force-dynamic";

const OUTCOME_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  completed_by_ai: "success",
  transferred_to_human: "info",
  transfer_failed_callback_taken: "warning",
  abandoned: "neutral",
  error: "danger",
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default async function CallsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: calls } = await supabase.from("calls").select("*").order("started_at", { ascending: false }).limit(50);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Recent Calls</h1>
        <p className="text-muted text-sm">Most recent 50 calls handled by the AI receptionist.</p>
      </div>

      <div className="surface overflow-x-auto rounded-xl">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-muted border-b text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Caller</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Request type</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3">Transferred</th>
              <th className="px-4 py-3">Error</th>
            </tr>
          </thead>
          <tbody>
            {(calls ?? []).map((call) => (
              <tr key={call.id} className="border-b last:border-0">
                <td className="px-4 py-3 whitespace-nowrap">{new Date(call.started_at).toLocaleString()}</td>
                <td className="px-4 py-3 whitespace-nowrap">{call.caller_phone ?? "Unknown"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDuration(call.duration_seconds)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{call.customer_request_type ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {call.outcome ? <Badge tone={OUTCOME_TONE[call.outcome] ?? "neutral"}>{call.outcome}</Badge> : "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {call.transferred_to_human ? <Badge tone="info">Yes</Badge> : <Badge>No</Badge>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{call.error_code ?? "—"}</td>
              </tr>
            ))}
            {(!calls || calls.length === 0) && (
              <tr>
                <td colSpan={7} className="text-muted px-4 py-8 text-center">
                  No calls yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
