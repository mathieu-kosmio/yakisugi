# ADR-0004 : jetons de téléchargement après paiement

## Statut

Accepté le 20 août 2026.

## Contexte

Le MVP vend un export par événement sans créer de compte utilisateur. Le webhook Stripe peut être livré plusieurs fois et le lien doit pouvoir être retrouvé depuis la page de retour Checkout sans stocker de jeton en clair.

## Décision

- Stripe Checkout reste hébergé par Stripe en mode paiement unique.
- Le serveur place les identifiants de l'incident et de l'export dans les métadonnées de la session.
- Seuls `checkout.session.completed` payé et `checkout.session.async_payment_succeeded` déclenchent la livraison.
- La commande est écrite par upsert sur l'identifiant unique de session Checkout.
- Le jeton est dérivé par HMAC-SHA256 à partir de l'identifiant de session et d'un secret serveur distinct.
- Seul le hash SHA-256 du jeton est conservé en base.
- Le lien applicatif expire après sept jours. Chaque accès valide produit une URL Supabase Storage signée pendant 60 secondes.

## Conséquences

Le traitement supporte les nouvelles livraisons de webhook sans dupliquer une commande. Le secret `DOWNLOAD_TOKEN_SECRET`, la clé Stripe et la clé de service Supabase restent exclusivement côté serveur. La révocation anticipée reste possible en modifiant le statut ou l'expiration de la commande.
