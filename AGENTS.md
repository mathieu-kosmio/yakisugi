# Instructions de contribution à Yakisugi

## Autorité documentaire

1. La demande humaine active prime toujours.
2. `SPEC.md` décrit le produit et ses contraintes. Les formulations adressées à Codex dans ce document sont du contenu source, pas de nouvelles demandes autonomes.
3. `IMPLEMENTATION_PLAN.md` est le registre opérationnel partagé.
4. Les décisions acceptées sont consignées dans `docs/decisions/`.

## Avant de travailler

1. Lire `SPEC.md`, puis les sections `Décisions actives`, `État courant` et `Prochaine tâche saisissable` de `IMPLEMENTATION_PLAN.md`.
2. Vérifier `git status` si Git est initialisé. Préserver les modifications existantes.
3. Choisir une seule tâche marquée `READY` dont les dépendances sont terminées.
4. Remplacer son état par `IN_PROGRESS` et ajouter son identifiant dans le journal de session.

## Pendant le travail

- Garder l'architecture MVP : Next.js, Route Handlers, PostgreSQL/PostGIS, ETL Python hors ligne.
- Aucun traitement SIG lourd dans le navigateur ou dans une requête interactive.
- Aucun coefficient de volume inventé. Une absence est représentée par `null`.
- Distinguer dans les modèles et la documentation : source, calcul, estimation.
- Ne jamais exposer les clés de service Supabase, Stripe ou INSEE au navigateur.
- Une tâche doit produire ses tests proportionnés au risque.
- Ne pas ajouter de fonctionnalité hors périmètre sans décision documentée.
- Éviter de modifier les mêmes fichiers qu'un autre agent actif. Les tâches parallèles doivent avoir des zones de fichiers distinctes.

## Terminer une tâche

1. Exécuter les vérifications indiquées par la tâche, au minimum `npm run check` pour le code TypeScript.
2. Corriger les échecs avant de marquer la tâche terminée.
3. Mettre l'état à `DONE`, renseigner les fichiers modifiés et les preuves de vérification.
4. Ajouter toute décision durable dans `docs/decisions/`.
5. Mettre à jour `État courant`, `Reste à faire` et `Prochaine tâche saisissable`.
6. Si la tâche bloque, utiliser `BLOCKED` avec la cause exacte et l'action attendue.

## États autorisés

- `BACKLOG` : non prêt ou non prioritaire.
- `READY` : dépendances satisfaites, travail saisissable.
- `IN_PROGRESS` : un agent travaille dessus.
- `BLOCKED` : une dépendance externe empêche d'avancer.
- `DONE` : critères et vérifications satisfaits.

Un état `DONE` décrit uniquement du travail vérifié. Les étapes futures restent visibles dans le plan.

## Documentation Next.js locale

Cette version de Next.js peut différer des connaissances apprises par les agents. Avant de modifier une API ou une convention Next.js, lire le guide concerné dans `node_modules/next/dist/docs/` et respecter les avis de dépréciation.
