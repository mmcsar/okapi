# Okapi

**Okapi** est un agent IA autonome pour créer des applications et sites web, pensé pour les entrepreneurs et étudiants de la **République démocratique du Congo**. Comme un builder conversationnel, tu décris ton idée en langage naturel (français, lingala, anglais, etc.) et Okapi génère une app HTML prête à prévisualiser, modifier et partager.

## Vision

Beaucoup d’outils IA sont pensés pour d’autres marchés. Okapi cible le contexte local : mobile-first, WhatsApp, Mobile Money, et une interface simple pour démarrer sans stack technique lourde. L’objectif : passer d’une idée à un prototype utilisable en quelques minutes.

## Fonctionnalités

- **Agent unique** : questions, conseils et génération d’apps dans le même chat
- **Génération HTML** live (Tailwind CDN, JS inline) avec prévisualisation
- **Multilingue** : l’agent répond dans la langue de l’utilisateur
- **Audio** : dictée vocale et lecture à voix haute
- **Images** : analyse d’images jointes dans le chat
- **Projets** : sauvegarde / réouverture via Supabase (auth + base)
- **Export HTML** et **lien public** de partage
- **Paramètres** : langue, voix, compte

## Stack

- **Next.js** (App Router) + React + Tailwind
- **Supabase** : authentification, stockage des projets, partage public
- **LLM** : OpenAI GPT-5 (recommandé en RDC), avec options Gemini / OpenRouter / Claude

## Lancer en local

```bash
npm install
cp .env.example .env.local
# renseigner les clés dans .env.local
npm run dev
```

Exécuter aussi les migrations SQL dans `supabase/migrations/` via l’éditeur SQL Supabase.

## PWA

Okapi est installable comme une app web (PWA) :
- Manifest + service worker (`public/manifest.webmanifest`, `public/sw.js`)
- Sur mobile : menu navigateur → **Ajouter à l’écran d’accueil**
- Ou **Paramètres → Application (PWA)** sur le site déployé (HTTPS)

## Déploiement (Vercel)

1. Importer ce repo sur [Vercel](https://vercel.com/new)
2. Ajouter les variables d’environnement (`OPENAI_API_KEY`, `LLM_PROVIDER`, clés Supabase, etc.)
3. Deploy

## Licence

Projet privé / en construction. Issues et retours bienvenus.

**Okapi — construis ton app. Depuis Kinshasa, pour la RDC.**
