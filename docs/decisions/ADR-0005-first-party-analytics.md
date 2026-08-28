# ADR-0005 : analytics produit internes et minimaux

## Statut

Accepté le 20 août 2026.

## Contexte

Le MVP doit mesurer l'ouverture de la carte, les interactions utiles et les achats. Une dépendance à un outil tiers ajouterait une configuration, des transferts de données et des choix de consentement avant même la validation commerciale.

## Décision

- L'application accepte uniquement les sept événements définis dans la spécification.
- Le navigateur crée un identifiant aléatoire limité à la session de navigation.
- Le serveur transforme cet identifiant par HMAC-SHA256 avec un secret dédié avant insertion.
- La base conserve le nom de l'événement, le hash de visite, le slug facultatif et l'horodatage serveur.
- L'adresse IP, le user-agent, les coordonnées, les contacts et l'identifiant brut ne sont pas enregistrés par l'application.
- La table reste protégée par RLS sans politique publique.

## Conséquences

Les agrégations par événement et le nombre de visites distinctes deviennent calculables sans profil utilisateur durable. La qualification juridique finale, la politique de confidentialité et la configuration de rétention restent obligatoires avant publication.
