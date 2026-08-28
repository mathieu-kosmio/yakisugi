import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalyticsView } from "@/components/analytics/analytics-event";
import { createPurchaseRepository } from "@/lib/db/purchase-repository";
import { resolveSalesMode } from "@/lib/sales/config";
import { resolveWebhookConfig } from "@/lib/stripe/config";
import { getDownloadPathForSession } from "@/lib/stripe/order-service";

type SuccessPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string }>;
};

export const metadata: Metadata = {
  title: "Export Yakisugi prêt",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PurchaseSuccessPage({
  params,
  searchParams,
}: SuccessPageProps) {
  if (resolveSalesMode(process.env) !== "stripe") notFound();
  const [{ slug }, { session_id: sessionId }] = await Promise.all([
    params,
    searchParams,
  ]);
  let downloadUrl: string | null = null;
  if (sessionId?.startsWith("cs_")) {
    try {
      const { downloadTokenSecret } = resolveWebhookConfig(process.env);
      downloadUrl = await getDownloadPathForSession(
        sessionId,
        slug,
        createPurchaseRepository(),
        downloadTokenSecret,
      );
    } catch (error) {
      console.error("purchase_status_failed", error);
    }
  }

  return (
    <main className="site-shell purchase-page">
      {downloadUrl ? (
        <AnalyticsView event="purchase_completed" incidentSlug={slug} />
      ) : null}
      <p className="eyebrow">Paiement reçu</p>
      <h1>
        {downloadUrl
          ? "Votre export est prêt"
          : "Votre paiement est en cours de validation"}
      </h1>
      <p className="purchase-intro">
        {downloadUrl
          ? "Le lien ci-dessous ouvre un téléchargement temporaire et personnel."
          : "Le webhook de paiement peut prendre quelques instants. Rechargez cette page pour récupérer votre archive."}
      </p>
      {downloadUrl ? (
        <a className="button-primary" href={downloadUrl} rel="nofollow">
          Télécharger l'archive ZIP
        </a>
      ) : null}
      <div className="purchase-backlink">
        <Link href={`/evenements/${slug}`}>Retour à la fiche événement</Link>
      </div>
    </main>
  );
}
