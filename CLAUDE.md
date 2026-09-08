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

## Achats réels — montants négatifs pour les crédits de retour (2 septembre 2026)

Demande explicite de l'utilisatrice (screenshot à l'appui, "Ajouter un
achat" sur un projet) : les crédits reçus au retour d'une commande
doivent pouvoir être saisis en négatif dans les Achats réels
(`ProjectPurchaseEntry`) — jusqu'ici bloqué à trois niveaux différents,
tous corrigés ensemble :
- Backend (`apps/api/src/modules/purchases/routes.ts`) : les deux zod
  `amount: z.number().positive(...)` (création + correction du montant,
  routes partagées entre achats de projet ET de roulement — même schéma,
  même service `updateProjectPurchaseEntryAmount`) remplacés par un seul
  `purchaseEntryAmountSchema` réutilisé aux deux endroits, qui rejette
  seulement zéro (`refine((v) => v !== 0)`), jamais les négatifs.
- Frontend (`ProjectPurchaseEntries.tsx` ET `RollingPurchaseEntries.tsx`
  — même mécanisme dupliqué, corrigé aux deux endroits) : `min={0}`
  retiré des champs montant (création + correction inline), et le calcul
  `canCreate`/`disabled` du bouton passe de `amount > 0` à une nouvelle
  fonction locale `isValidAmount` (`Number.isFinite(amount) && amount !== 0`)
  — le `> 0` original bloquait silencieusement tout négatif malgré la
  saisie possible dans le champ.
- Aucun changement nécessaire à `projectPurchasesActual`/
  `rollingPurchasesActual` (purchases/service.ts) : simple `_sum`
  Postgres, un montant négatif réduit déjà correctement le total —
  vérifié contre Postgres local (création d'un achat positif + un
  crédit négatif sur le même projet, total = somme exacte attendue,
  script jetable supprimé après usage). Aucune contrainte DB (`CHECK`)
  ne bloquait non plus — confirmé par grep sur les migrations avant de
  toucher au schéma.

## Livraisons — déployé aussi pour Employé (2 septembre 2026)

Demande explicite de l'utilisatrice : « il faudrait aussi le déployer
pour les employés » — jusqu'ici `canAccessDeliveries` (roles.ts) excluait
Employé (`persona !== ROLES.MEMBER`), seul le reste de l'équipe y avait
accès. En creusant : le sélecteur de livreur (`ProjectFulfillment.tsx`/
`RollingDetail.tsx`, libellé "Magasinier") appelait déjà
`listPunchableEmployees` — TOUS les employés actifs, jamais filtré par
persona — donc Direction pouvait déjà assigner un Employé comme livreur
sans que celui-ci puisse ensuite voir ni confirmer sa propre livraison,
un vrai trou fonctionnel déjà latent avant même la demande de Marie.

- `canAccessDeliveries` retourne maintenant `true` pour tous les rôles.
- `listDeliveries` (deliveries/service.ts) : le filtre "ne voit que ses
  propres livraisons assignées" (déjà en place pour Magasinier) étendu à
  Employé (`OWN_DELIVERIES_ONLY = ["warehouse", "member"]`) —
  Direction/Administration/Propriétaire gardent la vue d'ensemble,
  jamais changé.
- Libellé "Magasinier" renommé en "Livreur" partout où il désigne ce
  champ (`ProjectFulfillment.tsx`, `RollingDetail.tsx`,
  `FulfillmentPage.tsx`, `DeliveryDetail.tsx`, `DeliveryExportView.tsx`)
  — devenu inexact maintenant qu'un Employé peut aussi y être assigné.
  Les usages de "Magasinier" comme nom de rôle ailleurs dans
  l'application (sélecteur de persona, délégation, etc.) restent
  inchangés, aucun lien avec ce champ.
- Vérifié contre Postgres local (script jetable, supprimé après usage) :
  deux projets avec deux livreurs Employé différents assignés — chaque
  Employé ne voit que sa propre livraison (1 sur 2), Direction voit les
  deux.

## Cases à cocher — couleur de marque globale (4 septembre 2026)

