create table public.forest_raw (
  id uuid primary key default gen_random_uuid(),
  department_code text not null,
  forest_source_id text not null,
  forest_type_code text,
  forest_type_label text not null,
  dominant_species text,
  geometry extensions.geometry(multipolygon, 4326) not null,
  source_id uuid not null references public.data_sources(id),
  imported_at timestamptz not null default now(),
  unique (department_code, forest_source_id)
);

create index forest_raw_geometry_idx on public.forest_raw using gist (geometry);
create index forest_raw_department_idx on public.forest_raw (department_code);

alter table public.forest_raw enable row level security;

comment on table public.forest_raw is
  'Normalized source forest polygons used only by offline ETL processing.';
comment on column public.forest_raw.forest_source_id is
  'Stable source identifier namespaced by department during import.';
