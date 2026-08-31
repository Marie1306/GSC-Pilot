# GSC Pilot — notes pour les prochaines sessions

Outil de gestion interne pour l'atelier de GSC Automation (demandes clients →
budgétaire → projets → Gantt/sous-assemblages → punch d'heures → achats →
suivi de facturation → livraisons → appels de service → contacts/rapports),
5 rôles avec des permissions précises sur presque chaque action.

## Sources de vérité — toujours consulter avant de deviner une règle

- `docs/handoff/02-specification-metier/GSC_Pilot_Specification_confirmee.md`
  — **la** source de vérité pour toute règle métier. Si le comportement du
  code contredit ce document, le document a raison.
- `docs/handoff/01-architecture/GSC_Pilot_Architecture.md` — contraintes
  techniques/déploiement confirmées.
- `docs/handoff/04-reference-v19/` — prototype ChatGPT, **référence visuelle
  uniquement** (mise en page, libellés). Ne jamais construire par-dessus,
  contient des bugs déjà documentés et corrigés dans la spécification.
- `/root/.claude/plans/magical-finding-fog.md` (si encore présent dans cette
  session) ou l'historique de conversation — le plan de fondation d'origine
  (Phase 1 + Phase 2) et les décisions confirmées avec l'utilisateur.

## Piège de nommage des rôles — important

`packages/business-rules/src/roles.ts` (porté de `roles.js`, 60 tests
vérifiés) nomme ses valeurs `owner`/`admin`/`boss`/`member`/`warehouse`.
**`"owner"` désigne la Direction, PAS le propriétaire de l'entreprise.**
`"boss"` désigne le vrai Propriétaire (Propriétaire de GSC Automation).
Ces valeurs sont gardées telles quelles dans toute la base de données et le
code (`Employee.persona`) parce que `roles.js` est déjà testé et ne doit
jamais être modifié — mais ne jamais assumer que `persona === "owner"`
signifie "le propriétaire". Toujours vérifier ce fichier avant d'écrire une
nouvelle vérification de permission plutôt que de deviner.

## Piège de nommage — Assemblage vs Sous-assemblage (module Subassembly)

