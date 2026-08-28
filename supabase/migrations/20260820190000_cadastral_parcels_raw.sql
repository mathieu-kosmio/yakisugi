create table public.cadastral_parcels_raw (
  id uuid primary key default gen_random_uuid(),
  parcel_uid text not null unique,
  insee_code text not null,
  commune_name text not null,
  section text not null,
  parcel_number text not null,
  parcel_area_ha numeric(14, 4) not null check (parcel_area_ha >= 0),
  geometry extensions.geometry(multipolygon, 4326) not null,
  source_id uuid not null references public.data_sources(id),
  imported_at timestamptz not null default now()
);

create index cadastral_parcels_raw_geometry_idx
  on public.cadastral_parcels_raw using gist (geometry);
create index cadastral_parcels_raw_insee_idx
  on public.cadastral_parcels_raw (insee_code);

alter table public.cadastral_parcels_raw enable row level security;

comment on table public.cadastral_parcels_raw is
  'Normalized cadastral source polygons used only by offline ETL processing.';
