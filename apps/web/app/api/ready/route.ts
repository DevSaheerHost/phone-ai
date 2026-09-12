import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("shop_config").select("id").eq("id", 1).maybeSingle();
    if (error) {
      return NextResponse.json({ status: "not_ready", reason: "database_unreachable" }, { status: 503 });
    }
    return NextResponse.json({ status: "ready" });
  } catch {
    return NextResponse.json({ status: "not_ready", reason: "database_unreachable" }, { status: 503 });
  }
}
