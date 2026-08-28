create view public.incident_summaries
with (security_invoker = true)
as
select
  incident.id,
  incident.slug,
  incident.name,
  incident.start_date,
  incident.area_ha,
  coalesce(forest_summary.forest_area_ha, 0::numeric) as forest_area_ha,
  coalesce(parcel_summary.parcel_count, 0::bigint) as parcel_count,
  species_summary.main_species,
  coalesce(industry_summary.industry_count_within_100_km, 0::bigint)
    as industry_count_within_100_km,
  parcel_summary.estimated_volume_min_m3,
  parcel_summary.estimated_volume_max_m3
from public.incidents as incident
left join lateral (
  select sum(forest.area_ha) as forest_area_ha
  from public.affected_forests as forest
  where forest.incident_id = incident.id
) as forest_summary on true
left join lateral (
  select
    count(*) as parcel_count,
    case
      when count(*) = 0
        or count(*) filter (where parcel.estimated_volume_min_m3 is null) > 0
        then null
      else sum(parcel.estimated_volume_min_m3)
    end as estimated_volume_min_m3,
    case
      when count(*) = 0
        or count(*) filter (where parcel.estimated_volume_max_m3 is null) > 0
        then null
      else sum(parcel.estimated_volume_max_m3)
    end as estimated_volume_max_m3
  from public.affected_parcels as parcel
  where parcel.incident_id = incident.id
) as parcel_summary on true
left join lateral (
  select forest.dominant_species as main_species
  from public.affected_forests as forest
  where forest.incident_id = incident.id
    and forest.dominant_species is not null
  group by forest.dominant_species
  order by sum(forest.area_ha) desc, forest.dominant_species
  limit 1
) as species_summary on true
left join lateral (
  select count(*) as industry_count_within_100_km
  from public.incident_industrial_sites as proximity
  where proximity.incident_id = incident.id
    and proximity.distance_km <= 100
) as industry_summary on true
where incident.status = 'published';

comment on view public.incident_summaries is
  'Server-side DTO for published incident list and landing indicators.';
