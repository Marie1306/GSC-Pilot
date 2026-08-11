# GSC Pilot — Architecture technique confirmée

Document vivant, séparé de `GSC_Pilot_Specification_confirmee.md` (qui
couvre les règles métier). Celui-ci couvre les décisions techniques et
de déploiement, confirmées le 10 août 2026 — à lire avant de commencer
la construction réelle dans Claude Code.

## Forme de l'application — confirmé
- **Une seule application web responsive** — pas deux programmes
  séparés pour cellulaire et PC. La même base s'adapte à l'écran
  (menu simplifié + gros boutons sur mobile, barre latérale complète
  sur PC) — même esprit que la distinction déjà présente dans le
  prototype v19 (`mobileNav` vs `sidebarNav`), à approfondir.
- **Installable depuis le navigateur, pas les magasins d'applications**
  (App Store / Google Play). Choisi pour une équipe de ~10 personnes :
  mises à jour immédiates sans délai de révision, pas de compte
  développeur à payer/gérer (99$US/an Apple, 25$US Google), installation
  par lien plutôt que recherche dans un magasin.
- Reste possible d'habiller la même base pour les magasins plus tard si
  le besoin change — pas une porte fermée.
- **Accès caméra confirmé nécessaire** (ex. scan QR) — fonctionne
  identiquement avec une appli installée depuis le navigateur, pas besoin
  des magasins pour ça. Nuance technique : la détection *automatique* de
  QR (BarcodeDetector) n'est pas fiable sur tous les téléphones (surtout
  iOS) dans le prototype actuel — à reconstruire avec une approche
  fonctionnant uniformément sur tous les appareils.

## Backend et données — confirmé
- **Vrai serveur + base de données centrale indispensable** — le
  prototype v19 (localStorage, aucun serveur) ne peut pas servir de base
  pour la vraie version. Confirmé dès le début de ce fil, reconfirmé ici.
- **Hors ligne indispensable**, avec synchronisation au retour de
  connexion — employés sur des sites clients sans accès internet.
- **Séparation code/données** — principe central pour permettre des mises
  à jour sans jamais perdre de données. Le code (fichiers de
  l'application) et les données (base de données) vivent à des endroits
  complètement séparés; une mise à jour remplace le code, jamais la base.
- **Migrations** pour tout changement de structure de données (ex.
  ajouter un champ à un projet) — un script testé qui adapte les
  données existantes, jamais un remplacement brutal.
- Les 9 modules déjà construits dans v01 (`roles.js`, `billing.js`,
  `subassembly.js`, etc.) sont volontairement sans dépendance à un cadre
  (framework) ou à une structure de base de données précise — réutilisables
  tels quels peu importe les choix techniques qui suivront.

## Sauvegardes et export — confirmé le 10 août 2026
- Sauvegardes **automatiques régulières**, plus un **bouton dans
  l'application pour déclencher une sauvegarde supplémentaire à la
  demande**, à tout moment.

## Hébergement — confirmé le 10 août 2026
- **Serveur infonuagique payé au mois**, pas l'ordinateur personnel.
- Trois options considérées (recherchées le 10 août 2026, prix à
  reconfirmer au moment de la construction réelle — ce marché change
  souvent) : Supabase (~25$/mois, base de données + authentification +
  stockage réunis), Render (~20-25$/mois, hébergement + base de données
  séparés, prix fixe et prévisible), DigitalOcean App Platform
  (~20-27$/mois, le plus établi des trois, sauvegardes quotidiennes
  incluses).
- **Pas encore choisi lequel des trois** — à trancher avant la
  construction réelle.
- Le site web actuel de l'entreprise ne peut pas devenir l'application
  elle-même (nature différente — public/vitrine vs privé/base de
  données), mais pourrait potentiellement partager le même compte
  d'hébergement selon ce sur quoi il tourne déjà — à vérifier plus tard
  par elle. En attendant, prévoir un hébergement séparé, un des trois
  ci-dessus.
- **Compte Supabase existant (autre petite application)** : peut servir
  pour le *compte*, mais GSC Pilot doit avoir son **propre projet
  distinct** — jamais partager la base de données ou l'authentification
  avec une autre application, vu les données sensibles en jeu. Confirmé
  (10 août 2026) : le forfait gratuit de Supabase n'inclut aucune
  sauvegarde automatique — GSC Pilot aurait besoin du forfait payant
  (~25$/mois) sur son propre projet, peu importe le statut de l'autre
  application. Pas clair si Supabase facture par projet ou par compte au
  complet — à vérifier directement sur leur page de tarification au
  moment de configurer le vrai projet.
- **Pas requis avant de commencer dans Claude Code** — le développement
  peut se faire avec une base temporaire/gratuite; la bascule vers le
  projet payant avec sauvegardes ne devient nécessaire qu'au moment
  d'utiliser l'application pour de vrai, avec de vraies données clients.

## Mises à jour de l'application — confirmé
- Mise à jour automatique par défaut avec l'approche « installable
  depuis le navigateur » — aucun mécanisme spécial à construire, contrairement
  à l'option magasins d'applications qui aurait demandé de gérer soi-même
  la vérification/installation des mises à jour (si distribution hors
  magasin) ou de passer par le processus de révision d'Apple/Google.
- Les données des utilisateurs ne sont jamais affectées par une mise à
  jour de l'application, peu importe l'approche — elles vivent sur le
  serveur, jamais sur l'appareil.

## Row Level Security (Supabase) — confirmé le 11 août 2026
- **RLS activée sur toutes les tables dès leur création**, proposée
  automatiquement par l'éditeur SQL de Supabase (case « Run and enable
  RLS ») au moment d'exécuter la migration initiale — acceptée.
- **Aucune politique (policy) à écrire pour l'instant, et c'est
  volontaire** : le seul chemin d'accès aux données est l'API Express
  (via Prisma, rôle propriétaire des tables — non soumis à RLS). Le
  frontend ne se connecte jamais directement à Postgres/PostgREST avec
  la clé publique (`sb_publishable_...`) ou une session Supabase Auth —
  toujours par l'API Express, qui applique `roles.ts` normalement.
  RLS activée sans aucune politique bloque donc entièrement les rôles
  `anon`/`authenticated` de Supabase sur toutes les tables — exactement
  le comportement voulu, en défense en profondeur si jamais la clé
  publique du projet fuitait.
- Si un futur besoin exige un accès direct Supabase→table depuis le
  frontend (contournant l'API Express), il faudra écrire une politique
  RLS explicite pour ce cas précis à ce moment-là — ne jamais l'ouvrir
  par anticipation.
