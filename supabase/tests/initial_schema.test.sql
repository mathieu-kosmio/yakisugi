begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

select has_extension('postgis', 'PostGIS is installed');

select is(
  (
    select count(*)::bigint
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'data_sources',
        'analytics_events',
        'export_requests',
        'cadastral_parcels_raw',
        'forest_raw',
        'incidents',
        'affected_forests',
        'affected_parcels',
        'parcel_forest_compositions',
        'industrial_sites',
        'incident_industrial_sites',
        'volume_coefficients',
        'exports',
        'orders'
      )
  ),
  14::bigint,
  'All fourteen MVP tables exist'
);

select is(
  (
    select count(*)::bigint
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname in (
        'data_sources',
        'analytics_events',
        'export_requests',
        'cadastral_parcels_raw',
        'forest_raw',
        'incidents',
        'affected_forests',
        'affected_parcels',
        'parcel_forest_compositions',
        'industrial_sites',
        'incident_industrial_sites',
        'volume_coefficients',
        'exports',
        'orders'
      )
      and pg_class.relrowsecurity
  ),
  14::bigint,
  'RLS is enabled on every MVP table'
);

select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'data_sources',
        'analytics_events',
        'export_requests',
        'cadastral_parcels_raw',
        'forest_raw',
        'incidents',
        'affected_forests',
        'affected_parcels',
        'parcel_forest_compositions',
        'industrial_sites',
        'incident_industrial_sites',
        'volume_coefficients',
        'exports',
        'orders'
      )
  ),
  0::bigint,
  'Raw tables have no direct client policy'
);

select is(
  (
    select count(*)::bigint
    from pg_attribute
    join pg_class on pg_class.oid = pg_attribute.attrelid
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    join pg_type on pg_type.oid = pg_attribute.atttypid
    where pg_namespace.nspname = 'public'
      and pg_type.typname = 'geometry'
      and pg_attribute.attnum > 0
      and not pg_attribute.attisdropped
      and postgis_typmod_srid(pg_attribute.atttypmod) = 4326
  ),
  10::bigint,
  'Every geographic column uses SRID 4326'
);

select has_index(
  'public',
  'cadastral_parcels_raw',
  'cadastral_parcels_raw_geometry_idx',
  'Raw cadastral parcel geometry has a spatial index'
);

select has_index(
  'public',
  'forest_raw',
  'forest_raw_geometry_idx',
  'Raw forest geometry has a spatial index'
);

select has_index(
  'public',
  'incidents',
  'incidents_geometry_idx',
  'Incident geometry has a spatial index'
);

select has_index(
  'public',
  'affected_forests',
  'affected_forests_geometry_idx',
  'Affected forest geometry has a spatial index'
);

select has_index(
  'public',
  'affected_parcels',
  'affected_parcels_geometry_idx',
  'Affected parcel geometry has a spatial index'
);

select has_index(
  'public',
  'industrial_sites',
  'industrial_sites_location_idx',
  'Industry location has a spatial index'
);

select col_is_pk(
  'public',
  'incident_industrial_sites',
  array['incident_id', 'industrial_site_id'],
  'Incident to industry distances are unique by pair'
);

select has_view(
  'public',
  'incident_summaries',
  'Published incident summary view exists'
);

select is(
  (
    select 'security_invoker=true' = any(coalesce(pg_class.reloptions, array[]::text[]))
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'incident_summaries'
  ),
  true,
  'Incident summary view respects caller RLS'
);

select col_is_unique(
  'public',
  'orders',
  'stripe_checkout_session_id',
  'A Checkout session can create only one order'
);

select col_is_unique(
  'public',
  'orders',
  'download_token_hash',
  'A download token hash identifies only one order'
);

select has_index(
  'public',
  'analytics_events',
  'analytics_events_name_created_idx',
  'Analytics aggregate queries have a bounded event and date index'
);

select col_type_is(
  'public',
  'export_requests',
  'status',
  'public.export_request_status',
  'Export requests use the controlled workflow status'
);

select col_is_fk(
  'public',
  'orders',
  'export_request_id',
  'External orders can reference their originating request'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'stripe_checkout_session_id'
  ),
  'YES',
  'A manual order does not require a Stripe session'
);

select has_index(
  'public',
  'export_requests',
  'export_requests_status_created_idx',
  'Administrative request queues are indexed by status and date'
);

select * from finish();
rollback;
