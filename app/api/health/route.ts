import { resolveDataSourceConfig } from "@/lib/db/data-source-config";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    resolveDataSourceConfig(process.env);
  } catch {
    return Response.json(
      {
        status: "error",
        service: "yakisugi",
        check: "data-source-config",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { status: "ok", service: "yakisugi" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
