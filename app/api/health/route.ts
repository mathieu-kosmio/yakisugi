export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", service: "yakisugi" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
