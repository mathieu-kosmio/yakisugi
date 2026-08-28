# ADR-0007 : Coolify avec Supabase hébergé

## Statut

Accepté le 20 août 2026.

## Contexte

Yakisugi doit pouvoir être déployé sur l'infrastructure choisie par l'éditeur sans dépendre du runtime Vercel. L'application utilise les Route Handlers Next.js, PostgreSQL avec PostGIS et un bucket privé pour les exports.

Coolify sait construire et exécuter une application Docker. Supabase hébergé fournit déjà la base PostGIS, les sauvegardes et le Storage nécessaires au MVP. Auto-héberger toute la pile Supabase augmenterait la charge d'exploitation avant validation du produit.

## Décision

- Construire l'application avec un `Dockerfile` multi-étapes et la sortie Next.js `standalone`.
- Déployer ce conteneur dans Coolify sur le port 3000.
- Exposer `/api/health` comme contrôle de santé sans dépendance à un service externe.
- Utiliser Supabase hébergé pour PostgreSQL, PostGIS et le bucket privé.
- Exécuter les migrations et les ETL depuis un poste ou runner d'administration distinct.
- Garder toutes les clés secrètes au runtime et limiter les variables publiques au bundle cartographique.

## Conséquences

Le même conteneur peut être testé localement et déployé dans Coolify. La base et le Storage restent gérés par Supabase. Le lancement réel requiert un projet Supabase, une application Coolify, un domaine et les secrets de production. Une étude dédiée sera nécessaire avant tout passage à Supabase auto-hébergé.
