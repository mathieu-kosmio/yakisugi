import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DataSourceConfig } from "@/lib/db/data-source-config";

export function createServerSupabaseClient(
  config: Extract<DataSourceConfig, { kind: "supabase" }>,
): SupabaseClient {
  return createClient(config.url, config.secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