Rapporté sur `DelegationCard.tsx` (Paramètres) : une case à cocher
rendue en bleu par défaut du navigateur, visuellement incohérente avec
les 3 autres de la même rangée. Troisième fois que ce bogue exact est
rapporté (Checklist le 26 août 2026, Appels de service le 31 août
2026) — les deux fois précédentes avaient été corrigées par une règle
CSS locale au composant (`.checklist-grid input[type="checkbox"]`,
`.service-call-employee-checklist input[type="checkbox"]`), jamais
généralisées. Cette fois : règle globale dans `theme.css`
(`input[type="checkbox"] { width: 16px; height: 16px; accent-color:
var(--gsc-color-brand); }`), qui couvre désormais toutes les cases à
cocher de l'application (Délégation y compris) sans avoir à y repenser
à chaque nouvel écran. Les 2 règles locales devenues redondantes ont été
retirées de `checklist.css`/`serviceCalls.css` — `checklist.css` a gardé
uniquement son `display:block; margin:0 auto` (centrage dans la grille,
raison distincte et toujours nécessaire). Vérifié visuellement
(Playwright, rendu isolé de la couleur de marque réelle `#e30613`) : les
4 cases de Délégation s'affichent maintenant identiques, petites et
rouges.

## Coût réel de main-d'œuvre — corrigé pour utiliser le coût de l'employé, pas la catégorie (4 septembre 2026)

Rapporté par l'utilisatrice (captures d'écran du Post-mortem + de
Paramètres → Employés, avec exemple chiffré) : le « Coût réel » affiché
partout où un projet ou un roulement a du réel (Comparatif planifié/réel,
marge réelle) utilisait `BudgetModelRow.hourlyRate` — le taux interne de
la catégorie, LE MÊME que la planification budgétaire — au lieu du coût
réel de l'employé qui a punché. Conséquence concrète : le taux réel était
TOUJOURS identique au taux planifié (ex. Plasma toujours 116$/h peu
importe qui punch), rendant la colonne « Coût réel » incapable de
refléter qui a réellement fait le travail. Exemple confirmé par Marie :
5h de Plasma devraient coûter 359,75$ si c'est Xavier qui punch (coût
réel 71,95$/h, Paramètres → Employés) mais 538,55$ si c'est Yannick
(107,71$/h) — jamais le même montant pour les deux.

