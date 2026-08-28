# ADR-0006 : vente manuelle avant activation de Stripe

## Statut

Accepté le 20 août 2026.

## Contexte

Le MVP doit permettre de tester l'intérêt commercial avant de finaliser la facturation automatisée. Un administrateur doit pouvoir constater un paiement externe, produire l'export et transmettre un lien temporaire sans créer de compte client.

## Décision

- `SALES_MODE=contact` devient le mode par défaut.
- Stripe reste disponible avec `SALES_MODE=stripe`.
- Le formulaire conserve uniquement les coordonnées professionnelles nécessaires, l'organisation, l'usage et le consentement daté.
- Les demandes sont écrites côté serveur dans une table protégée par RLS sans politique publique.
- L'administration s'effectue en CLI, sans interface ni authentification supplémentaire.
- La livraison externe génère ou actualise l'archive, l'envoie dans Storage, crée une commande payée et affiche le lien une seule fois.
- Seul le hash du jeton de téléchargement est conservé.

## Conséquences

Le processus commercial fonctionne avec un devis, une facture ou un virement externe. L'administrateur reste responsable de la vérification du paiement. La réactivation de Stripe ne nécessite ni suppression de données ni nouvelle architecture de livraison.
