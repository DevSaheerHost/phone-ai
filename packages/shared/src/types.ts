export type RepairTicketStatus =
  "received" | "diagnosing" | "awaiting_parts" | "in_progress" | "ready_for_pickup" | "completed" | "cancelled";

export type BookingStatus = "requested" | "confirmed" | "cancelled" | "completed";

export type ServiceRequestStatus = "new" | "contacted" | "converted" | "closed";

export type CallOutcome =
  "completed_by_ai" | "transferred_to_human" | "transfer_failed_callback_taken" | "abandoned" | "error";

export type CustomerRequestType =
  "pricing_inquiry" | "repair_status" | "booking" | "service_request" | "shop_information" | "human_transfer" | "other";

export interface ShopHours {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
  opens: string | null; // "HH:MM" 24h, null = closed
  closes: string | null;
}

export interface ShopConfig {
  shop_name: string;
  address: string;
  phone_number: string;
  greeting: string;
  hours: ShopHours[];
  holidays: string[]; // ISO dates
  services: string[];
  accepted_payment_methods: string[];
  warranty_policy: string;
  repair_policy: string;
  human_transfer_number: string;
  updated_at: string;
}

export interface DevicePricing {
  id: string;
  model: string;
  variant: string | null;
  part: string;
  quality: string;
  price: number;
  labor_charge: number;
  currency: string;
  valid_from: string;
  valid_until: string | null;
  active: boolean;
}

export interface PartAvailability {
  id: string;
  model: string;
  part: string;
  quality: string;
  in_stock: boolean;
  quantity: number;
  updated_at: string;
}

export interface Customer {
  id: string;
  phone_number: string;
  name: string | null;
  created_at: string;
}

export interface RepairTicket {
  id: string;
  ticket_number: string;
  customer_id: string;
  device_model: string;
  issue: string;
  status: RepairTicketStatus;
  estimated_price: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  customer_id: string;
  service: string;
  requested_at: string;
  status: BookingStatus;
  notes: string | null;
  created_at: string;
}

export interface ServiceRequest {
  id: string;
  customer_id: string;
  device_model: string;
  issue: string;
  status: ServiceRequestStatus;
  created_at: string;
}

export interface CallRecord {
  id: string;
  call_id: string;
  provider_call_id: string | null;
  caller_phone: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  outcome: CallOutcome | null;
  transferred_to_human: boolean;
  transfer_reason: string | null;
  customer_request_type: CustomerRequestType | null;
  created_service_request_id: string | null;
  created_booking_id: string | null;
  error_code: string | null;
  language_detected: string | null;
}

/** Structured result every business tool returns to the AI layer. */
export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  /** Human-safe reason to relay to the caller when ok is false — never a stack trace. */
  reason?: string;
  /** Machine-readable error code for logging, never spoken to the caller. */
  errorCode?: string;
}
