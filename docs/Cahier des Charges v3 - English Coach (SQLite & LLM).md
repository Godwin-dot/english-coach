# Cahier des Charges v3 : English Coach, application personnelle d'apprentissage de l'anglais (SQLite + LLM)

**Version :** 3.0 (consolidée — prête pour l'exécution)  
**Date :** 15 novembre 2026  
**Statut :** Validé pour le développement du MVP  
**Utilisateur :** une seule personne (usage personnel, accès mobile et desktop)

---

## 1. Vision et principes

### 1.1 Objectif
Construire un outil quotidien de **10 à 15 minutes** permettant de passer de la **compréhension passive** à la **production active** en anglais, en générant des exercices sur mesure autour de centres d'intérêt réels (développement logiciel, littérature, situations professionnelles).

### 1.2 Les 4 principes directeurs
1. **Simple d'abord :** Le MVP tient en **3 écrans** (`/`, `/lesson`, `/review`). Toute fonctionnalité supplémentaire n'est ajoutée qu'après deux semaines d'utilisation réelle.
2. **Modifiable partout :** Chaque brique (fournisseur LLM, algorithme de révision, prompts, réglages) est isolée derrière une interface claire et se remplace sans réécrire le reste de l'application.
3. **Souveraineté des données :** Un fichier SQLite unique, portable et exportable en un clic.
4. **Coût d'exploitation nul :** Utilisation des quotas gratuits d'API LLM, d'un hébergement gratuit (petit VPS Free Tier) et des API vocales natives du navigateur.

### 1.3 Périmètre exclu (volontairement)
- Pas de gestion multi-utilisateurs, pas d'inscription ni de comptes publics.
- Pas de mode hors-ligne complexe (l'application s'utilise avec une connexion Internet active).
- Pas d'interface multilingue au lancement : la colonne `language` est prévue en base à `'en'` pour faciliter une extension future sans refonte, mais reste inactive côté UI.
- Pas de gamification punitive (pas de points, de classements ou de *streak* cassé en cas d'oubli).

---

## 2. Périmètre fonctionnel par phases

### 2.1 Phase 1 — MVP (Jours 1 à 6)

| Écran | Rôle fonctionnel |
| :--- | :--- |
| **`/lesson`** | Saisir un thème et un niveau CEFR, générer une micro-leçon (texte EN de 120–180 mots + traduction FR + 5 mots-clés enrichis + 3 QCM), et cliquer sur un mot pour l'ajouter aux révisions. |
| **`/review`** | Réviser les cartes dues avec synthèse vocale (Web Speech API) et noter sa mémorisation selon 4 niveaux (*À revoir*, *Difficile*, *Bien*, *Facile*). |
| **`/` (Accueil)** | Afficher le résumé de la quête du jour, le nombre de cartes dues, le suivi hebdomadaire (ex. 5 jours / 7) et l'accès aux réglages. |

### 2.2 Phase 2 — Consolidation (Après 2 semaines d'usage réel)
- **`/drill` (Traduction active FR $\rightarrow$ EN) :** L'IA génère une phrase en français réutilisant les mots récemment appris ; l'utilisateur traduit en anglais et reçoit une note sur 10 avec correction expliquée.
- **Table `mistakes` :** Enregistrement automatique des erreurs commises pour cibler les prochains exercices sur les faiblesses réelles.
- **Personnalisation avancée de la quête quotidienne.**

### 2.3 Phase 3 — Extension (Selon les besoins constatés)
- **`/chat` :** Tuteur de conversation par scénario avec correction grammaticale en parallèle et dictée vocale (`SpeechRecognition`).
- **Heatmap d'activité** sur les 90 derniers jours.
- **Manifeste PWA** pour installer le raccourci comme une application native sur l'écran d'accueil du smartphone.
- **Bouton d'export/sauvegarde** en un clic du fichier `english.db`.

---

## 3. Stack technique

| Couche | Choix | Justification |
| :--- | :--- | :--- |
| **Framework** | **Next.js (App Router) + TypeScript + Tailwind CSS** | Interface React et routes API serveur réunies dans un seul dépôt. |
| **Base de données** | **SQLite** via `better-sqlite3` | Fichier local `data/english.db`, latence minimale, sauvegarde par simple copie. |
| **ORM & Migrations** | **Drizzle ORM + `drizzle-kit`** | Typage strict en TypeScript et gestion propre des évolutions du schéma. |
| **Validation** | **Zod** | Validation systématique des réponses JSON du LLM avant écriture en base. |
| **Répétition espacée** | **FSRS** via `ts-fsrs` | Algorithme moderne plus précis que SM-2 pour planifier les révisions. |
| **LLM** | **Google AI Studio (Gemini Free Tier)**, fallback OpenRouter (`:free`) | Sortie JSON structurée native, rapide, nom du modèle piloté par variable d'environnement. |
| **Audio** | **Web Speech API** (`speechSynthesis`, `SpeechRecognition`) | Gratuit, natif sur navigateur mobile et desktop, zéro token consommé. |

> **Règle d'or LLM :** Le nom exact du modèle (ex. `gemini-3.5-flash-lite` ou `gemini-3.8-flash`) ne doit **jamais** être écrit en dur dans le code. Il est lu depuis `.env.local` (`LLM_MODEL`) afin de pouvoir basculer instantanément si Google modifie ses quotas gratuits.

---

## 4. Architecture du projet

```text
english-coach/
├─ data/
│  └─ english.db                 # Base SQLite persistante (ignorée par Git)
├─ drizzle/                      # Fichiers de migrations SQL générés
├─ src/
│  ├─ db/
│  │  ├─ schema.ts               # Définition des tables Drizzle (source de vérité)
│  │  └─ index.ts                # Connexion SQLite + PRAGMAs (WAL, foreign_keys)
│  ├─ llm/
│  │  ├─ provider.ts             # Interface abstraite LLMProvider
│  │  ├─ gemini.ts               # Implémentation Google AI Studio
│  │  ├─ openrouter.ts           # Implémentation de secours
│  │  └─ prompts/                # Prompts isolés (lesson.ts, card.ts, drill.ts...)
│  ├─ srs/
│  │  └─ index.ts                # Encapsulation unique de ts-fsrs
│  ├─ domain/                    # Logique métier pure (leçons, cartes, stats)
│  ├─ schemas/                   # Schémas de validation Zod
│  └─ app/
│     ├─ api/                    # Endpoints REST fins (validation + appel domain/)
│     ├─ lesson/                 # Écran de génération et lecture de leçon
│     ├─ review/                 # Écran de révision des cartes
│     └─ page.tsx                # Tableau de bord quotidien
├─ middleware.ts                 # Protection par mot de passe unique
└─ .env.local                    # Clés API, modèle LLM et mot de passe
```

### Règles de modularité
- **Changer de LLM :** Créer un adaptateur implémentant `LLMProvider` et modifier `LLM_PROVIDER` dans `.env.local`.
- **Changer d'algorithme SRS :** Modifier uniquement `src/srs/index.ts`.
- **Ajuster la pédagogie :** Éditer les fichiers dans `src/llm/prompts/` sans toucher aux routes API ni à l'UI.
- **Modifier les seuils quotidiens :** Mettre à jour la table `settings` (nombre de nouvelles cartes/jour, plafond de révisions, niveau cible).

---

## 5. Schéma de données & Configuration SQLite

### 5.1 Configuration critique de la connexion (`src/db/index.ts`)
À l'ouverture de la base `data/english.db`, deux directives SQLite doivent obligatoirement être exécutées :
1. `PRAGMA journal_mode = WAL;` — Active le *Write-Ahead Logging* pour autoriser les lectures et écritures simultanées sans erreur `SQLITE_BUSY` sous Next.js.
2. `PRAGMA foreign_keys = ON;` — Active l'intégrité référentielle (désactivée par défaut dans SQLite).

### 5.2 Format des dates
Toutes les colonnes temporelles (`due`, `created_at`, `completed_at`) sont stockées en **chaîne ISO 8601 UTC complète** (ex. `2026-11-16T08:30:00.000Z`). Ce format garantit un tri lexicographique exact dans SQLite et permet à FSRS de planifier des révisions à quelques minutes ou heures d'intervalle le premier jour.

### 5.3 Tables SQLite

```sql
-- 1. Paramètres de l'application (modifiables sans redéployer)
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL          -- Valeur encodée en JSON
);
-- Clés initiales :
-- daily_new_cards : 10
-- daily_review_cap : 15
-- weekly_goal_days : 5
-- target_level : "B1"
-- interests : ["développement logiciel", "littérature"]

-- 2. Micro-leçons générées
CREATE TABLE lessons (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    language      TEXT NOT NULL DEFAULT 'en',
    topic         TEXT NOT NULL,
    cefr_level    TEXT NOT NULL,
    content_en    TEXT NOT NULL,
    content_fr    TEXT NOT NULL,
    keywords_json TEXT NOT NULL,     -- [{term, translation, phonetic, example, example_fr}]
    quiz_json     TEXT NOT NULL,     -- [{question, options, answer_index, explanation}]
    completed_at  TEXT,              -- ISO 8601 UTC (NULL = non terminée)
    created_at    TEXT NOT NULL
);

-- 3. Cartes mémoire et état FSRS
CREATE TABLE cards (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    language            TEXT NOT NULL DEFAULT 'en',
    term                TEXT NOT NULL,
    translation         TEXT NOT NULL,
    phonetic            TEXT,
    example_sentence    TEXT NOT NULL,
    example_translation TEXT NOT NULL,
    mnemonic            TEXT,
    source_lesson_id    INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
    due                 TEXT NOT NULL,           -- ISO 8601 UTC (prochaine révision)
    fsrs_state_json     TEXT NOT NULL,           -- État interne ts-fsrs sérialisé
    created_at          TEXT NOT NULL,
    UNIQUE (language, term)
);
CREATE INDEX idx_cards_due ON cards(due);

-- 4. Journal unique d'activité (source de vérité des statistiques et objectifs)
CREATE TABLE activity_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT NOT NULL,      -- 'card_review' | 'lesson_completed' | 'drill' | 'chat'
    ref_id      INTEGER,
    rating      INTEGER,            -- 1 (Again) à 4 (Easy) pour les cartes
    score       REAL,               -- Note sur 10 pour les exercices
    duration_s  INTEGER,
    meta_json   TEXT,
    created_at  TEXT NOT NULL       -- ISO 8601 UTC
);
CREATE INDEX idx_activity_date ON activity_log(created_at);

-- 5. (Phase 2) Suivi des erreurs récurrentes
CREATE TABLE mistakes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT NOT NULL,      -- 'drill' | 'chat'
    user_text   TEXT NOT NULL,
    correction  TEXT NOT NULL,
    category    TEXT,
    explanation TEXT,
    created_at  TEXT NOT NULL
);
```

---

## 6. Détail des modules fonctionnels

### 6.1 Module A : Générateur de micro-leçons (`/lesson` — MVP)
1. L'utilisateur saisit un sujet libre (ou choisit une suggestion issue de `settings.interests`) et valide le niveau CEFR.
2. Le serveur exécute un appel LLM unique demandant un objet JSON validé par Zod contenant :
   - Un texte en anglais naturel de **120 à 180 mots**.
   - Sa traduction française fidèle.
   - **5 mots-clés ou expressions** extraits du texte, accompagnés chacun de leur traduction contextuelle, transcription phonétique (IPA), phrase d'exemple en anglais et traduction de l'exemple.
   - **3 questions QCM** de compréhension avec explication de la bonne réponse.
3. La leçon est enregistrée dans `lessons` avant affichage (aucune génération perdue en cas de rafraîchissement).
4. **Interaction mots :** Cliquer sur un mot-clé surligné affiche instantanément sa fiche (sans nouvel appel API) avec écoute audio et bouton **« + Ajouter aux révisions »**. Cliquer sur un autre mot du texte déclenche un appel ciblé pour créer sa fiche.

### 6.2 Module B : Révision espacée (`/review` — MVP)
1. Charge les cartes dont `due <= maintenant (UTC)`, limitées à `daily_review_cap` (défaut : 15).
2. **Recto :** Terme anglais + bouton de lecture audio (`en-US` / `en-GB` via `speechSynthesis`).
3. **Verso :** Traduction, phonétique, phrase d'exemple (avec audio) et moyen mnémotechnique.
4. **Évaluation :** 4 boutons (*1: À revoir*, *2: Difficile*, *3: Bien*, *4: Facile*). `src/srs/index.ts` calcule le nouvel état FSRS et la nouvelle date `due`, met à jour `cards` et insère une entrée `card_review` dans `activity_log`.

### 6.3 Module C : Routine quotidienne souple (`/` — MVP)
- **Parcours du jour :** Affiche clairement les étapes restantes (ex. *« 8 cartes à réviser »* $\rightarrow$ *« 1 leçon à lire »*).
- **Objectif hebdomadaire (5 jours sur 7) :** Calculé dynamiquement depuis `activity_log` sur la semaine en cours (lundi à dimanche). Manquer une journée n'efface pas la progression de la semaine.
- **Plafond de nouvelles cartes :** Vérifie dans `activity_log` / `cards` combien de nouvelles cartes ont été créées aujourd'hui afin de respecter `daily_new_cards` (défaut : 10).

---

## 7. Sécurité, hébergement et stratégie de déploiement

### 7.1 Protection d'accès
- L'application étant accessible depuis un navigateur mobile, `middleware.ts` vérifie la présence d'un cookie de session signé obtenu après saisie d'un mot de passe unique (`APP_PASSWORD` dans `.env.local`).
- Aucune clé API (`GEMINI_API_KEY`) n'est exposée au client.

### 7.2 Stratégie d'hébergement (Mobile + Desktop)
1. **Option privilégiée (SQLite natif sur disque persistant) — Petit VPS gratuit :**
   - Héberger l'application Next.js sur un petit VPS gratuit (ex. **Oracle Cloud Always Free** — VM Ampere/AMD avec disque persistant, ou un petit VPS Linux) derrière **Caddy** ou **Nginx** (HTTPS automatique pour le support mobile et Web Speech API).
   - *Avantage :* `better-sqlite3` fonctionne nativement sans aucune modification de code, le fichier `data/english.db` est conservé en permanence sur le disque du VPS et accessible 24h/24 depuis ton téléphone et ton PC.
   - *Sauvegarde :* Une tâche `cron` quotidienne copie `english.db` (via la commande `.backup` de SQLite) vers un dossier de sauvegarde ou un stockage externe.
2. **Option de repli (Sans gestion de serveur) — Vercel + Turso (libSQL) :**
   - *Important :* Vercel utilise des fonctions *serverless* sans disque persistant : un fichier SQLite local (`better-sqlite3`) y serait effacé entre deux requêtes.
   - Si tu optes finalement pour **Vercel**, il suffira de remplacer le pilote `better-sqlite3` dans `src/db/index.ts` par **`@libsql/client` connecté à Turso** (base SQLite cloud distribuée disposant d'une offre gratuite très généreuse). Grâce à Drizzle ORM, le schéma et toutes les requêtes restent **100 % identiques**.

---

## 8. Feuille de route de développement

| Étape | Périmètre technique | Critère de validation ("Done") |
| :--- | :--- | :--- |
| **1. Socle & Base** (Jour 1) | Init Next.js TS/Tailwind, Drizzle ORM, `better-sqlite3` avec WAL + `foreign_keys`, schéma complet, `middleware.ts` (mot de passe). | La base `data/english.db` se crée avec les 4 tables, les migrations passent et l'accès est protégé par mot de passe. |
| **2. Leçons & LLM** (Jours 2–3) | `LLMProvider` + implémentation Gemini, validation Zod, prompt `lesson.ts`, API `/api/lessons/generate`, UI `/lesson`. | Je génère une leçon sur un thème libre, elle est sauvée en base, je peux lire le texte, l'écouter et valider les 3 QCM. |
| **3. Cartes & FSRS** (Jours 3–5) | Création de carte au clic depuis une leçon, encapsulation `ts-fsrs`, API `/api/review`, UI `/review` avec audio. | J'ajoute un mot d'une leçon, je le révise sur `/review` et sa date `due` (ISO UTC) avance selon ma note. |
| **4. Accueil & Réglages** (Jour 6) | Calcul des stats depuis `activity_log`, écran `/` (cartes dues, quête du jour, suivi 5j/7), édition des `settings`. | L'accueil affiche précisément ce qu'il reste à faire aujourd'hui et permet d'ajuster mes plafonds. |
| **Pause d'usage** (2 semaines) | Utilisation quotidienne réelle depuis mobile et PC. | Liste écrite des frictions constatées avant de coder la Phase 2. |
| **5. Phase 2 & 3** (Itératif) | Module `/drill`, table `mistakes`, module `/chat`, export `.db` en un clic, déploiement VPS. | Les exercices ciblent mes fautes enregistrées et l'app tourne en continu sur mon hébergement. |

---

## 9. Prompt de démarrage pour l'assistant de code

À copier-coller directement dans **Cline**, **GitHub Copilot** ou **Claude Code** une fois le dossier `english-coach` initialisé :

> *« Agis comme un architecte logiciel senior. Nous construisons "English Coach", une application web personnelle d'apprentissage de l'anglais en Next.js (App Router), TypeScript, Tailwind CSS, SQLite (`better-sqlite3`) avec Drizzle ORM et migrations. Commence uniquement par les étapes 1 et 2 du cahier des charges v3 :*
> *1. Configure `src/db/index.ts` en activant explicitement `PRAGMA journal_mode = WAL;` et `PRAGMA foreign_keys = ON;`, et crée le schéma Drizzle (`settings`, `lessons`, `cards`, `activity_log`) avec toutes les dates stockées en ISO 8601 UTC complet.*
> *2. Implémente la protection par mot de passe unique dans `middleware.ts` via `APP_PASSWORD`.*
> *3. Crée l'interface `LLMProvider`, son implémentation Gemini lisant `GEMINI_API_KEY` et `LLM_MODEL` depuis `.env.local`, la validation Zod stricte et le prompt de leçon isolé dans `src/llm/prompts/lesson.ts`.*
> *4. Construis l'API de génération et l'écran `/lesson` (génération sur thème libre, affichage texte EN/FR, mots-clés cliquables et QCM interactifs).*
> *Respecte strictement l'arborescence de la section 4, garde les routes API fines et n'implémente rien au-delà des étapes 1 et 2. »*