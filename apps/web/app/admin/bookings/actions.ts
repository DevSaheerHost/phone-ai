"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["requested", "confirmed", "cancelled", "completed"]),
});

export async function updateBookingStatus(formData: FormData): Promise<void> {
  const parsed = updateStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("bookings").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  revalidatePath("/admin/bookings");
}
