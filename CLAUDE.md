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

## Lancement réel — ménage, comptes réels, plans payants (2 septembre 2026)

Confirmé avec l'utilisatrice : Render passé au plan payant (Starter,
~7$/mois) et Supabase passé au plan Pro (~25$/mois, choisi spécifiquement
pour les sauvegardes quotidiennes — le plan gratuit de Supabase n'en offre
aucune, contrairement à ce qu'on pouvait supposer). Ménage complet de la
base réelle effectué (script SQL vérifié contre une copie locale avant
livraison) : toutes les données opérationnelles effacées, configuration et
compteurs de numérotation remis à zéro, les 5 comptes de test supprimés et
remplacés par le vrai compte de l'utilisatrice (persona `owner`/Direction).

**Bogue réel trouvé et corrigé en essayant d'inviter le premier vrai
employé (Administration)** : le lien d'invitation Supabase
(`inviteUserByEmail`, `employees/service.ts`) redirigeait vers `localhost`
— le "Site URL" du projet Supabase était resté configuré pour le
développement local, jamais mis à jour après le déploiement sur Render.
Pire : même une fois cette redirection corrigée, **l'application n'avait
aucune page pour qu'un employé invité définisse son mot de passe** — le
flux d'invitation avait été construit côté serveur (envoi réel de
l'invitation, confirmé dans le plan de fondation d'origine) mais jamais
complété côté client. Corrigé :
- `apps/api/src/env.ts` : nouvelle variable `APP_URL` (URL publique de
  l'application), utilisée dans `createEmployee` pour passer un
  `redirectTo` explicite à `inviteUserByEmail` au lieu de dépendre du Site
  URL du projet Supabase.
- `apps/web/src/features/auth/AcceptInvitePage.tsx` (nouvelle page, route
  `/accepter-invitation`, hors `RequireRole` — même patron que
  `/connexion`) : reçoit la session Supabase établie automatiquement par
  le jeton dans l'URL, fait définir le mot de passe
  (`supabase.auth.updateUser`), puis redirige vers `/`.
- `apps/web/src/lib/auth/AuthProvider.tsx` : écoute l'événement
  `PASSWORD_RECOVERY` de Supabase et redirige vers `/accepter-invitation`
  peu importe la page courante — nécessaire parce que le bouton "Send
  password recovery" du tableau de bord Supabase (utilisé par Direction
  pour renvoyer une invitation cassée à un employé déjà créé, puisque
  `createEmployee` refuse un courriel en double) redirige toujours vers le
  Site URL du projet (donc `/`), jamais vers une route précise.

