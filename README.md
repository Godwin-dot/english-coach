# English Coach

> **English** · A small, self-hosted English-learning companion for daily practice. Read the setup instructions below; the application interface is currently in French.

English Coach aide à passer de la compréhension passive à une production plus active en anglais, avec des sessions de 10 à 15 minutes. Le MVP réunit des micro-leçons, du vocabulaire et des révisions espacées, dans une application personnelle que vous hébergez vous-même.

## Ce que propose le MVP

- Micro-leçons générées selon votre niveau CECRL et vos centres d’intérêt.
- Lecture audio et prononciation via la Web Speech API du navigateur.
- Vocabulaire interactif avec traduction, exemples et ajout aux révisions.
- Répétition espacée FSRS avec `ts-fsrs`.
- Tableau de bord quotidien sans séries punitives ni classement.
- Configuration des fournisseurs Gemini et OpenRouter depuis l’interface.

Les statistiques et les cartes restent dans une base SQLite locale. Lorsque vous demandez une génération ou une recherche de vocabulaire, le texte nécessaire est envoyé au fournisseur IA configuré. Consultez ses conditions de confidentialité et de conservation des données avant de l’utiliser. L’hébergement peut être gratuit sur une offre VPS éligible; le coût des appels IA dépend du fournisseur et de votre usage.

## Stack et architecture

- Next.js App Router, React, TypeScript et Tailwind CSS.
- SQLite avec `better-sqlite3`, Drizzle ORM et migrations versionnées.
- Interface `LLMProvider` séparant l’application des fournisseurs actuels Gemini et OpenRouter. Elle peut accueillir d’autres adaptateurs, par exemple Ollama ou Mistral.
- Intégration FSRS encapsulée dans `src/srs/`.

La base applicative est créée dans `data/english.db` en mode WAL. Les fichiers de la base et ses journaux ne doivent pas être copiés à chaud avec un simple `cp`; utilisez la sauvegarde SQLite en ligne décrite dans [DEPLOYMENT.md](DEPLOYMENT.md).

## Démarrage rapide

Prérequis : Node.js 22 LTS et pnpm.

```bash
git clone https://github.com/<votre-compte>/english-coach.git && cd english-coach
pnpm install
pnpm db:seed
pnpm dev
```

Ouvrez <http://localhost:3000>, puis configurez une clé Gemini ou OpenRouter depuis **Configuration IA**. L’accès sans mot de passe est prévu pour le développement local. Avant toute exposition sur Internet, définissez `APP_PASSWORD` et un `AUTH_SECRET` aléatoire d’au moins 32 octets dans `.env.local`.

Pour un déploiement public derrière Caddy, consultez le [guide VPS](DEPLOYMENT.md).

## Mettre à jour l'application

Après avoir récupéré les changements et installé les dépendances, les migrations Drizzle en attente s'appliquent automatiquement au démarrage de `pnpm dev`. Les données existantes de `data/english.db` sont conservées. Si nécessaire, vous pouvez appliquer les migrations manuellement avec `pnpm exec drizzle-kit migrate`.

```bash
git pull origin main
pnpm install
pnpm dev
```

## Sécurité et données

- Les clés IA sont enregistrées côté serveur dans `settings` et ne sont jamais renvoyées en clair à l’interface.
- `APP_PASSWORD` est optionnel en local. Il est obligatoire sur une instance accessible publiquement.
- `.env.local` et les bases SQLite sont exclus par `.gitignore`. Ne publiez jamais de secrets, de sauvegardes ni de données personnelles.
- HTTPS est nécessaire pour que la synthèse vocale fonctionne sur les appareils mobiles hors de `localhost`.

## Périmètre

Ce dépôt couvre le MVP : tableau de bord, réglages, micro-leçons et révisions FSRS. Les modules `/drill`, `/chat` et le suivi dédié des erreurs ne sont pas inclus.

## Licence

Distribué sous licence MIT. Voir [LICENSE](LICENSE).
