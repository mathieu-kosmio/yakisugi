create table public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null check (
    event_name in (
      'map_opened',
      'incident_selected',
      'parcel_clicked',
      'industry_filter_used',
      'export_cta_clicked',
      'checkout_started',
      'purchase_completed'
    )
  ),
  visitor_hash text not null check (length(visitor_hash) = 64),
  incident_slug text,
  created_at timestamptz not null default now()
);

create index analytics_events_name_created_idx
  on public.analytics_events (event_name, created_at desc);

alter table public.analytics_events enable row level security;

comment on table public.analytics_events is
  'First-party aggregate product events. No IP address, user agent, contact detail or raw visitor identifier is stored.';
