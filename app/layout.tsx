import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Yakisugi | Radar du bois sinistré",
    template: "%s | Yakisugi",
  },
  description:
    "Cartographier les ressources forestières potentiellement affectées et les capacités industrielles proches.",
  openGraph: {
    locale: "fr_FR",
    siteName: "Yakisugi",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <header className="site-header">
          <nav
            className="site-shell site-nav"
            aria-label="Navigation principale"
          >
            <Link className="brand" href="/">
              <span className="brand-mark" aria-hidden="true">
                焼
              </span>
              Yakisugi
            </Link>
            <div className="nav-links">
              <Link href="/methodologie">Méthodologie</Link>
              <Link className="button-primary" href="/carte">
                Explorer la carte
              </Link>
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="site-shell">
            Yakisugi fournit des estimations indicatives à vérifier avant toute
            décision opérationnelle.
          </div>
        </footer>
      </body>
    </html>
  );
}
