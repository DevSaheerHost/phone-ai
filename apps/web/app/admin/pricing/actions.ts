"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const createPriceSchema = z.object({
  model: z.string().trim().min(1).max(200),
  variant: z.string().trim().max(200).optional(),
  part: z.string().trim().min(1).max(100),
  quality: z.string().trim().min(1).max(100),
  price: z.coerce.number().min(0),
  laborCharge: z.coerce.number().min(0),
});

export async function createDevicePrice(formData: FormData): Promise<void> {
  const parsed = createPriceSchema.safeParse({
    model: formData.get("model"),
    variant: formData.get("variant") || undefined,
    part: formData.get("part"),
    quality: formData.get("quality"),
    price: formData.get("price"),
    laborCharge: formData.get("laborCharge"),
  });
  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("device_pricing").insert({
    model: parsed.data.model,
    variant: parsed.data.variant ?? null,
    part: parsed.data.part,
    quality: parsed.data.quality,
    price: parsed.data.price,
    labor_charge: parsed.data.laborCharge,
  });
  revalidatePath("/admin/pricing");
}

export async function deactivateDevicePrice(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const supabase = await createSupabaseServerClient();
  await supabase.from("device_pricing").update({ active: false }).eq("id", id);
  revalidatePath("/admin/pricing");
}
