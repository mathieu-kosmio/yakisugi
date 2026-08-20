create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.incident_status as enum ('draft', 'published');
create type public.confidence_level as enum ('low', 'medium', 'high');
create type public.industry_category as enum (
  'FORESTRY',
  'SAWMILL',
  'PANELS',
  'PACKAGING',
  'WOOD_TRADING',
  'WOOD_ENERGY',
  'OTHER'
);
create type public.order_status as enum ('pending', 'paid', 'failed', 'refunded');

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_url text not null,
  source_date date,
  imported_at timestamptz not null default now(),
  checksum text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  type text not null default 'wildfire' check (type = 'wildfire'),
  external_id text unique,
  start_date date not null,
  end_date date,
  department_codes text[] not null default '{}',
  source_id uuid references public.data_sources(id),
  source_name text not null,
  source_url text not null,
  source_date date,
  geometry extensions.geometry(multipolygon, 4326) not null,
  geometry_web extensions.geometry(multipolygon, 4326),
  area_ha numeric(14, 2) not null check (area_ha >= 0),
  status public.incident_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.affected_forests (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  forest_source_id text not null,
  forest_type_code text,
  forest_type_label text not null,
  dominant_species text,
  area_ha numeric(14, 4) not null check (area_ha >= 0),
  affected_ratio numeric(7, 6) check (affected_ratio between 0 and 1),
  geometry extensions.geometry(multipolygon, 4326) not null,
  geometry_web extensions.geometry(multipolygon, 4326),
  source_id uuid references public.data_sources(id),
  created_at timestamptz not null default now(),
  unique (incident_id, forest_source_id)
);

create table public.affected_parcels (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  insee_code text not null,
  commune_name text not null,
  section text not null,
  parcel_number text not null,
  parcel_uid text not null,
  parcel_area_ha numeric(14, 4) not null check (parcel_area_ha >= 0),
  affected_area_ha numeric(14, 4) not null check (affected_area_ha >= 0),
  affected_ratio numeric(7, 6) not null check (affected_ratio between 0 and 1),
  forest_area_ha numeric(14, 4) not null check (forest_area_ha >= 0),
  dominant_species text,
  estimated_volume_min_m3 numeric(16, 2),
  estimated_volume_max_m3 numeric(16, 2),
  confidence public.confidence_level not null,
  geometry extensions.geometry(multipolygon, 4326) not null,
  geometry_web extensions.geometry(multipolygon, 4326),
  centroid extensions.geometry(point, 4326) not null,
  source_id uuid references public.data_sources(id),
  methodology_version text not null,
  created_at timestamptz not null default now(),
  unique (incident_id, parcel_uid),
  check (
    estimated_volume_min_m3 is null
    or estimated_volume_max_m3 is null
    or estimated_volume_max_m3 >= estimated_volume_min_m3
  )
);

create table public.parcel_forest_compositions (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.affected_parcels(id) on delete cascade,
  forest_type text not null,
  species text,
  area_ha numeric(14, 4) not null check (area_ha >= 0),
  percentage numeric(7, 4) not null check (percentage between 0 and 100)
);

create table public.industrial_sites (
  id uuid primary key default gen_random_uuid(),
  siret text not null unique,
  siren text not null,
  company_name text not null,
  trade_name text,
  naf_code text not null,
  category public.industry_category not null,
  address text not null,
  postal_code text not null,
  commune text not null,
  longitude double precision not null,
  latitude double precision not null,
  location extensions.geometry(point, 4326) not null,
  active boolean not null default true,
  source_id uuid references public.data_sources(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.incident_industrial_sites (
  incident_id uuid not null references public.incidents(id) on delete cascade,
  industrial_site_id uuid not null references public.industrial_sites(id) on delete cascade,
  distance_km numeric(10, 3) not null check (distance_km >= 0),
  distance_band text not null check (
    distance_band in ('0_25', '25_50', '50_100', '100_150', '150_PLUS')
  ),
  calculated_at timestamptz not null default now(),
  methodology_version text not null,
  primary key (incident_id, industrial_site_id)
);

create table public.volume_coefficients (
  id uuid primary key default gen_random_uuid(),
  species_code text not null,
  species_label text not null,
  min_m3_per_ha numeric(12, 4) not null check (min_m3_per_ha >= 0),
  max_m3_per_ha numeric(12, 4) not null check (max_m3_per_ha >= min_m3_per_ha),
  region text,
  source text not null,
  source_url text,
  notes text,
  validated_at timestamptz not null,
  active boolean not null default true
);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id),
  storage_path text not null unique,
  sha256 text not null,
  methodology_version text not null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id),
  export_id uuid references public.exports(id),
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text unique,
  customer_email text,
  amount_total integer not null check (amount_total >= 0),
  currency text not null default 'eur',
  status public.order_status not null default 'pending',
  download_token_hash text unique,
  download_expires_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index incidents_geometry_idx on public.incidents using gist (geometry);
create index incidents_geometry_web_idx on public.incidents using gist (geometry_web);
create index affected_forests_geometry_idx on public.affected_forests using gist (geometry);
create index affected_forests_incident_idx on public.affected_forests (incident_id);
create index affected_parcels_geometry_idx on public.affected_parcels using gist (geometry);
create index affected_parcels_geometry_web_idx on public.affected_parcels using gist (geometry_web);
create index affected_parcels_centroid_idx on public.affected_parcels using gist (centroid);
create index affected_parcels_incident_idx on public.affected_parcels (incident_id);
create index affected_parcels_filter_idx on public.affected_parcels (
  incident_id,
  dominant_species,
  affected_area_ha,
  confidence
);
create index industrial_sites_location_idx on public.industrial_sites using gist (location);
create index industrial_sites_category_idx on public.industrial_sites (category) where active;
create index incident_industrial_distance_idx on public.incident_industrial_sites (
  incident_id,
  distance_km
);

alter table public.data_sources enable row level security;
alter table public.incidents enable row level security;
alter table public.affected_forests enable row level security;
alter table public.affected_parcels enable row level security;
alter table public.parcel_forest_compositions enable row level security;
alter table public.industrial_sites enable row level security;
alter table public.incident_industrial_sites enable row level security;
alter table public.volume_coefficients enable row level security;
alter table public.exports enable row level security;
alter table public.orders enable row level security;

comment on table public.affected_parcels is
  'Calculated parcel intersections. Raw access is server-only; public access goes through bounded API routes.';
comment on column public.affected_parcels.estimated_volume_min_m3 is
  'Nullable estimate. Must remain null without a documented active coefficient.';
comment on column public.affected_parcels.geometry_web is
  'Simplified display geometry; full geometry is reserved for controlled exports.';
