import { z } from "zod";
import { createPurchaseRepository } from "@/lib/db/purchase-repository";
import { resolveSalesMode } from "@/lib/sales/config";
import { resolveCheckoutConfig } from "@/lib/stripe/config";
import { createCheckoutSession } from "@/lib/stripe/stripe-client";

const checkoutInput = z.object({ slug: z.string().min(1).max(160) }).strict();

async function readSlug(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return checkoutInput.parse(await request.json()).slug;
  }
  const form = await request.formData();
  return checkoutInput.parse({ slug: form.get("slug") }).slug;
}

export async function POST(request: Request) {
  if (resolveSalesMode(process.env) !== "stripe") {
    return Response.json({ error: "Route indisponible" }, { status: 404 });
  }
  try {
    const slug = await readSlug(request);
    const repository = createPurchaseRepository();
    const purchasable = await repository.findPurchasableExport(slug);
    if (!purchasable) {
      return Response.json({ error: "Export indisponible" }, { status: 404 });
    }
    const session = await createCheckoutSession(
      resolveCheckoutConfig(process.env),
      purchasable,
    );
    return new Response(null, {
      status: 303,
      headers: { Location: session.url },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Requête invalide" }, { status: 400 });
    }
    console.error("checkout_failed", error);
    return Response.json(
      { error: "Paiement temporairement indisponible" },
      { status: 503 },
    );
  }
}