Cause trouvée dans `resolvePunchTarget`
(`apps/api/src/modules/timeEntries/service.ts`) : seule la branche
`project`/`rolling` gelait `row.hourlyRate` (BudgetModelRow) sur
`TimeEntry.costRate`, contrairement à `service`/`internal` qui gelaient
déjà `Employee.costRate`. La spécification elle-même se contredisait sur
ce point exact (comparer l'ancienne formule de marge réelle et l'ancienne
section Punch d'heures) — les deux sections corrigées et mises en
cohérence dans
`docs/handoff/02-specification-metier/GSC_Pilot_Specification_confirmee.md`.

**Corrigé** : les quatre types de punch (`project`/`rolling`/`service`/
`internal`) gèlent désormais tous `Employee.costRate` sur
`TimeEntry.costRate`. `BudgetModelRow.hourlyRate` reste utilisé
UNIQUEMENT côté PLANIFIÉ (budgets, avenants) — jamais touché, jamais pour
le réel. Comme pour tout le reste de l'application, le coût reste gelé
au moment précis du punch — confirmé explicitement par l'utilisatrice :
un changement de `Employee.costRate` aux Paramètres ne modifie jamais les
`TimeEntry` déjà enregistrées, seulement les punchs créés après le
changement. **Aucune donnée historique n'a été retouchée** — les
Post-mortem déjà produits avant ce correctif gardent leurs anciens
chiffres (gelés à l'ancien comportement, jamais recalculés après coup,
même principe que partout ailleurs dans l'application).

`actualLaborCost`, le tableau Comparatif (Projet, Post-mortem, Roulement)
et les Rapports n'ont eu besoin d'AUCUNE modification propre — ils lisent
tous `TimeEntry.costRate` déjà existant depuis un seul point de vérité
(confirmé par grep avant modification), jamais recalculé indépendamment
ailleurs.

Vérifié contre Postgres local (script jetable, supprimé après usage) :
projet direct, 2 employés à coût réel différent (28,00$/h et 26,00$/h)
punchent 5h chacun sur la même tâche (Plasma, catégorie dont le taux
planifié est 116$/h) — `TimeEntry.costRate` gelé correspond bien à
chaque employé (jamais au taux de catégorie), et `grossMargin` du projet
reflète exactement 5×28+5×26 = 270,00$ de coût réel de main-d'œuvre
(jamais 5×116×2 = 1160,00$, l'ancien calcul erroné).

### Tentative de "recalcul en direct" essayée puis annulée le jour même — corrigée par une correction ponctuelle des données à la place

Juste après le correctif ci-dessus, l'utilisatrice a d'abord demandé une
exception pour que ses données déjà punchées soient fiables tout de
suite. Une première interprétation (confirmée par une question à choix
explicite, mais basée sur une mauvaise lecture de sa part de l'option
choisie) a fait recalculer `computeProjectFinancials`/
`getApprovedTimeEntries` EN DIRECT avec le taux ACTUEL de l'employé au
lieu du `TimeEntry.costRate` gelé — commit fait, PUSHÉ, donc brièvement
en ligne sur Render. Symptôme réel observé par l'utilisatrice sur un
vrai projet (2422) : la marge réelle affichée sur la carte de liste
(22,03 %, statut Critique) ne correspondait plus à celle de l'écran
détail/post-mortem (37,79 %, statut Conforme) — parce que `listProjects`
(voir plus bas) n'avait, lui, jamais été touché. L'utilisatrice a
clarifié qu'elle voulait en fait tout autre chose : une correction
**ponctuelle** des punchs déjà enregistrés, jamais un mécanisme
permanent qui bouge après coup. **Ce commit a été annulé** (`git
revert`, propre, aucun conflit) — `computeProjectFinancials` et
`getApprovedTimeEntries` sont revenus exactement au comportement du
correctif précédent (gelé au punch, jamais recalculé après coup,
partout, sans exception).

**Pièce manquante trouvée pendant cet épisode** : `listProjects`
(cartes de la liste des projets / tableau de bord) a sa PROPRE copie
indépendante du calcul de marge réelle (`actualByCategory`/
`marginResult`/`financialStatus`, lignes ~433-501) — jamais dérivée de
`computeProjectFinancials`, donc jamais synchronisée automatiquement
avec elle. C'est ce qui a rendu visible l'incohérence carte/détail
pendant que le recalcul en direct était actif. Cette duplication existe
depuis longtemps (raison de perf probable : `listProjects` traite tous
les projets en un seul aller-retour batché, jamais un appel par projet)
et n'est PAS un bogue introduit aujourd'hui — mais elle reste un risque
réel : toute future modification de `computeProjectFinancials` doit être
répliquée manuellement dans `listProjects`, sans quoi carte et détail
peuvent diverger. Jamais refactorisé pour l'instant (pas demandé par
l'utilisatrice, risque de perf à évaluer d'abord) — mais `listProjects`
lit `TimeEntry.costRate` directement (ligne ~379/439), donc la
correction ponctuelle des données ci-dessous corrige les DEUX écrans en
même temps, puisqu'ils finissent par lire le même champ.

**Correction retenue à la place — une seule fois, sur les vraies
données** (jamais un mécanisme permanent) : un UPDATE SQL qui remplace
`TimeEntry.costRate` par le `Employee.costRate` ACTUEL de la personne
qui a punché, pour tous les `TimeEntry` de type `project`/`rolling`
(jamais `service`/`internal`, déjà corrects depuis toujours). Vérifié
contre Postgres local (scénario jetable : 2 employés simulant l'ancien
bug à 116,00$ figé, plus une entrée `internal` à une valeur sentinelle
999,99$ pour prouver qu'elle n'est jamais touchée — supprimé après
usage) :

```sql
-- Aperçu (facultatif) : combien de punchs seront touchés
SELECT count(*) FROM "TimeEntry" WHERE "projectType" IN ('project', 'rolling');

-- La correction elle-même — à rouler UNE SEULE FOIS dans Supabase
UPDATE "TimeEntry" AS te
SET "costRate" = e."costRate"
FROM "Employee" AS e
WHERE te."employeeId" = e.id
  AND te."projectType" IN ('project', 'rolling');
```

Limite assumée (pas de contournement possible, aucun historique de taux
n'a jamais été conservé) : utilise le taux ACTUEL de l'employé comme
meilleure approximation disponible du coût réel — si le taux d'un
employé a changé pour une raison normale (augmentation) ENTRE un vieux
punch et aujourd'hui, cette correction ponctuelle utilisera le taux
d'aujourd'hui, pas celui en vigueur au moment exact du punch (qui n'a
jamais été enregistré nulle part). Cette session n'a aucun accès réseau
à Supabase — SQL remis à l'utilisatrice pour l'éditeur SQL Supabase,
même mécanisme que toutes les corrections de données réelles
précédentes.

**Fait par Marie le 4 septembre 2026, confirmé** : le SQL ci-dessus a
été roulé une seule fois contre la vraie base — carte de liste et écran
détail concordent maintenant, plus rien ne bouge tout seul. La
duplication `listProjects`/`computeProjectFinancials` notée ci-dessus
reste présente dans le code (jamais refactorisée, pas demandé) — juste
sans conséquence visible tant que les deux lisent la même donnée gelée.

## Dates-calendrier affichées un jour trop tôt (8 septembre 2026)

Rapporté par l'utilisatrice (captures d'écran) : une entrée manuelle de
punch datée du jour même (8 septembre) s'affichait au 7 septembre dans le
tiroir d'approbation du Centre d'actions et dans le tableau Temps — alors
que la carte de liste du Centre d'actions, elle, montrait bien le 8.

Cause : les colonnes Prisma `@db.Date` (dates-calendrier pures, sans heure
ni fuseau — `TimeEntry.date`, `ProjectPurchaseEntry.date`,
`PurchaseRequest.expectedReceiptDate`, `DelegationGrant.startDate`/
`endDate`, `Interruption.date`) arrivent toujours du serveur ancrées à
minuit UTC. La carte de liste du Centre d'actions ne lit PAS ce champ —
elle utilise `entry.endAt`/`startAt` (un vrai timestamp), d'où le bon
affichage ; le tiroir et le tableau lisent `TimeEntry.date` et le
reformatent via `new Date(iso).toLocaleDateString(...)` sans préciser de
fuseau — dans un fuseau nord-américain (Toronto, UTC-4 en heure d'été),
minuit UTC équivaut à 20h la veille en heure locale, donc la date affichée
recule d'un jour. Bogue systématique (jamais un cas limite) : il se
produit à chaque fois qu'un de ces 5 champs est affiché de cette façon,
pas seulement pour Temps. Deux endroits (`InterruptionsPanel.tsx` pour le
Gantt, `DelegationCard.tsx` pour la Délégation) avaient déjà découvert et
contourné le même problème indépendamment (en ajoutant une heure locale
avant de construire le `Date`) mais jamais généralisé — même patron que le
bogue des cases à cocher bleues (voir plus haut, corrigé une 3e fois en
CSS globale plutôt que localement).

**Corrigé** : nouveau `apps/web/src/lib/date.ts`
(`formatCalendarDate` — ancre midi HEURE LOCALE, sans "Z" ni décalage
dans la chaîne construite, pour que l'analyse et le formatage se fassent
dans le même fuseau) appliqué partout où un de ces 5 champs est affiché :
`TimeEntryActionDrawer.tsx`, `TimePunchPage.tsx` (le bogue rapporté),
`ProjectPurchaseEntries.tsx`, `RollingPurchaseEntries.tsx`,
`ApprovedHoursDrilldown.tsx`, `ApprovedPurchasesDrilldown.tsx`,
`RollingHoursDetail.tsx`, `PurchaseRequestList.tsx`, `ReportsPage.tsx`,
`ServiceCallDetail.tsx`, `ServiceCallExportView.tsx` — ces 3 derniers
gardent leur `formatDate` local pour leurs AUTRES champs (de vrais
timestamps comme `requestedAt`/`scheduledAt`/`editedAt`, où la conversion
au fuseau local est correcte et ne doit surtout pas changer) et importent
`formatCalendarDate` seulement pour le champ concerné. Les 2 contournements
locaux déjà corrects (`InterruptionsPanel.tsx`, `DelegationCard.tsx`) ont
été migrés vers le même helper partagé plutôt que de garder 2 variantes
divergentes du même correctif.

Vérifié par simulation directe (Node, `TZ=America/Toronto`, le fuseau réel
de l'atelier) : l'ancien code reproduit exactement le bogue rapporté
("2026-09-08" → affiché "7 sept. 2026"), le nouveau donne "8 sept. 2026" —
pour les deux formats de sérialisation réellement utilisés par l'API
(date nue `"YYYY-MM-DD"` et ISO complet `"...T00:00:00.000Z"`, selon
l'endroit — les deux sont ancrés UTC, donc également touchés).
`npm run typecheck && npm run lint && npm test && npm run build` verts
après coup. Aucune migration Prisma, aucune correction de données réelles
requise — bogue d'affichage pur, jamais stocké incorrectement.

## Vente externe + remise à zéro annuelle sur 5 modules existants (8 septembre 2026)

Demande de Marie : un nouveau module « Vente externe » (vendre des pièces
sans passer par le cycle Projet complet). Plan complet dans
`/root/.claude/plans/magical-finding-fog.md` (toujours valide si présent
dans une future session). En concevant la numérotation `VE-AAAA-NNNN`,
vérification directe du schéma a révélé que seuls les Achats (DA-) avaient
une vraie remise à zéro annuelle — les 5 autres modules numérotés
(Budgétaire, Demande client, Livraison, Call de service, Roulement) ont un
compteur perpétuel. Tranché avec Marie : remise à zéro annuelle partout,
pas seulement pour le nouveau module — donc un correctif rétroactif sur 5
modules déjà en production, en plus du nouveau module.

**Partie 1 — remise à zéro annuelle (Budget/ClientRequest/Delivery/
ServiceCall/Rolling)** : nouveau `apps/api/src/modules/settings/
sequentialNumbers.ts` (`currentBusinessYear()` — heure America/Toronto,
jamais UTC, pour éviter qu'un document créé tard le soir le 31 décembre
bascule prématurément à la nouvelle année ; `resolveSequentialNumber()` —
généralise le patron déjà en place pour les Achats). 5 nouveaux champs
`Settings.xNumberYear` (migration additive, `@default(2026)` — sans impact
tant que déployé en 2026, le compteur de chaque module continue exactement
où il en est). `createFulfillmentDelivery` extrait (était dupliqué
verbatim dans `projects/service.ts` et `rollings/service.ts`) — consolidé
puisque ce correctif obligeait de toute façon à modifier ces lignes.
`purchases/service.ts` intouché (déjà correct depuis le 14 août 2026,
déjà testé, zéro raison de le faire dépendre du nouveau fichier partagé).
Vérifié contre Postgres local (scénarios jetables : compteur avancé
simulé en 2026, appel avec `year=2027` explicite → reset à 1 confirmé ;
re-création en 2026 → continue le compteur existant) — aucune correction
de données réelles requise (migration purement additive, comportement
observable inchangé avant le 1er janvier 2027).

**Partie 2 — module Vente externe (`ExternalSale`)** : fenêtre contextuelle
avec lignes Description/Qté/Coût unitaire, marge globale unique (20 %
pré-rempli depuis `Settings.externalSaleDefaultMarginPct`, modifiable),
frais de transport + frais administratifs (montants fixes en $, **vides
par défaut, jamais 0 pré-rempli** — confirmé explicitement par
l'utilisatrice, 0 reste une saisie volontaire), numéro `VE-AAAA-NNNN` à
remise à zéro annuelle (Partie 1, pas le format 5 chiffres perpétuel des
Achats), accès complet Propriétaire/Direction/Administration seulement
(nouvelle fonction `canManageExternalSales`, roles.ts — Employé/Magasinier
exclus), conversion depuis une Demande client OU création indépendante,
sortie via les 4 modes de `fulfillment.ts` existants (jamais modifiés)
après un geste explicite « Marquer prêt à être livré ».

Chaque ligne de pièce devient automatiquement une `PurchaseRequest` liée
(`projectType==="sale"`, `categoryId` nul comme la liste rapide — jamais
de seuil déclenché) dans la même transaction que la vente. Le
sous-processus d'achat (approbation, commande, réception) reste le
mécanisme **existant, inchangé** (`canApprovePurchaseRequest`/
`canManagePurchaseFulfillment`) — confirmé explicitement avec
l'utilisatrice : « accès complet à égalité » ne couvre que les gestes
propres à l'entité Vente externe (créer, marquer prête à livrer,
choisir/confirmer la livraison), jamais ce sous-processus. Une ligne
rejetée est exclue du calcul « toutes reçues et appliquées » plutôt que
de bloquer la vente pour toujours (décision confirmée) — elle reste
comptée dans les totaux gelés à la création, jamais recalculés après
coup, même principe que partout ailleurs dans l'application.

Nouveau `packages/business-rules/src/external-sales.ts`
(`externalSaleLineAmount`/`externalSaleTotals`, réutilise `saleFromCost`
de `margin.ts`, jamais réimplémenté) + tests. `purchases/service.ts` :
nouvelle fonction parallèle `applyPurchaseRequestToExternalSale`
(jamais fusionnée avec `applyPurchaseRequestToProject`, même prudence
déjà démontrée ailleurs sur ce projet — moins de code partagé mais zéro
risque sur une route déjà en production) + DTO étendu
(`externalSaleId`/`externalSaleLabel`/`appliedToExternalSaleAt`, miroir
de `projectId`/`projectLabel`/`appliedToProjectAt`). Nouveau
`apps/api/src/modules/externalSales/` (service.ts + routes.ts, monté
après `rollingsRouter`).

Vérifié contre Postgres local via un script jetable
(`apps/api/scripts/tmp-verify-external-sales.ts`, supprimé après usage) :
VE directe (3 lignes) → totaux exacts, 3 `PurchaseRequest` créées ; VE
depuis une Demande client → `externalSaleId` posé + suppression bloquée ;
`markExternalSaleReadyToDeliver` refusé tant qu'il manque des lignes,
accepté une fois toutes reçues+appliquées ; ligne rejetée → exclue du
blocage ; les 4 modes de fulfillment, dont `WAREHOUSE` → `Delivery`
correcte (`type="sale"`, numéro `BL-AAAA-NNNN`). **Piège trouvé et
corrigé pendant cette vérification** : la toute première tentative a
échoué sur une collision de `displayId` (`DA-2026-00006` déjà pris) —
pas un bogue du nouveau code, mais 8 lignes `PurchaseRequest` orphelines
laissées dans ce Postgres local de longue durée par un ancien script
jetable du 14 août 2026 (jamais nettoyé), avec `Settings.
nextPurchaseRequestNumber` resté désynchronisé. Nettoyé (lignes
supprimées — confirmées orphelines : aucune référence dans `seed.ts`,
projet parent lui-même un compte de test seedé) avant de pouvoir
reproduire proprement — sert de rappel : toujours vérifier l'état réel
de la table avant de conclure à un bogue de logique quand une erreur de
contrainte unique survient sur ce Postgres local partagé entre sessions.

**Frontend** — nouveau `apps/web/src/features/externalSales/` (api.ts,
ExternalSalesPage/List/Form/Detail/Fulfillment.tsx), calqué sur les
patrons déjà en place (ProjectsPage/ProjectList pour la page+liste,
RollingForm pour le bloc contact, ProjectAmendments pour la fenêtre de
création avec totaux en direct, ProjectFulfillment pour la sortie).
Intégrations : nav.ts + App.tsx (nouvelle page `/ventes-externes`),
QuickAdd.tsx (nouvelle carte + next-number), ClientRequestOptionsMenu.tsx
(option « Convertir en vente », même patron que Roulement/Projet/Call),
`purchases/api.ts` (DTO étendu pour matcher le backend) et
`PurchaseRequestList.tsx`/`PurchaseRequestActionDrawer.tsx`/
`PurchaseFulfillmentActionDrawer.tsx` (colonne « Projet / Vente »,
`externalSaleLabel` en repli d'affichage quand `projectLabel` est nul).
**Petit oubli trouvé en construisant le frontend** : le DTO
`ExternalSaleDetailDto` côté serveur n'exposait pas
`fulfillmentConfirmationNote` (présent sur `Project`, absent ici) —
corrigé (ajout additif, aucun risque sur le comportement déjà vérifié).

`npm run typecheck && npm run lint && npm test && npm run build` verts
sur tout le monorepo après le lot complet (Partie 1 + Partie 2 backend et
frontend). **Limite assumée de cette vérification** : cette session n'a
aucun accès réseau au vrai projet Supabase (confirmé à nouveau
directement — `example.supabase.co` placeholder dans ce clone frais,
tunnel CONNECT refusé 403 par le proxy sortant) et `verifyAccessToken`
(apps/api/src/auth/supabase.ts) appelle réellement `supabase.auth.
getUser()`, donc ni la connexion via le navigateur ni la vérification des
requêtes API authentifiées ne peuvent fonctionner dans ce bac à sable —
aucun clic-à-travers réel possible ici, contrairement à d'habitude où
Playwright suffit. La logique métier reste vérifiée en profondeur
(Postgres local direct, sans passer par l'authentification), et tout le
nouveau code frontend réutilise des classes CSS déjà éprouvées (aucune
nouvelle règle visuelle inventée) — mais un test manuel réel par Marie
(ou une prochaine session avec accès réseau) reste requis avant de
considérer l'interface elle-même confirmée à l'usage.
