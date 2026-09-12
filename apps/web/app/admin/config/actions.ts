"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function parseCommaList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const jsonArraySchema = z.array(z.unknown());

const updateConfigSchema = z.object({
  shopName: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  phoneNumber: z.string().trim().min(1).max(30),
  greeting: z.string().trim().min(1).max(500),
  humanTransferNumber: z.string().trim().min(1).max(30),
  warrantyPolicy: z.string().trim().max(2000),
  repairPolicy: z.string().trim().max(2000),
  hoursJson: z.string(),
  holidaysJson: z.string(),
});

export async function updateShopConfig(formData: FormData): Promise<void> {
  const parsed = updateConfigSchema.safeParse({
    shopName: formData.get("shopName"),
    address: formData.get("address"),
    phoneNumber: formData.get("phoneNumber"),
    greeting: formData.get("greeting"),
    humanTransferNumber: formData.get("humanTransferNumber"),
    warrantyPolicy: formData.get("warrantyPolicy"),
    repairPolicy: formData.get("repairPolicy"),
    hoursJson: formData.get("hoursJson"),
    holidaysJson: formData.get("holidaysJson"),
  });

  if (!parsed.success) return;

  let hours: unknown;
  let holidays: unknown;
  try {
    hours = jsonArraySchema.parse(JSON.parse(parsed.data.hoursJson));
    holidays = jsonArraySchema.parse(JSON.parse(parsed.data.holidaysJson));
  } catch {
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("shop_config")
    .update({
      shop_name: parsed.data.shopName,
      address: parsed.data.address,
      phone_number: parsed.data.phoneNumber,
      greeting: parsed.data.greeting,
      human_transfer_number: parsed.data.humanTransferNumber,
      warranty_policy: parsed.data.warrantyPolicy,
      repair_policy: parsed.data.repairPolicy,
      hours,
      holidays,
      services: parseCommaList(formData.get("services")),
      accepted_payment_methods: parseCommaList(formData.get("acceptedPaymentMethods")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  revalidatePath("/admin/config");
}
