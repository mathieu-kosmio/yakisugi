# ADR-0001 : socle technique et évaluation du squelette Kotlin/React

Date : 20 août 2026

Statut : accepté pour l'initialisation

## Contexte

La spécification demande un MVP en cinq jours avec Next.js, TypeScript, Tailwind, MapLibre, des Route Handlers, Supabase/PostgreSQL/PostGIS et un ETL Python. Elle exclut l'authentification utilisateur, les microservices et les abstractions complexes.

Le dépôt privé `Kosmio/skeleton-kotlin-react` a été évalué dans son état du 20 août 2026. Il fournit Spring Boot 4, Kotlin, une architecture CQRS/DDD et hexagonale, une authentification complète, un BFF, SeaweedFS, SMTP, un monorepo Turbo, des contrats Kotlin générés en TypeScript et plusieurs couches de tests. Il totalise environ 1 403 fichiers hors historique dans cet état.

## Options étudiées

### A. Reprendre le squelette complet

Avantages : pratiques de sécurité matures, tests riches, CI/CD, composants UI, conventions agent déjà documentées.

Coûts : backend supplémentaire, exploitation Java, suppression de nombreux domaines existants, adaptation Supabase, retrait de l'authentification et divergence directe avec l'architecture imposée.

### B. Extraire son front Next.js

Avantages : Next.js 16, React 19, Tailwind 4, Vitest, Biome, composants réutilisables et pratiques SEO.

Coûts : dépendances au monorepo, aux contrats Kotlin générés, au BFF, aux sessions, aux permissions et à l'internationalisation. L'extraction serait un projet de nettoyage avant le développement produit.

### C. Créer un socle Next.js minimal

Avantages : conformité directe, moins de surface, déploiement Vercel naturel, accès Supabase simple et temps concentré sur la donnée géospatiale.

Coûts : recréer un petit socle de qualité et sélectionner manuellement les pratiques utiles.

## Décision

Retenir l'option C. Le squelette complet n'est pas utilisé comme base de code pour le MVP. Ses pratiques utiles sont reprises de façon sélective : en-têtes de sécurité, validation d'environnement, lint, types, tests unitaires, séparation des composants, documentation agent et contrôle de qualité.

## Conséquences

- Un seul service applicatif Next.js pour les pages et l'API.
- PostGIS porte les requêtes géographiques préparées.
- Python porte les imports et intersections lourdes.
- L'authentification, les organisations, le BFF Kotlin et SeaweedFS ne sont pas intégrés.
- Une réévaluation de Kotlin restera possible après validation commerciale si les besoins futurs exigent des workflows complexes, un SI d'entreprise ou une API métier autonome.
