create type public.export_request_status as enum (
  'new',
  'contacted',
  'quoted',
  'payment_pending',
  'paid',
  'delivered',
  'cancelled'
);

create table public.export_requests (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id),
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  organization text not null check (char_length(organization) between 2 and 160),
  contact_email text not null check (char_length(contact_email) between 5 and 254),
  intended_use text not null check (char_length(intended_use) between 2 and 120),
  message text check (message is null or char_length(message) <= 2000),
  status public.export_request_status not null default 'new',
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  contacted_at timestamptz,
  paid_at timestamptz,
  delivered_at timestamptz,
  retention_expires_at timestamptz not null default (now() + interval '1 year')
);

create index export_requests_status_created_idx
  on public.export_requests (status, created_at desc);
create index export_requests_incident_idx
  on public.export_requests (incident_id, created_at desc);

alter table public.export_requests enable row level security;

alter table public.orders
  alter column stripe_checkout_session_id drop not null,
  add column payment_channel text not null default 'stripe'
    check (payment_channel in ('stripe', 'external')),
  add column external_payment_reference text unique,
  add column export_request_id uuid unique references public.export_requests(id);

alter table public.orders
  add constraint orders_payment_reference_check check (
    (payment_channel = 'stripe' and stripe_checkout_session_id is not null)
    or
    (payment_channel = 'external' and external_payment_reference is not null)
  );

comment on table public.export_requests is
  'Professional export requests. Server-only access, one-year default retention and no public RLS policy.';
comment on column public.orders.external_payment_reference is
  'Administrator-verified invoice, transfer or external payment reference.';
