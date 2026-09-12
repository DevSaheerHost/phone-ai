import { createSupabaseServerClient } from "../../lib/supabase/server";
import { StatCard } from "../../components/StatCard";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const supabase = await createSupabaseServerClient();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    { count: callsToday },
    { count: openServiceRequests },
    { count: upcomingBookings },
    { count: transferredToday },
  ] = await Promise.all([
    supabase.from("calls").select("id", { count: "exact", head: true }).gte("started_at", startOfToday.toISOString()),
    supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "requested")
      .gte("requested_at", new Date().toISOString()),
    supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("transferred_to_human", true)
      .gte("started_at", startOfToday.toISOString()),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-muted text-sm">Live snapshot of the AI receptionist.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Calls today" value={callsToday ?? 0} />
        <StatCard label="Open service requests" value={openServiceRequests ?? 0} />
        <StatCard label="Upcoming bookings" value={upcomingBookings ?? 0} />
        <StatCard label="Transferred to human today" value={transferredToday ?? 0} />
      </div>
    </div>
  );
}
