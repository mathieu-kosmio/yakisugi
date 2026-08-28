import { createPurchaseRepository } from "@/lib/db/purchase-repository";
import { createSignedDownloadUrl } from "@/lib/stripe/order-service";

type DownloadRouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: DownloadRouteContext) {
  const { token } = await context.params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return Response.json({ error: "Lien invalide" }, { status: 404 });
  }
  try {
    const signedUrl = await createSignedDownloadUrl(
      token,
      createPurchaseRepository(),
    );
    if (!signedUrl) {
      return Response.json(
        { error: "Lien invalide ou expiré" },
        { status: 404 },
      );
    }
    return new Response(null, {
      status: 303,
      headers: { Location: signedUrl, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("download_failed", error);
    return Response.json(
      { error: "Téléchargement indisponible" },
      { status: 503 },
    );
  }
}