Depuis le 31 août 2026 (demande explicite de l'utilisatrice), le module où
le Propriétaire (Marc, seul designer/conception) déclare une unité prête
s'affiche **« Assemblage »** dans l'interface (`ProjectSubassemblies.tsx`,
Centre d'actions). **Rien n'a changé en interne** : le modèle Prisma reste
`Subassembly`, le fichier reste `subassembly.ts`/`subassemblies/`, les
fonctions restent `declareSubassemblyReady`/`markPartsListReady`/etc. — même
principe que le piège owner/boss ci-dessus, ne jamais renommer le code pour
suivre un renommage d'affichage.

Deux confusions à éviter, toutes les deux déjà soulevées et tranchées avec
l'utilisatrice :
- **`declareAssemblyReady` (Direction) ≠ la déclaration de Marc.** C'est un
  geste séparé et déjà existant, sans lien de nommage voulu : Direction
  déclare que la tâche PHYSIQUE d'assemblage (une catégorie d'heures parmi
  d'autres) peut démarrer dans le Gantt, après la liste de pièces. Marie a
  choisi explicitement de garder ce texte tel quel (« Déclarer l'assemblage
  prêt », option B) plutôt que de le reformuler pour éviter la ressemblance
  avec le nouveau terme de l'unité de Marc — les deux mots coexistent dans
  la même carte à l'écran, volontairement.
- **Le module Checklist a son propre « sous-assemblage »**, un concept
  totalement différent (regroupement de pièces dans une checklist de
  production) et SANS lien avec le modèle `Subassembly` ci-dessus (confirmé
  dans le schéma). Ce terme n'a jamais été renommé et ne doit jamais
  l'être : `ChecklistProjectView.tsx`, `ChecklistItemEditModal.tsx`,
  `checklist.css`, `checklists/service.ts`.

## Règle de reuse — ne jamais réécrire les modules métier

Les 9 modules dans `packages/business-rules/src/` (portés depuis
`docs/handoff/03-modules-v01/*.js`) encodent des règles métier déjà
vérifiées avec de vrais chiffres. Le port vers TypeScript n'a ajouté que des
types — **aucune ligne de logique n'a changé**. Toute nouvelle fonctionnalité
qui a besoin d'une de ces règles doit importer la fonction existante, jamais
la réimplémenter. Si une règle semble manquante ou ambiguë, consulter la
spécification (section précédente) — ne jamais deviner une valeur non
confirmée, c'est le principe qui a guidé tout ce projet depuis le début.

## Ordre de priorité confirmé : fonctionnalité avant peaufinage visuel

Confirmé avec l'utilisatrice le 12 août 2026 : chaque nouvel écran utilise
déjà les vrais jetons de conception (couleur de marque, police, boutons,
cartes — voir `packages/shared/src/design-tokens.ts`), et le plan était de
construire la fonctionnalité réelle de tous les modules d'abord, puis
faire une passe visuelle dédiée écran par écran une fois les règles
stabilisées — pour ne pas refaire le visuel à chaque ajustement de règle
métier pendant la construction.

**Mise à jour du 28 août 2026, confirmée avec l'utilisatrice** : la passe
visuelle est maintenant considérée à ~95 % complète (faite au fil de la
construction — thème sombre, bandeaux d'en-tête, tiroirs latéraux,
plusieurs itérations déjà visibles dans l'historique de commits — jamais
une seule passe séparée massive comme envisagé initialement). Ce qui reste
du visuel se rattrape au cas par cas via les tests réels de l'utilisatrice
(même mécanisme que les corrections fonctionnelles) plutôt que via une
passe dédiée à part — ne pas assumer qu'une grosse passe visuelle reste à
faire, mais rester attentif aux rapports ponctuels comme n'importe quel
autre bug.

## Commandes utiles

```
npm install          # à la racine, installe tout le monorepo
npm run dev           # api + web en parallèle
npm test              # tous les tests (Vitest), toutes les workspaces
npm run typecheck     # tsc --noEmit dans chaque package/app
npm run lint
npm run db:migrate    # migration Prisma (dev) — voir apps/api/.env
npm run db:seed
```

## Stack confirmée

TypeScript de bout en bout · React + Vite (PWA installable, hors ligne
limité à 3 tâches de terrain : punch d'heures, scan QR, formulaire d'appel
de service) · Node.js/Express · PostgreSQL + Prisma (migrations) · Supabase
(base de données + authentification + stockage — projet dédié, jamais
partagé avec d'autres applications) · hébergement de l'API séparé de
Supabase sur Render (confirmé, en ligne — voir section suivante).

## État du projet Supabase réel (11 août 2026)

Le vrai projet Supabase (réf. `oczshmnsyuhpmkuvhtkz`) est provisionné :
structure complète (33 tables, migration `20260811114623_init` committée
dans `apps/api/prisma/migrations/`) + données de départ (modèle de
budgétaire, catégories d'achat, canaux de vente, réglages) + 5 comptes de
test (un par rôle, mot de passe `gsc-pilot-test-2026`, voir
`apps/api/scripts/seed.ts`) créés et liés à leurs fiches `Employee`. RLS
activée sur toutes les tables, sans politique — voir
`GSC_Pilot_Architecture.md`, section RLS, pour le raisonnement.

Cette session n'a **aucun accès réseau** au projet Supabase réel (ni HTTPS
vers cet hôte, ni Postgres brut — bloqué par le proxy sortant du bac à
sable). Le provisionnement ci-dessus a été fait en générant le SQL via une
vraie base Postgres locale au bac à sable (migration + seed réels, jamais
deviné), puis en guidant l'utilisatrice pour le coller elle-même dans
l'éditeur SQL de Supabase. Si une prochaine session doit à nouveau modifier
la structure de la base réelle, s'attendre à devoir repasser par ce même
contournement (ou vérifier si l'accès réseau a changé) plutôt que de
supposer qu'une connexion directe est possible.

## Déploiement réel — Render (11 août 2026)

L'API est déployée sur Render (service `gsc-pilot`, plan gratuit, région
Ohio) : https://gsc-pilot.onrender.com — sert aussi le build statique de
`apps/web` (même origine, voir `app.ts`). Branche déployée :
`claude/app-development-help-j8mp22` (pas encore de branche `main` sur ce
dépôt — auto-deploy Render suit cette branche pour l'instant). Connexion
de bout en bout vérifiée réellement (pas juste en tests) avec 2 des 5
comptes de test, permissions par rôle confirmées visuellement (menu
Direction complet vs menu Employé restreint).

Deux bugs réels trouvés et corrigés pendant cette vérification (déjà
committés) :
- CSP (Helmet) n'autorisait pas `connect-src` vers Supabase — bloquait
  Supabase Auth côté navigateur. Voir `app.ts`.
- `prisma generate` ne tournait jamais sur un clone/déploiement frais
  (sortie gitignored, aucun hook) — `postinstall` ajouté dans
  `apps/api/package.json`.

Le plan gratuit de Render s'endort après 15 min d'inactivité (~30-60s de
réveil) — acceptable pour l'instant, à passer au plan payant (~7$/mois)
avant un usage quotidien réel par l'équipe (surtout le punch d'heures).

Le mot de passe de la base de données et `SUPABASE_SERVICE_ROLE_KEY` ont
été régénérés après le dépannage (les valeurs d'origine étaient apparues
en clair dans la conversation) — les valeurs actuelles ne sont documentées
nulle part, seulement dans Render (Environment) et Supabase.
