-- =============================================================================
-- Example seed data for local development. Replace with your real shop data
-- before going to production — see docs/DEPLOYMENT.md.
-- Run with: supabase db reset  (applies migrations then this seed file)
-- =============================================================================

insert into shop_config (
  id, shop_name, address, phone_number, greeting, hours, holidays, services,
  accepted_payment_methods, warranty_policy, repair_policy, human_transfer_number
) values (
  1,
  'Sample Mobile Care',
  '12 MG Road, Kochi, Kerala',
  '+914840000000',
  'Hello, thank you for calling Sample Mobile Care. How can I help you today?',
  '[
    {"day":0,"opens":null,"closes":null},
    {"day":1,"opens":"10:00","closes":"20:00"},
    {"day":2,"opens":"10:00","closes":"20:00"},
    {"day":3,"opens":"10:00","closes":"20:00"},
    {"day":4,"opens":"10:00","closes":"20:00"},
    {"day":5,"opens":"10:00","closes":"20:00"},
    {"day":6,"opens":"10:00","closes":"18:00"}
  ]'::jsonb,
  '[]'::jsonb,
  '["Screen repair", "Battery replacement", "Water damage repair", "New phone sales", "Software troubleshooting"]'::jsonb,
  '["Cash", "UPI", "Card"]'::jsonb,
  'All repairs carry a 90-day warranty on parts and labor.',
  'Free diagnosis. Estimates given before any repair work begins.',
  '+914840000001'
)
on conflict (id) do nothing;

insert into device_pricing (model, variant, part, quality, price, labor_charge, currency) values
  ('Samsung A15', null, 'display', 'original', 3500, 500, 'INR'),
  ('Samsung A15', null, 'display', 'compatible', 1500, 500, 'INR'),
  ('Samsung A15', null, 'battery', 'original', 1200, 300, 'INR'),
  ('iPhone 13', null, 'display', 'original', 9500, 800, 'INR'),
  ('iPhone 13', null, 'battery', 'original', 3200, 400, 'INR')
on conflict do nothing;

insert into part_availability (model, part, quality, in_stock, quantity) values
  ('Samsung A15', 'display', 'original', true, 4),
  ('Samsung A15', 'display', 'compatible', true, 10),
  ('Samsung A15', 'battery', 'original', false, 0),
  ('iPhone 13', 'display', 'original', true, 2)
on conflict (model, part, quality) do nothing;

insert into customers (id, phone_number, name) values
  ('00000000-0000-0000-0000-000000000001', '+919876543210', 'Demo Customer')
on conflict (phone_number) do nothing;

insert into repair_tickets (ticket_number, customer_id, device_model, issue, status, estimated_price) values
  ('RP1024', '00000000-0000-0000-0000-000000000001', 'Samsung A15', 'Cracked display', 'in_progress', 4000)
on conflict (ticket_number) do nothing;
