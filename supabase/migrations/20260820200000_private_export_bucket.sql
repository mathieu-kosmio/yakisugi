do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    ) values (
      'incident-exports',
      'incident-exports',
      false,
      104857600,
      array['application/zip']
    )
    on conflict (id) do update set
      public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  else
    raise notice 'storage.buckets absent; bucket creation deferred to Supabase Storage';
  end if;
end
$$;
