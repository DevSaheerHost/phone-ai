"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "contacted", "converted", "closed"]),
});

/**
 * Updates a service request's status. RLS (is_admin()) is the actual
 * authorization boundary — this action runs as the signed-in user, so a
 * non-admin session gets a no-op update, never a silent bypass.
 */
export async function updateServiceRequestStatus(formData: FormData): Promise<void> {
  const parsed = updateStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("service_requests").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  revalidatePath("/admin/service-requests");
}
