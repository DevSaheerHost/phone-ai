import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { updateShopConfig } from "./actions";

export const dynamic = "force-dynamic";

export default async function ShopConfigPage() {
  const supabase = await createSupabaseServerClient();
  const { data: config } = await supabase.from("shop_config").select("*").eq("id", 1).maybeSingle();

  const services = (config?.services ?? []) as string[];
  const paymentMethods = (config?.accepted_payment_methods ?? []) as string[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Shop Configuration</h1>
        <p className="text-muted text-sm">
          The single source of truth the AI receptionist reads from — identity, hours, and policy. It never uses
          hard-coded facts.
        </p>
      </div>

      <form action={updateShopConfig} className="surface space-y-6 rounded-xl p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Shop name">
            <input name="shopName" defaultValue={config?.shop_name} required className="input" />
          </Field>
          <Field label="Phone number">
            <input name="phoneNumber" defaultValue={config?.phone_number} required className="input" />
          </Field>
          <Field label="Address" full>
            <input name="address" defaultValue={config?.address} required className="input" />
          </Field>
          <Field label="Human transfer number">
            <input name="humanTransferNumber" defaultValue={config?.human_transfer_number} required className="input" />
          </Field>
          <Field label="Greeting" full>
            <input name="greeting" defaultValue={config?.greeting} required className="input" />
          </Field>
          <Field label="Services (comma separated)" full>
            <input name="services" defaultValue={services.join(", ")} className="input" />
          </Field>
          <Field label="Accepted payment methods (comma separated)" full>
            <input name="acceptedPaymentMethods" defaultValue={paymentMethods.join(", ")} className="input" />
          </Field>
          <Field label="Warranty policy" full>
            <textarea name="warrantyPolicy" defaultValue={config?.warranty_policy} rows={2} className="input" />
          </Field>
          <Field label="Repair policy" full>
            <textarea name="repairPolicy" defaultValue={config?.repair_policy} rows={2} className="input" />
          </Field>
          <Field label="Opening hours (JSON array)" full>
            <textarea
              name="hoursJson"
              defaultValue={JSON.stringify(config?.hours ?? [], null, 2)}
              rows={6}
              spellCheck={false}
              className="input font-mono text-xs"
            />
          </Field>
          <Field label="Holidays (JSON array of ISO dates)" full>
            <textarea
              name="holidaysJson"
              defaultValue={JSON.stringify(config?.holidays ?? [], null, 2)}
              rows={3}
              spellCheck={false}
              className="input font-mono text-xs"
            />
          </Field>
        </div>

        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 rounded-md px-4 py-2 text-sm font-medium text-white transition"
        >
          Save changes
        </button>
      </form>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