**Reste à faire côté Supabase/Render (pas quelque chose que cette session
peut faire — aucun accès réseau à ces tableaux de bord)** : l'utilisatrice
doit (1) mettre à jour le "Site URL" dans Supabase → Authentication → URL
Configuration pour qu'il pointe vers `https://gsc-pilot.onrender.com`
(sinon d'autres flux Supabase non couverts par `redirectTo` explicite,
s'il y en a un jour, retomberaient sur le même bogue), et (2) ajouter la
variable d'environnement `APP_URL=https://gsc-pilot.onrender.com` dans
Render (Environment) — sans quoi le déploiement actuel échouera au
démarrage (`env.ts` exige `APP_URL`, `process.exit(1)` si absente). Si une
prochaine session reprend ce chantier, vérifier d'abord si Marie a
confirmé avoir fait ces deux réglages avant de supposer que l'invitation
fonctionne de bout en bout.

**Service SMTP par défaut de Supabase insuffisant en usage réel** :
plafond très bas (quelques courriels/heure, prévu pour tester un projet,
jamais pour un usage réel) — atteint dès la deuxième invitation envoyée le
même jour. Marie configure un fournisseur SMTP dédié (Resend, domaine
`gscautomation.com` — vérification DNS en cours via IciMedia, l'hébergeur
du site web de l'entreprise) plutôt qu'Outlook/Microsoft 365, dont
l'authentification SMTP est bloquée tenant-wide par les "paramètres de
sécurité par défaut" de Microsoft (legacy auth désactivée globalement,
pas seulement au niveau d'une boîte courriel précise).

**Deux bogues réels trouvés le 2 septembre 2026, lors des tout premiers
vrais dossiers créés par l'utilisatrice** (déjà corrigés) :
- Les fenêtres contextuelles (`.modal-backdrop`) se fermaient au clic à
  l'extérieur — perte de saisie en cours rapportée sur l'éditeur de cycle
  de facturation (`ProjectInvoicePlan.tsx`). Retiré sur les 19 modales
  concernées à travers l'application — seuls le bouton "×" et "Annuler"
  ferment désormais une fenêtre contextuelle.
- **Paiement de facture enregistré en double** : `InvoiceActionDrawer.tsx`
  (ouvert depuis le Centre d'actions) était une copie devenue obsolète
  d'`InvoiceDetailDrawer.tsx` (module Facturation) — ne se fermait jamais
  après un paiement réussi ET ne réinitialisait jamais le montant saisi,
  permettant à un deuxième clic de soumettre le même versement une
  deuxième fois (`recordInvoicePayment` additionne toujours, jamais un
  remplacement). Administration a ainsi doublé un paiement réel.
  `InvoiceActionDrawer.tsx` supprimé, `ActionCenterPage.tsx` utilise
  maintenant `InvoiceDetailDrawer.tsx` (déjà correct depuis le 31 août
  2026) — jamais deux logiques de facturation en parallèle, comme prévu à
  l'origine mais pas respecté depuis. Nouvelle fonction
  `correctInvoicePaidAmount` (REMPLACE `paidAmount`, contrairement à
  `recordInvoicePayment` qui l'additionne) + bouton "Corriger le montant
  payé" dans `InvoiceDetailDrawer.tsx`, pour corriger ce genre d'erreur
  sans passer par du SQL — Marie doit s'en servir elle-même pour corriger
  le paiement réellement doublé dans sa base de production.

**Trois problèmes réels trouvés le 2 septembre 2026, lors d'un test de
suppression de projet** (déjà corrigés) — signalés ensemble par
l'utilisatrice après avoir créé le projet 2422, l'avoir supprimé pour
tester le mode budgétaire, puis avoir tenté de le recréer :
- **Aucune corbeille n'existait dans Paramètres**, alors qu'elle
  l'attendait. En fait déjà annoncé dans le code lui-même : chaque
  commentaire `deletedAt` du schéma (Project/Budget/ClientRequest/
  ServiceCall/Rolling/TimeEntry) dit explicitement que l'écran de
  restauration "attend le module Paramètres complet (confirmé, hors de
  cette phase)" — jamais construit depuis. Nouveau fichier
  `apps/api/src/modules/settings/trash.ts` (`listTrash`/
  `restoreTrashItem`, même patron que `auditLog.ts` : lecture seule +
  une action, monté sur `settingsRouter` donc Direction seulement comme
  tout le reste de Paramètres) couvrant les 7 modèles avec `deletedAt`
  (Project/ClientRequest/Budget/ServiceCall/Rolling/TimeEntry/
  ErrorReport) + nouvelle carte `TrashCard.tsx` dans Paramètres (liste +
  bouton "Restaurer" par élément, même style qu'`AuditLogCard.tsx`).
  Restaurer ne fait QUE remettre `deletedAt` à `null` — ça n'annule pas
  les effets de bord d'une suppression (le seul cas réel :
  `deleteBudget` décroche aussi la demande client liée, un budgétaire
  restauré ne se rattache pas automatiquement).
- **Un projet supprimé restait sélectionnable dans le formulaire de
  demande d'achat** (`PurchaseRequestForm.tsx`) : la route `GET
  /api/projects` (`apps/api/src/modules/projects/routes.ts`, celle qui
  peuple ce sélecteur — pas `listProjectOptions`/`listProjects`, qui
  filtraient déjà correctement mais ne sont jamais atteintes pour ce
  chemin précis, `projectsRouter` étant monté avant `timeEntriesRouter`
  dans `app.ts` avec la même route `GET /projects`) ne filtrait que
  `closedAt`/`warrantyEndsAt`, jamais `deletedAt`. Ajouté.
- **Le numéro d'un projet supprimé restait bloqué pour toujours**,
  empêchant sa réutilisation même après suppression — le vrai numéro
  physique du projet recréé par Marie (2422) ne correspondait donc plus
  à son numéro dans l'application (forcée à 2423). Double cause : (1)
  `convertBudgetToProject`/`createProjectDirect`
  (`apps/api/src/modules/projects/service.ts`) vérifiaient l'unicité via
  `findUnique` sans exclure les projets supprimés ; (2)
  `Project.projectNumber` avait `@unique` en base — même en corrigeant
  (1), l'insertion aurait échoué au niveau DB. Retiré `@unique` du schéma
  (migration additive `20260902171209_project_number_not_unique` — DROP
  INDEX seulement, jamais destructif) ; unicité maintenant vérifiée en
  code UNIQUEMENT parmi les projets non supprimés (`findFirst({
  deletedAt: null })`). `restoreTrashItem` bloque elle-même la
  restauration d'un projet si un AUTRE projet actif a depuis pris son
  numéro (409, message explicite) — cas réel maintenant possible avec la
  contrainte DB retirée.

  Les 3 correctifs vérifiés contre Postgres local avant livraison
  (scripts jetables, supprimés après usage) : création → suppression →
  disparition du sélecteur d'achats → réutilisation du numéro par un
  nouveau projet → apparition dans la corbeille → restauration bloquée
  tant que le numéro est repris → restauration réussie une fois le
  conflit levé.

  **Fait par Marie le 2 septembre 2026, confirmé** — les deux étapes
  manuelles côté Supabase (cette session n'a aucun accès réseau à
  Supabase ni à Render, donc jamais faisable directement) :
  ```sql
  DROP INDEX "Project_projectNumber_key";
  ```
  puis, après vérification, la correction des données réelles
  (2422/2423) :
  ```sql
  DELETE FROM "Project" WHERE "projectNumber" = '2422' AND "deletedAt" IS NOT NULL;
  UPDATE "Project" SET "projectNumber" = '2422' WHERE "projectNumber" = '2423' AND "deletedAt" IS NULL;
  ```
  Résultat vérifié par Marie (capture d'écran d'un SELECT) : un seul
  projet numéroté 2422 (« Chutes Buanderies »), actif, plus aucune trace
  du 2423 — exactement l'état attendu. Les deux requêtes ont été collées
  l'une après l'autre sans relire la consigne intermédiaire (vérifier la
  corbeille avant la deuxième), mais le scénario réel correspondait
  exactement à ce qui avait été vérifié en local, donc aucun dégât.

**Déploiement Render cassé juste après le correctif ci-dessus (2 septembre
2026, corrigé)** : `npm run build` local passait pourtant au vert avant le
push. Cause réelle : `apps/api/scripts/seed.ts` avait lui aussi un
`prisma.project.findUnique({ where: { projectNumber } })` (grep initial
limité à `apps/api/src`, jamais étendu à `scripts/`) — cassé par le retrait
de `@unique` sur `Project.projectNumber`. Invisible localement parce que le
Prisma Client déjà généré dans `node_modules` reflétait encore l'ancien
schéma (généré une seule fois en début de session, jamais reconstruit
depuis un clone propre) ; Render, lui, régénère toujours le client à neuf
(`postinstall`) à chaque déploiement, donc l'a détecté immédiatement.
Corrigé (`findFirst({ projectNumber, deletedAt: null })`, même patron que
`service.ts`) et **revérifié en clonant le dépôt dans un dossier propre
puis `npm ci && npm run build`** — jamais juste `npm run build` dans le
sandbox déjà utilisé toute la session, qui peut cacher exactement ce genre
d'écart. À refaire pour toute future modification du schéma Prisma qui
retire ou change un champ utilisé ailleurs.

## Achats — Administration ajoutée en permanence (2 septembre 2026)

Demande explicite de l'utilisatrice : « qui reçoit les demandes d'achats ?
Seulement Direction ? Il faudrait que ce soit aussi Administration. Puis
aussi pour Commande à passer, Direction et administration. » Jusqu'ici
Administration ne pouvait agir sur ces deux mécanismes que via une
délégation temporaire (`DelegationGrant`, Paramètres) — jamais en
permanence, contrairement à ce que Marie attendait.

`packages/business-rules/src/roles.ts` : `canApprovePurchaseRequest` et
`canManagePurchaseFulfillment` retournent maintenant `true` pour
`ROLES.ADMIN` sans condition, en plus du cas Direction/délégation déjà en
place (`persona === ROLES.ADMIN || actsAsDirection(...)`). Un seul point
de vérité réutilisé partout (routes.ts, actionCenter/service.ts,
PurchaseRequestList.tsx, PurchaseRequestActionDrawer.tsx) — confirmé par
grep avant modification, aucun autre endroit ne duplique cette logique.

**Portée volontairement limitée à ces deux fonctions seulement** —
`canApproveProjectPurchase` (achats affectés DIRECTEMENT à un projet,
mécanisme distinct et déjà documenté comme tel dans roles.ts) reste
Direction seulement, jamais mentionné par Marie, jamais deviné. L'escalade
de seuil au-delà du montant gelé (double autorisation du Propriétaire)
reste elle aussi inchangée : Administration comme Direction restent
insuffisantes seules au-dessus du seuil, seul le Propriétaire (`boss`)
suffit alors.

Tests étendus dans `packages/business-rules/test/roles.test.ts` (3
nouveaux cas : Administration sous le seuil / au-dessus du seuil pour
`canApprovePurchaseRequest`, Administration pour
`canManagePurchaseFulfillment`) plutôt que remplacés — aucune régression
sur le comportement Direction/Propriétaire/délégation déjà couvert.
