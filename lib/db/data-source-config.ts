import { z } from "zod";

const modeSchema = z.enum(["auto", "fixture", "supabase"]);

export type DataSourceConfig =
  | { kind: "fixture" }
  | { kind: "supabase"; url: string; secretKey: string };

export function resolveDataSourceConfig(
  environment: Record<string, string | undefined>,
): DataSourceConfig {
  const mode = modeSchema.parse(environment.YAKISUGI_DATA_SOURCE ?? "auto");
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = (
    environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY
  )?.trim();
  const hasCompleteCredentials = Boolean(url && secretKey);
  const hasPartialCredentials = Boolean(url || secretKey);

  if (mode === "fixture") {
    return { kind: "fixture" };
  }

  if (mode === "supabase" && !hasCompleteCredentials) {
    throw new Error(
      "Supabase data source requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY",
    );
  }

  if (mode === "auto" && hasPartialCredentials && !hasCompleteCredentials) {
    throw new Error(
      "Supabase configuration is partial; provide both server credentials or neither",
    );
  }

  if (hasCompleteCredentials) {
    return {
      kind: "supabase",
      url: z.url().parse(url),
      secretKey: z.string().min(1).parse(secretKey),
    };
  }

  return { kind: "fixture" };
}
