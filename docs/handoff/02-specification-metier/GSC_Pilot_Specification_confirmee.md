# GSC Pilot — Spécification confirmée

Ce document accumule les règles métier confirmées par toi, pour remplacer
progressivement « deviner à partir du code v19 » par une source de vérité
fiable avant de porter chaque module vers v01. Mis à jour au fil de la
conversation — pas figé.

**Construit dans v01 :** back-up d'heures + marge (`backup.js`/`margin.js`),
rôles et permissions (`roles.js`), statistiques internes
(`internal-stats.js`), facturation (`billing.js`), livraisons/roulements
(`fulfillment.js`), contacts (`contacts.js`), journal d'audit
(`audit-log.js`), sous-assemblages de conception (`subassembly.js`),
facturation (`billing.js`), avenants (`amendments.js`) — 166 tests au
total, tous verts.

---

## Identité visuelle (confirmé le 8 août 2026)
- v01 doit conserver la police, le visuel général et les couleurs de la
  v19 telles quelles — rien à réinventer sur ce plan.
- Jetons réels extraits du fichier v19 et documentés dans
  `design-tokens.js` : police Inter, thème clair, rouge de marque
  `#e30613` comme couleur d'action principale, rayons de 8-18px.
- **Note honnête** : les deux démos construites plus tôt (`index.html`,
  `roles-demo.html`) utilisent une palette différente choisie avant cette
  confirmation. Elles restent valides pour la logique qu'elles prouvent;
  leur habillage visuel n'est pas représentatif de la vraie v01.

## Facturation — mécanisme réel (découvert le 8 août 2026)
- **Ce n'est pas un générateur de factures — c'est un suivi manuel,
  permanent.** « La facture est créée dans Sage; l'application conserve le
  suivi administratif. » Permanent par choix, pour ne pas alourdir
  l'application — aucune intégration Sage prévue.
- **Workflow confirmé, et déjà bien construit dans la v19** : Direction
  clique « Demander la facturation » sur un jalon → notification dans le
  centre d'actions d'Administration → Administration « Traite » la demande
  et crée l'entrée → l'entrée entre dans le suivi. Chaque jalon garde son
  propre lien vers sa facture (`step.invoice`) — le rapprochement
  jalon/facture n'est **pas** à la mémoire de Direction, c'est déjà tracké.
  Ce mécanisme s'applique aussi automatiquement aux appels de service et
  aux roulements prêts à facturer, pas seulement aux projets.
- Répartition par défaut : 25 % signature / 25 % après conception / 40 % à
  la livraison / 10 % 30 jours après livraison. Modifiable aux Paramètres
  et à la création d'un projet. Montants calculés en $ à partir du prix
  vendu (ex. projet à 1 000 $ → 250 $ / 250 $ / 400 $ / 100 $).
- Numéro de facture saisi manuellement (reflète Sage).
- **Direction et Administration peuvent toutes les deux créer une facture
  et enregistrer un paiement** — confirmé le 8 août 2026 : reflète la
  façon dont l'équipe travaille en pratique, pas une restriction stricte.
  Seul le Propriétaire en est exclu. Le comportement de la v19 était donc
  correct sur ce point; « Demander la facturation » (vers le centre
  d'actions d'Administration) reste Direction seulement.
- Mise en suspens : raisons typiques = litige, attente d'un changement.
  Direction seulement. *Confirmé.*
- **Écart trouvé et corrigé le 9 août 2026** : le bouton « Mettre en
  suspens » n'avait aucune restriction de rôle — Administration pouvait
  l'utiliser autant que Direction. **Corrigé** à deux endroits (le bouton
  lui-même, et un blocage ajouté à la soumission pour Administration —
  même mécanisme défense en profondeur déjà en place pour le
  Propriétaire). Vérifié par lecture du code et par les auto-tests
  intégrés (8/8) — je n'ai pas réussi à obtenir une confirmation par clic
  réel jusqu'au bout pour celui-ci (problème technique de mon test, pas
  un doute sur le correctif lui-même).

## Facturation — extras hors cycle standard (confirmé le 8 août 2026)
- Cas réel : la section Installation du budgétaire prévoit des heures
  (ex. 20 h), mais l'exécution réelle en consomme plus (ex. 30 h) → une
  5e facture doit pouvoir être demandée pour les 10 h supplémentaires, au
  taux d'installation du budgétaire.
- **Approche approuvée** : réutiliser le mécanisme déjà confirmé plutôt
  qu'en inventer un nouveau — ajouter une entrée supplémentaire dans
  `invoicePlan` (même structure que les 4 jalons standards) quand les
  heures Installation réellement punchées dépassent les heures planifiées
  du budgétaire, montant suggéré = heures en trop × taux d'installation.
  Direction la demande, Administration la traite — même flux que les 4
  autres jalons. Détection automatique, comme les autres demandes
  automatiques déjà présentes dans la v19.

## Livraisons et roulements — précisions (corrigé le 8 août, patch appliqué le 9 août 2026)
- **Deux étapes séparées, pas une** : marquer la production complétée =
  Direction seulement (le Propriétaire ne s'occupe pas de ça). Choisir le
  mode de sortie une fois la production complétée = Direction et
  Administration. La présence du Propriétaire dans le code pour cette
  deuxième étape était un oubli, pas une règle voulue.
- **Écart trouvé en vérifiant la vraie v19 (9 août)** : comme pour le
  Budgétaire, ce correctif n'avait jamais été appliqué — `boss` était
  toujours dans la porte d'accès de base (`v09FulfillmentActions`).
  **Corrigé** — voir `GSC_Pilot_Prototype_v19_corrections.html` (même
  fichier que le correctif Budgétaire, les deux s'accumulent). Vérifié par
  lecture directe de la fonction (une seule définition, aucun risque de
  version fantôme) et par les auto-tests intégrés (8/8, aucune régression)
  — pas testé par clic réel jusqu'au bout comme le Budgétaire, la logique
  étant plus simple (un seul rôle retiré d'un tableau).
- **4e mode de sortie confirmé : Installation.** En plus de Bon de
  livraison/magasinier, tiers, et ramassage client — un vrai cas, utilisé
  quand la section Installation du budgétaire est remplie parce que GSC
  fait l'installation chez le client elle-même.
- **Confirmer un ramassage ou une livraison par tiers : Direction et
  Administration seulement** (déjà comment `canChooseFulfillmentMode` est
  codé — confirmé, aucun changement requis). Le Magasinier ne remet la
  marchandise en main propre que lorsque c'est lui qui livre (mode Bon de
  livraison) — jamais pour un ramassage ou une livraison par tiers.
- **Point important pour ce mode** : le sélectionner ne doit **pas**
  fermer/compléter le projet — les heures et achats d'installation
  continuent de s'accumuler après ce choix et doivent rester
  comptabilisables normalement. La fermeture d'un projet reste une action
  manuelle séparée (bouton dédié dans la v19), jamais un effet de bord du
  choix de mode de sortie.

## Rapports, Contacts, Tableau de bord, notifications, QR (8 août 2026)
- **QR code** : étiquette 1×1 po par projet, scannable (caméra) ou saisie
  manuelle. Employé → ouvre le choix de tâche à puncher; Direction/
  Administration → ouvre la fiche projet et ses achats. Compris, aucune
  question — fonctionne déjà bien telle quelle.
- **Pas de système de notifications séparé** : le « centre d'actions »
  (déjà vu pour les demandes de budgétaire et de facturation) est le seul
  mécanisme — pas de infolettres/push à modéliser en plus.
- **Rapports** : tableau comparatif de rentabilité (revenu, coût, marge,
  heures réelles) entre projets, roulements et calls de service, plus un
  graphique de conversion par canal de vente. Agrège des données déjà
  confirmées ailleurs — pas de nouvelle règle métier à trancher.
- **Contacts** : carnet d'adresses simple (client/fournisseur, catégories
  d'achat). Pas d'ambiguïté.
- **Tableau de bord** : vue de synthèse personnalisée par utilisateur.
- **Deux points confirmés (8 août 2026)** :
  1. « Interne — Amélioration GSC » = tout ce qui est non punchable sur un
     projet : formation, réparations internes, ménage, organisation, etc.
     Objectif : suivre le coût annuel total des catégories non
     facturables (vue de type centre de coûts). **Confirmé le 8 août :
     heures et achats internes doivent tous les deux être visibles, mais
     comme deux totaux séparés — jamais mélangés — avec la même logique
     par année pour les deux.** Construit dans `internal-stats.js`
     (`internalHoursSummary` / `internalPurchasesSummary`), 6 tests verts.
     Lacune trouvée et maintenant corrigée : la v19 ne totalisait que les
     heures internes; les achats « Interne GSC » étaient approuvés mais
     jamais additionnés nulle part.
  2. Canaux de vente : configurables/ajoutables par Direction seulement.
     Reste généralement fixe une fois à jour, mais doit rester extensible
     (ex. une nouvelle plateforme de prospection à l'avenir).

## Déploiement réel — exigences confirmées (8 août 2026)
**Change fondamentalement l'architecture de v01, pas la logique métier déjà construite.**
- Deux clients prévus : application ordinateur + application Android
  (Google Play).
- Tout doit être central, synchronisé et enregistré — pas un stockage par
  appareil comme le prototype actuel.
- Sécuritaire, stable, pensé pour une utilisation sur une très longue période.
- En production : chaque rôle doit être verrouillé à sa propre vue, sans
  pouvoir naviguer vers les autres — pas juste caché, réellement bloqué
  (le prototype actuel permet la navigation libre entre vues pour faciliter
  les tests).
- 4 employés actuellement, appelé à augmenter avec les années — échelle
  modeste, pas un enjeu de dimensionnement massif.
- **Hors ligne indispensable** : les employés doivent pouvoir travailler
  sans connexion (ex. installation chez un client) et se synchroniser au
  retour du réseau. Exigence ferme, pas une préférence.
- Application ordinateur : pas encore tranché entre une vraie appli
  installée ou un site web qui fonctionne très bien — voir recommandation
  ci-dessous, liée directement à l'exigence hors ligne.

## Projets — création directe (confirmé et corrigé le 9 août 2026)
- Qui peut créer un projet directement (hors conversion d'un
  budgétaire) : **Direction et Propriétaire seulement.**
- Le code n'avait aucune restriction — le bouton et l'action étaient
  ouverts à tous. **Corrigé** : bouton conditionnel + blocage à la
  soumission (même patron que les autres correctifs). Vérifié par rendu
  réel pour les 3 rôles, auto-tests 8/8.

## Suivi budgétaire (confirmé et corrigé le 9 août 2026)
- Marquer une soumission « envoyée » et « Contrat obtenu » : Direction
  seulement, le Propriétaire n'y est pas impliqué. *Confirmé voulu.*
- **Trouvaille dans les Rapports, corrigée** : le calcul des achats d'un
  appel de service utilisait une approximation (125 $ par pièce, peu
  importe son coût réel) au lieu du vrai coût. Mécanisme réel confirmé :
  l'employé écrit le détail de l'article en texte libre, la Direction
  ajoute ensuite le coût réel et le prix de vente au moment de tarifer.
  Tant qu'une pièce n'est pas tarifée, elle compte pour 0 $ et se met à
  jour automatiquement dès que la Direction entre le prix — pas de logique
  spéciale nécessaire, le remplacement par la fonction déjà existante
  (`v06ServicePartsCost`) donne exactement ce comportement. Auto-tests 8/8.

## Contacts — synchronisation automatique (confirmé et corrigé le 9 août 2026)
- Chaque nouvelle demande client, nouveau projet ou nouveau roulement où
  un client est inscrit doit s'enregistrer automatiquement dans le
  carnet de contacts, sans créer de doublon.
- **Trouvaille** : le mécanisme (`ensureClientContact`) existait déjà et
  fonctionne très bien — il déduplique par courriel ou par nom, fusionne
  les nouvelles informations dans un contact existant plutôt que d'en
  créer un autre, et ajoute la bonne catégorie (Projet/Roulement/Service/
  Information) à chaque contact. Mais il n'était branché que sur la
  création d'une demande client — jamais sur la création directe d'un
  projet ou d'un roulement, même si ces deux formulaires exigent un nom
  de client. **Corrigé** aux deux endroits, en réutilisant la fonction
  déjà existante. Vérifié avec de vraies soumissions de formulaire (pas
  juste des appels internes) : un projet crée le contact avec la
  catégorie « Projet »; un roulement pour le même nom enrichit le même
  contact avec « Roulement » plutôt que d'en créer un deuxième. Auto-tests
  8/8.

- Le plan de facturation doit **toujours** totaliser exactement 100 % —
  aucune exception, aucun avertissement : `computeBillingPlan` bloque
  (erreur) plutôt que d'avertir si ce n'est pas le cas. *Confirmé le
  9 août 2026.*

## Modèle de budgétaire — tâches modifiables (confirmé et construit le 9 août 2026)
- **Cause racine du bouton manquant, résolue** : la fonction active de
  rendu des sections (`vs`) avait abandonné le système `allowRows` pour
  gérer l'ajout/retrait de lignes seulement sur les sections d'achats —
  les 5 catégories de main-d'œuvre (Conception, Fabrication,
  Programmation, Assemblage, Installation) n'avaient plus aucun moyen
  d'ajouter une ligne, même Fabrication. Mon premier correctif ciblait du
  code superseded.
- **Confirmé et construit** : ajout/retrait de tâche et renommage d'une
  tâche verrouillée — **seulement dans le modèle de budgétaire**
  (Paramètres → Direction), **jamais** sur un budgétaire de projet
  existant. Non rétroactif — un renommage s'applique seulement aux
  futurs budgétaires créés après le changement; les projets en cours
  gardent l'ancien nom, cohérent avec le principe des taux gelés déjà
  établi. Le mécanisme de propagation (modèle sauvegardé → appliqué
  automatiquement à tout nouveau budgétaire) existait déjà et fonctionne
  correctement — rien à construire de ce côté.
- **Taux horaire du back-up déplacé** : retiré de Paramètres, maintenant
  dans la carte back-up du modèle de budgétaire lui-même, sauvegardé en
  même temps que le reste du modèle.
- Vérifié avec de vraies interactions (pas juste des appels internes) :
  clic réel sur « Ajouter une ligne » pour Conception (4→5 lignes), champ
  de nom de tâche confirmé non-readonly en mode modèle, changement de
  taux (112$→130$) confirmé sauvegardé après clic sur « Enregistrer »,
  et confirmation qu'un budgétaire de projet normal n'affiche ni le
  bouton ni le champ de taux. Auto-tests 8/8.

## Paramètres — sections restantes vérifiées (9 août 2026)
- **Sauvegardes locales** : restauration déjà bien gardée (Direction
  seulement, sauvegarde de sécurité automatique avant restauration,
  journalisée). **Petit écart corrigé** : la réinitialisation complète des
  données locales n'avait pas de vérification explicite de rôle (protégée
  seulement par la confirmation à taper et l'accès à la carte) — ajoutée
  pour la cohérence avec le reste. Auto-tests 8/8.
- **Corbeille de 90 jours** : déjà bien gardée (Direction seulement),
  empêche un doublon si un numéro existe déjà, journalisée. Rien à
  corriger.
- **Tâches punchables par catégorie** et **modèles d'export PDF** : déjà
  bien gardés (Direction seulement, à la fois pour l'affichage et la
  soumission). Le choix du modèle PDF à utiliser pour un export
  spécifique n'a pas de garde propre, mais c'est sans conséquence — accès
  à Paramètres est déjà Direction seulement, donc personne d'autre ne
  peut même l'atteindre.

## Photos (appels de service) — confirmé le 8 août 2026
- Pas utilisées durant la période de test (aucune photo envoyée).
- **Doivent rester accessibles dans le Post-mortem du call de service au
  déploiement** — pas juste pendant le call actif. Cohérent avec
  l'exigence de données centrales déjà confirmée : vivront dans le
  backend central, pas dans un stockage local par appareil.
- Après approbation : employé en lecture seule; Direction peut ajuster,
  avec historique conservé. *Confirmé.*

## Appels de service — flux complet (vérifié le 9 août 2026)
- Cycle confirmé : résumé obligatoire → signature client → approbation
  Direction → envoi à Administration pour facturation — cohérent avec le
  mécanisme de facturation déjà confirmé (Direction demande, Administration
  traite).
- **Écart trouvé et corrigé** : « Approuver » et « Envoyer à
  l'administration » n'avaient aucune vérification de rôle — n'importe
  qui pouvait déclencher ces deux actions, alors qu'elles touchent
  directement la file de facturation (Direction seulement, comme
  confirmé pour `canRequestInvoice`). **Corrigé** aux deux endroits.
  Vérifié par un vrai clic simulé pour Administration et Direction; auto-
  tests 8/8.

- **Confirmé pour le déploiement (9 août 2026)** : l'envoi du courriel au
  client (déclenché à l'approbation) ne fonctionne pas dans ce prototype
  sans serveur — normal, cohérent avec le besoin de backend déjà établi.
  Au déploiement réel, l'envoi doit être fonctionnel, et le visuel de ce
  qui est envoyé au client doit être peaufiné (plus soigné qu'actuellement).

## Punchs liés à un appel de service
- La fenêtre d'approbation d'un punch doit afficher par défaut l'appel de
  service qui était sélectionné au moment du punch, et conserver cette
  valeur par défaut à l'approbation — pour éviter les réaffectations par
  erreur. *Confirmé (correspond à CALL-01/CALL-02, déjà vérifié dans la v19).*
- Réaffectation volontaire d'un punch : doit être journalisée (ancien
  dossier, nouveau dossier, personne, date/heure). Justification **non**
  obligatoire. *Confirmé.*

## Post-mortem
- Bloc « Réserves budgétaires » distinct des catégories opérationnelles et
  des achats. *Confirmé — sera revérifié manuellement par toi au lancement
  de v01.*

## Statistiques Interne
- Permissions actuelles conservées, aucun nouveau rôle. *Confirmé.*

## Achats
- Déduplication toujours par référence stable, jamais par montant ou texte
  seul. *Confirmé.*

## Budgétaire — création (corrigé le 8 août 2026, patch appliqué le 9 août)
- Qui peut créer un budgétaire à partir d'une demande client : **Direction
  et Propriétaire**, tous les deux sans condition — la transmission par la
  Direction n'est **pas** une porte de permission.
- La « transmission » est un mécanisme séparé : elle fait apparaître la
  demande dans le centre d'actions du Propriétaire (visibilité/priorité),
  et reste nécessaire pour ça — mais n'empêche pas le Propriétaire de créer
  un budgétaire sur une demande non transmise s'il le fait lui-même.
  *Corrige la première réponse donnée plus tôt dans ce fil.*
- **Écart trouvé en vérifiant la vraie v19 (9 août)** : le code n'avait
  jamais été corrigé — `canCreateBudgetForRequest` exigeait encore
  `request.assignedPersona === "boss"`, ET une deuxième copie indépendante
  de la même règle existait dans le gestionnaire de clic (jamais reliée à
  la première fonction). **Corrigé dans les deux endroits** — voir
  `GSC_Pilot_Prototype_v19_correctif1_budgetaire.html`. Vérifié avec un
  vrai clic simulé (pas juste une lecture du code) : le Propriétaire crée
  maintenant un budgétaire sur une demande non transmise, de bout en
  bout, sans régression sur les auto-tests intégrés.

## Avenants (changements de commande) — vérifié le 9 août 2026
- Création verrouillée à Direction seulement — déjà correct.
- Le budgétaire original reste intact; un avenant s'additionne au projet
  (heures, coût, prix vendu) sans jamais recalculer l'historique.
- Le cycle de facturation se recalcule automatiquement sur le nouveau
  prix vendu total, avec les mêmes pourcentages — exactement la logique
  de `billing.js`.
- Taux internes par catégorie (ex. 117 $/h Panneau et programmation,
  112 $/h Fabrication et Assemblage) — pas un taux unique, confirmé par
  test réel.
- **Écart trouvé et corrigé le 9 août 2026** : le calcul du back-up d'un
  avenant utilisait ses propres catégories admissibles, indépendantes du
  calcul principal déjà corrigé — `["conception", "fabrication",
  "panel_programming"]`, donc Conception incluse à tort et Assemblage/
  tests manquant. Exactement la même erreur que le tout premier bug de ce
  fil (AM Installation), dans une deuxième implémentation jamais
  vérifiée. **Corrigé** : `["fabrication", "panel_programming",
  "assembly_test"]`. Vérifié par une vraie soumission du formulaire
  d'avenant (avec gestion du dialogue de confirmation) : 51,60 h de
  back-up exactement, Conception et Installation exclues même avec 999h
  chacune injectées. Auto-tests 8/8.

- **Deuxième écart trouvé et corrigé le 9 août 2026** : le coût du back-up
  d'un avenant utilisait une moyenne pondérée des taux internes par
  catégorie plutôt que le taux gelé du projet — confirmé que ça devait
  être le second, pas le premier. **Corrigé**, en utilisant
  `project.baseBudget.backupHourlyRate` (avec repli sur
  coût/heures ou le taux des Paramètres si absent). Vérifié avec un
  scénario délibérément piégé (taux Paramètres à 120$, taux gelé du
  projet à 112$) : le résultat utilise bien 112$, pas 120$. Auto-tests
  8/8.
- **Ancien bug « AV-Fabrication » (catégorie séparée) vérifié le 9 août
  2026 : déjà résolu dans la v19 active**, par deux mécanismes
  indépendants qui se recoupent — le regroupement du Gantt par alias, et
  la fonction de catégorisation de la vue projet (`v05ProjectCategoryKey`),
  qui reconnaît un texte contenant « fabrication » peu importe le nom
  exact. Rien à corriger ici.

## Back-up d'heures — confirmé au complet (7 août 2026)
- **Catégories exclues, définitivement tranché : Conception ET Installation**
  (la section du budgétaire). « Livraison » dans une réponse précédente
  était un raccourci de langage pour Installation — pas une 3e catégorie.
  Exemple donné pour trancher : 100 h dans Fab+Prog+Assemblage, 30 h en
  Conception, 30 h dans la section Installation → back-up = 10 h (pas 16 h).
- Le back-up est une **réserve d'heures pour le projet**, calculée par
  défaut à 10 % (modifiable) de Fabrication + Programmation + Assemblage
  seulement. *Formule et gel du taux historique déjà vérifiés avec des
  chiffres réels dans ce fil.*
- **Le back-up a aussi une valeur de vente**, distincte du coût avant marge :
  un niveau de complexité (0 à 10) détermine la marge appliquée. Exemple :
  10 h à 112 $/h = 1 120 $ avant marge; cette valeur (avant marge) doit
  apparaître dans le résumé du projet.
- **Règle générale, pas juste pour le back-up** : chaque catégorie du
  budgétaire affiche sa valeur avant marge dans la vue projet; la
  complexité affecte seulement le prix de vente.
- **Fiabilité exigée** : la création d'un budgétaire doit être fiable à
  100 % pour déterminer le prix de vente d'un projet; la vue projet doit
  être fiable à 100 % pour déterminer la marge réelle. *(Intégré et testé
  dans v01 — voir backup.js/margin.js, `node test.js`.)*

## Section Installation (budgétaire)
- Section complète (heures + frais punchables, chargés au client), presque
  jamais pertinente pour le magasinier.
- Sur AM Installation spécifiquement : aucune donnée saisie dans cette
  section puisque le client s'occupait lui-même de l'installation.
- Sur de futurs projets où GSC fait l'installation chez le client : la
  section doit rester punchable et calculable avec les achats, comme
  n'importe quelle autre section. *Confirmé.*

## Roulements
- Proviennent en général d'une demande client, mais doivent aussi pouvoir
  être créés directement.
- Cycle de facturation par défaut : un seul paiement.
- Fin de production → génération de la livraison, avec 3 options :
  1. **Bon de livraison** — assigné au magasinier.
  2. **Livraison par un tiers** — aucune action requise après (bon de
     livraison papier maison créé séparément).
  3. **Ramassage par le client** — aucune action requise.
- Dans les 3 cas, la livraison termine le roulement → statut « Terminé » →
  apparaît au Post-mortem. *Confirmé.*
- **Écart trouvé et corrigé le 9 août 2026** : création directe d'un
  roulement — confirmé Direction et Propriétaire. Le code avait
  `["owner", "admin"]` à six endroits (l'item de navigation lui-même, le
  bouton d'en-tête de la page, et le menu de création rapide à 5 endroits
  différents) — donc le Propriétaire ne pouvait même pas ouvrir la page
  Roulements, et Administration pouvait créer directement alors qu'elle ne
  devrait pas. **Corrigé** : Administration garde l'accès à la page (pour
  gérer les roulements issus de demandes clients qu'elle traite), mais ne
  voit plus le bouton de création; Propriétaire a maintenant accès à la
  page et au bouton. Vérifié par rendu réel pour les 3 rôles, auto-tests
  intégrés toujours 8/8.

## Facturation
- Répartition par défaut : 25 % signature du contrat / 25 % après
  conception / 40 % à la livraison / 10 % 30 jours après livraison.
- Modifiable dans les Paramètres Direction (change le défaut global) **et**
  modifiable à la création d'un projet ou à la conversion d'une demande en
  projet (override par projet). Exemple réel donné : un projet en cours à
  30 % après conception / 70 % à la livraison. *Confirmé.*

## Employés — niveau technique / efficacité
- L'efficacité (ex. Mathieu à 50 % en usinage, formation incomplète)
  **n'affecte que le Gantt** : une tâche planifiée à 20 h réelles s'étire à
  40 h de calendrier si l'employé assigné est à 50 % d'efficacité sur cette
  compétence.
- **Ne touche jamais** le budgétaire, le solde d'heures ni le Post-mortem.
- Un punch reste compté pour sa valeur réelle (3 h punchées = 3 h
  comptabilisées), peu importe l'efficacité de l'employé. *Confirmé.*

## Gantt / Planification
- **Édition des affectations/dépendances — confirmé et corrigé le
  9 août 2026** : Direction seulement peut modifier (employés,
  dépendances, dérogations de compétence). Administration et Propriétaire
  ont un accès visuel seulement. Le code laissait Administration éditer
  librement (aucune vérification malgré un texte suggérant que la
  dérogation « exige une justification de la Direction »), et le
  Propriétaire n'avait même pas accès à la page. **Corrigé** aux trois
  endroits (rôles de navigation, ouverture de l'éditeur, sauvegarde) —
  défense en profondeur comme les autres correctifs. Vérifié : rendu réel
  pour le Propriétaire (page accessible), auto-tests 8/8.
- Dépendances très variables d'un projet à l'autre; toutes les tâches de
  programmation dépendent d'un seul employé (Yannick, seul programmeur) —
  contrainte structurelle stable, bien comprise, pas le vrai problème.
- **Le moteur de planification automatique déjà construit dans la v19 est
  sophistiqué** (horizon dynamique, capacité/utilisation par employé,
  semaine québécoise lun-jeu 8,5h/ven 4h, jours fériés, interruptions
  planifiables, priorité automatique des roulements) — jamais pleinement
  testé en conditions réelles, pas parce qu'il serait brisé.
- **La vraie source de difficulté identifiée (9 août 2026)** : Marc, seul
  designer (conception), avance de façon imprévisible d'un sous-assemblage
  à l'autre selon son propre jugement — pas un bug logiciel, une réalité
  humaine. Comme rien en aval ne peut avancer sans la conception, cette
  imprévisibilité déstabilise tout le calendrier de production en cascade.
- **Cas Yannick vérifié (9 août 2026)** : le moteur existant gère déjà
  bien ce genre de goulot d'étranglement à une seule personne qualifiée —
  chaque jour, les tâches admissibles sont triées par priorité puis
  échéance, et la capacité de l'employé se consomme dans cet ordre. Rien
  à corriger ici, juste une vérification générale, confirmée.
- **Principe général confirmé (9 août 2026), pas limité à Installation** :
  quand le temps réel d'une tâche dépasse le temps planifié, la tâche ne
  doit jamais se fermer automatiquement. La fermeture doit rester un
  geste explicite, jamais une conséquence des heures consommées. Le
  moteur existant distingue déjà une date de complétion *prédite* par le
  calcul (utilisée seulement pour enchaîner les tâches dépendantes) d'une
  complétion *réelle* explicitement marquée (`ganttCompleted`) — cette
  distinction correspond à ce qui est demandé, à confirmer plus en détail
  si on construit cette partie.
- **Direction de conception retenue** : ne pas essayer de prédire l'ordre
  de Marc. Un mini Gantt séparé pour la conception, détaché du calendrier
  de production. Marc déclare un sous-assemblage prêt (un seul geste, le
  numéro qu'il utilise déjà dans sa propre logique d'ingénierie — ex.
  « 08 » — aucune description requise) au moment où c'est réellement prêt,
  jamais d'avance. Ça atterrit dans le centre d'actions de la Direction
  (même mécanisme que budgétaire/facturation); une fois la liste de
  pièces créée par la Direction, ce sous-assemblage devient planifiable
  dans le vrai Gantt de production, pendant que Marc continue sur autre
  chose, dans n'importe quel ordre. Numérotation : celle que Marc utilise
  déjà, jamais générée par le système — format confirmé : « 01-000,
  02-000, 03-000... ». Traité comme texte libre par le code, sans le
  parser ni le valider — aucun changement requis si le format varie.
- Construit dans v01 (`subassembly.js`) : déclaration, création de la
  liste de pièces avec heures réelles par catégorie (jamais un % deviné
  d'avance — le budget global du projet reste la référence cumulative,
  les extras se traitent comme ceux déjà construits pour la facturation),
  génération des tâches Gantt, historique du designer. **Boucle fermée le
  9 août 2026** : chaque sous-catégorie de fabrication (plasma, pliage,
  usinage, soudage — reconnues par le préfixe « fabrication- ») devient
  plannifiable immédiatement une fois la liste de pièces prête.
  Programmation se divise en deux moitiés égales quand elle s'applique :
  la première débloquée en même temps que la fabrication, la seconde
  seulement une fois **toutes** les sous-catégories de fabrication de ce
  sous-assemblage marquées complétées — jamais une seule en particulier.
  **Précisé le même jour, puis retiré** : j'avais d'abord fait attendre
  l'Assemblage sur la fabrication au complet — confirmé incorrect.
  L'Assemblage dépend de pièces spécifiques, pas d'une proportion ou d'un
  compte de sous-catégories complétées (ex. 100h de fabrication réparties
  en 5 sous-catégories de 20h; l'assemblage peut commencer une fois
  certaines pièces prêtes, pas nécessairement toutes) — impossible à
  calculer, comme le problème de Marc. **Résolu le 9 août 2026** : même
  famille de solution que Marc — Direction (toi) déclare directement
  « l'assemblage peut commencer », un geste explicite plutôt qu'une règle
  calculée. Tant que ce n'est pas déclaré, la tâche d'assemblage
  n'existe même pas dans le Gantt — les heures existent déjà (données à
  la création de la liste de pièces), mais rien n'est plannifiable avant
  le geste de Direction. 31 tests, tous verts.

- **Interruptions (temps mort employé/atelier) — même principe, corrigé le
  9 août 2026** : modifie directement la capacité et recalcule le Gantt,
  donc Direction seulement, comme l'édition. Corrigé à la fois à la
  soumission et au bouton lui-même (retiré pour Administration et
  Propriétaire) — vérifié par rendu réel pour les 3 rôles.

## Délégation d'approbation
- Fonction demandée par toi : couvrir les approbations lors d'une absence
  de plusieurs jours/semaines de la Direction.
- Déjà implémentée dans la v19, plus complète qu'il n'y paraissait au
  premier regard : déléguée à Propriétaire ou Administration, limite
  monétaire optionnelle, date de début/fin, 4 catégories cochables (Heures,
  Achats, Appels de service, Modifications), justification obligatoire.
- *Confirmé fonctionnel, y compris la catégorie « Modifications » (voir
  plus bas — délibérément décochée par défaut).*
- **Bug trouvé et corrigé le 9 août 2026 : la section était introuvable
  dans les Paramètres.** Cause : la page Paramètres (`Gs`) a été
  réécrite/réorganisée 13 fois au fil des versions; la carte « Délégation
  temporaire » n'existait que dans la toute première version d'origine et
  n'a jamais été reportée dans aucune des 13 réécritures suivantes — un
  cas classique de fonctionnalité orpheline. Toute la logique sous-jacente
  (formulaire, activation, révocation, vérification par catégorie) était
  restée intacte et fonctionnelle, seul le bouton pour y accéder avait
  disparu. **Corrigé** en ajoutant la carte à la fin de la page active,
  suivant exactement le même patron déjà utilisé dans le code pour la
  carte des canaux de vente. Vérifié par un vrai clic : le bouton
  « Configurer » ouvre maintenant le formulaire réel. Auto-tests 8/8.

## Principe général — visibilité financière (7 août 2026)
**Règle transversale, s'applique à toute l'application** : Employé et
Magasinier ne doivent jamais voir de taux horaire, montant, ou valeur
monétaire — projet, roulement, appel de service, ou autre. Pas seulement
pour les achats : c'est une règle générale de conception, à vérifier dans
chaque vue lors du portage vers v01.

## Permissions (5 rôles × actions) — confirmé le 7 août 2026

**Achats**
- Il existe **deux mécanismes distincts**, ce qui explique la contradiction
  relevée plus tôt :
  1. **Achats directs affectés à un projet** (saisis par Direction ou
     Administration, `project.purchaseEntries`) : approbation Direction
     seulement, **jamais** de double autorisation du Propriétaire, peu
     importe le montant.
  2. **Demandes d'achat** (`r.purchases`, mécanisme séparé) : soumises à un
     seuil monétaire par catégorie qui, au-delà, ajoute l'approbation du
     Propriétaire (`boss_pending`).
  *Confirmé — les deux règles sont vraies, chacune pour son propre
  mécanisme.*
- Administration saisit (les deux mécanismes), ne peut jamais approuver
  elle-même. *Confirmé.*
- Seuils par catégorie (demandes d'achat) déjà bien réglés, doivent rester
  modifiables par Direction seulement. *Confirmé.*
- Achat rejeté par le Propriétaire : final, pas de re-soumission. *Confirmé.*
- Employé/Magasinier ne voient que leurs propres demandes d'achat. *Confirmé.*

**Appels de service**
- Technicien ne voit jamais de prix, même après signature client. *Confirmé.*
- **Direction, Administration et Propriétaire** voient tous les prix/coûts
  internes. *Confirmé le 8 août 2026 (complète ce qui manquait).*
- Seule la Direction fixe le prix des pièces (jamais Administration). *Confirmé.*
- Réattribution d'un call : Direction et Administration seulement. *Confirmé.*
- Magasinier : aucun rôle, hors de sa portée. *Confirmé.*

**Budgétaire**
- Création : Direction et Propriétaire, tous les deux sans condition (voir
  plus haut — corrigé).
- Modification avant envoi au client : Direction seulement, jamais
  Administration. *Confirmé.*
- Marquer prêt / approuver pour envoi : Propriétaire et Direction. *Confirmé.*
- Employé et Magasinier : aucun accès, jamais. *Confirmé.*

**Délégation**
- Seule la Direction peut mettre en place une délégation. Elle délègue à
  Propriétaire ou Administration seulement — jamais à Employé ou
  Magasinier. *Confirmé le 8 août 2026.*

**Punchs et temps**
- Approbation : Direction seulement. *Confirmé.*
- L'employé peut modifier son propre punch après soumission mais avant
  approbation, en cas d'erreur. *Confirmé.*

**Livraisons**
- Marquer la production terminée / générer la livraison : Direction et
  Administration seulement. *Confirmé.*

**Roulements**
- Création directe (hors demande client) : Direction et Propriétaire. *Confirmé.*

**Paramètres**
- Direction seulement, sans exception — Administration, Propriétaire,
  Employé et Magasinier n'y ont aucun accès. *Confirmé, et expliqué : le
  menu de navigation restreint l'accès à `["owner"]` depuis la v0.8,
  reconfirmé identiquement en v0.9 et v0.10 — Administration ne peut
  jamais charger la page, peu importe ce qu'affiche son contenu.*
- Le taux horaire d'un employé n'a qu'un seul chemin d'écriture dans tout
  le fichier (le formulaire de la page Paramètres) — aucune autre porte
  d'entrée trouvée nulle part ailleurs dans l'application.
- **Point cosmétique, sans risque réel** : à l'intérieur de la page
  elle-même, le bloc de gestion des employés porte encore l'étiquette
  « Direction et Administration » — un reste non nettoyé d'avant le
  verrouillage en v0.8. Administration ne voit jamais ce texte puisqu'elle
  ne peut pas accéder à la page. À corriger pour la clarté du code, pas
  pour la sécurité.

**Facturation**
- Modification du cycle de facturation d'un projet après création : Direction. *Confirmé.*

**Tableau de bord / Rapports / Contacts**
- Administration, Direction et Propriétaire : accès complet, aucune
  restriction. *Confirmé (Employé/Magasinier non couverts explicitement,
  mais cohérent avec le principe de visibilité financière ci-dessus).*

---

## Questions encore ouvertes
Aucune pour l'instant — le point des photos est réglé (voir plus haut).

## Note mineure (8 août 2026)
Le sélecteur de vue de test dans la v19 de ChatGPT affiche un nom — pas
nécessaire à reporter dans v01.

## Résolu depuis (7-8 août 2026)
- Back-up d'heures : catégories exclues = Conception et Installation,
  confirmé sans ambiguïté.
- Punch de test corrompu (OPEN-03) : sans importance, données de test
  seront effacées au complet avant le déploiement réel.
- Seuils d'achat : deux mécanismes distincts (achats directs de projet
  vs demandes d'achat), pas une contradiction — voir Permissions.
- Accès aux Paramètres : owner seulement, confirmé et expliqué (verrouillé
  au niveau navigation depuis v0.8) — badge « Direction et Administration »
  à l'intérieur de la page est cosmétique, sans impact réel.

## Achats — liste rapide de projet (nouveau mécanisme, confirmé le 12 août 2026)
Troisième mécanisme d'achat, distinct des deux déjà confirmés (achats
directs de projet, demandes d'achat à seuil) — répond à un besoin réel :
le Propriétaire (Marc, aussi le seul designer/conception) a besoin de
transmettre rapidement les articles précis identifiés pendant la
conception d'un projet, sans remplir le formulaire complet pensé pour
Administration.

- **Qui peut soumettre** : Propriétaire et Direction seulement — permission
  dédiée (`canCreatePurchaseShortlist`), volontairement séparée de la
  permission générale de soumettre une demande d'achat (ouverte à tous).
  Sans cette séparation, n'importe qui pourrait soumettre sans catégorie
  pour contourner le seuil d'approbation du Propriétaire.
- **Formulaire** : un projet obligatoire en haut (s'applique à toutes les
  lignes de la soumission — chaque achat se comptabilise au bon projet),
  puis plusieurs lignes (au moins 5-6 de base, extensible). Par ligne :
  description/numéro d'article (seul champ obligatoire), fournisseurs
  suggérés en texte libre séparés par des virgules (facultatif), fourchette
  de prix approximative min-max (facultatif).
- **Approbation par ligne, pas par lot** : chaque ligne devient une demande
  d'achat (`PurchaseRequest`) indépendante dès la soumission — pas de
  notion de « lot » conservée après coup. 10 lignes soumises = 10 entrées
  indépendantes dans le centre d'action de Direction, à plat (pas
  regroupées visuellement — confirmé, la simplicité l'emporte ici).
- **Jamais de double autorisation** : ces lignes n'ont volontairement
  aucune catégorie — c'est cette absence qui retire le seuil (le mécanisme
  déjà confirmé `canApprovePurchaseRequest` ne trouve simplement aucun
  seuil à dépasser), pas une règle spéciale ajoutée. Direction approuve
  seule, comme pour les achats directs de projet.
- **Prix modifiable avant approbation** : Direction fixe/ajuste le prix
  final avant d'approuver une ligne — une ligne sans prix confirmé ne peut
  pas être approuvée. Même esprit que la tarification des pièces d'appel
  de service (0$ jusqu'à tarification par Direction).
- **Comptabilisation au projet** : comme les demandes d'achat régulières —
  pas de champ total dupliqué sur le projet, calculé à la lecture en
  sommant les demandes autorisées (même principe que les statistiques
  internes, qui filtrent et somment plutôt que de maintenir un total à
  part).
- Distinguer ces lignes des demandes régulières dans les rapports plus
  tard : **pas nécessaire**, confirmé — une fois traitées, aucune
  différence à conserver.

## Paramètres — gestion des catégories d'achat (confirmé le 12 août 2026)
- Direction (seulement) peut ajouter, renommer et désactiver les
  catégories utilisées par la demande d'achat régulière — même patron que
  les tâches punchables par catégorie déjà confirmées. « Supprimer » =
  désactiver, jamais une suppression réelle : une catégorie désactivée
  disparaît des nouveaux choix, mais les demandes déjà faites continuent
  de la référencer sans problème.
- **Un seuil est obligatoire à la création** d'une catégorie — pas
  d'option « sans seuil » (ça n'existe que pour la liste rapide de projet,
  qui elle n'a délibérément aucune catégorie).
- **Le seuil se fige au moment de la soumission d'une demande, jamais
  rétroactif.** Si Direction change le seuil d'une catégorie pendant
  qu'une demande utilisant cette catégorie est déjà en attente, la
  demande garde le seuil qui était en vigueur au moment où elle a été
  soumise — jamais recalculée avec le nouveau seuil. Même principe que les
  autres taux gelés déjà établis (ex. `Budget.backupHourlyRate`).

## Demandes clients — création/liste/consultation (confirmé le 12 août 2026)

Premier morceau de la tranche « demande client → budgétaire → projet →
facturation ». Champs et libellés des menus déroulants vérifiés
directement dans le formulaire du prototype v19
(`docs/handoff/04-reference-v19`), jamais devinés.

- **Champs à la création** : Entreprise, Nom du contact, Rôle du contact
  (facultatif), Téléphone, Courriel, Adresse (facultatif), Type de
  demande, Urgence, Canal d'entrée, Précision sur la provenance
  (facultatif), Date de relance (facultatif), Résumé détaillé de la
  demande. Seuls les champs marqués « facultatif » dans le prototype le
  sont réellement — tous les autres sont obligatoires à la création.
- **Type de demande** (valeurs) : Projet, Roulement, Call de service,
  Demande d'information. Stocké comme `information` (pas `info`, valeur
  brute du prototype) pour correspondre exactement aux clés de
  `CATEGORY_BY_SOURCE` dans `contacts.ts` — même résultat visuellement,
  correspondance explicite plutôt que par repli implicite.
- **Urgence** (valeurs) : Urgent, Non urgent (par défaut), À discuter.
- **Canal d'entrée** : liste gérée (table `SalesChannel`, comme les
  catégories d'achat), pas figée en dur comme dans le prototype — valeurs
  de départ vérifiées dans le prototype : Google, Facebook, LinkedIn,
  Réseautage, Référence client, Site Web, Téléphone / direct, Autre.
  (Corrige une liste de 5 canaux inventée par erreur dans une session
  précédente, jamais confirmée — voir seed.ts.)
- **Contact automatique** : chaque demande crée ou met à jour le contact
  correspondant via `ensureContact` (contacts.ts, fonction pure déjà
  vérifiée, jamais modifiée) — déduplique par courriel puis par nom.
  Vérifié avec de vraies écritures en base (pas seulement des appels
  internes) : une deuxième demande avec le même courriel réutilise le
  même contact et ajoute la nouvelle catégorie sans dupliquer.
- **Visibilité** : identique pour Direction, Administration et
  Propriétaire — aucune restriction supplémentaire, aucun filtrage par
  créateur. *Confirmé.*
- **Statuts gérables manuellement pour cette étape** : Nouvelle → En
  traitement → Perdue (avec raison facultative). *Convertie* existe déjà
  dans le vocabulaire du schéma mais n'est pas une action manuelle tant
  que la conversion réelle en budgétaire/projet n'est pas construite.
- **Portée volontairement reportée, à ne pas oublier** : assignation à un
  employé (`assignedEmployeeId`), transfert au Propriétaire
  (`transmittedToOwnerAt`) et conversion en budgétaire/projet/roulement
  (`budgetId`, `convertedType`, `convertedProjectId`,
  `convertedRollingId`) — champs déjà réservés dans le schéma, à
  construire avec les fonctionnalités Budgétaire/Projets elles-mêmes.
  *Confirmé avec l'utilisatrice — reste un suivi actif, pas oublié.*

## Budgétaire — calculateur, création, cycle de statuts (confirmé le 12 août 2026)

Deuxième morceau de la tranche « demande client → budgétaire → projet →
facturation ». Flux de création vérifié directement dans `budgetStartModal()`
du prototype v19 (`docs/handoff/04-reference-v19`), jamais deviné.

- **Un seul flux de création, pas trois mécanismes séparés** : le prototype
  ne distingue pas « directement » vs « depuis une demande » — un même
  formulaire propose une demande client existante (liste filtrée : ni déjà
  liée à un budgétaire, ni statut Perdue, ni type Demande d'information) OU,
  si aucune n'est choisie, crée automatiquement le contact et la demande
  client via `createClientRequest` telle quelle — jamais un deuxième
  mécanisme de contact. Le champ Urgence n'existe pas dans ce flux (absent
  du formulaire v19 aussi) — `ClientRequest.urgency` reste `null` pour les
  demandes créées par cette voie, ce qui est valide (colonne facultative).
- **5 sections fixes** (Conception, Fabrication, Programmation, Assemblage,
  Installation), copiées depuis le `BudgetModel` courant au moment de la
  création — lignes et taux **gelés**, jamais recalculés rétroactivement si
  le modèle change ensuite (même principe déjà appliqué au taux horaire de
  back-up).
- **Complexité PAR SECTION (0-10), pas un seul niveau pour tout le
  budgétaire** — chaque section calcule indépendamment ses heures/coût/prix
  de vente (nouvelle fonction `sectionSummary`, `packages/business-rules/
  src/sections.ts`), avec le même mécanisme que `backup.ts` :
  `complexityMarkup()`/`saleFromCost()` de `margin.ts`, non modifiées.
- **Back-up** : réutilise `backup.ts` tel quel, sans changement — Fabrication
  + Programmation + Assemblage seulement, taux/pourcentage/complexité
  propres à ce budgétaire et gelés à la création.
- **Numérotation** : `BG-AAAA-NNNN`, même mécanisme que `DC-AAAA-NNNN` pour
  les demandes clients (compteur `Settings.nextBudgetNumber`).
- **Cycle de statuts** : Brouillon → Prêt → Envoyé → {Contrat obtenu |
  **Refusé**}. Statut Refusé confirmé le 12 août 2026 (absent du prototype,
  ajouté à la demande de l'utilisatrice — « Oui un statut Refusé serait
  apprécié »).
- **Permissions** (voir `roles.ts`, déjà testées) : création (demande
  existante ou nouvelle) = Direction et Propriétaire seulement, **jamais
  Administration** contrairement à la création d'une demande client;
  modification des heures/complexité/réglages de back-up avant envoi =
  Direction seulement; marquer prêt = Direction et Propriétaire; marquer
  envoyé/Contrat obtenu/Refusé = **Direction seulement, le Propriétaire
  n'y est pas impliqué**; accès en lecture (liste et détail) = tous les
  rôles sauf Employé et Magasinier.
- **Portée volontairement reportée, à ne pas oublier** : conversion réelle
  d'un budgétaire « Contrat obtenu » en projet (`transferBackupToProject`)
  — en attendant que Projets existe comme fonctionnalité réelle et
  construisible, même report déjà confirmé pour la conversion des demandes
  clients. *Confirmé avec l'utilisatrice — reste un suivi actif, pas
  oublié.*

**Écart trouvé et corrigé le 12 août 2026** (même jour, quelques heures plus
tard) — la première construction ci-dessus a été jugée « très loin d'être
complet » par l'utilisatrice, qui a demandé une deuxième vérification
directe dans le prototype. Cause racine : le fichier v19 contient plusieurs
générations de code superposées pour le budgétaire (au moins 3 mécanismes
différents pour la même idée, trouvés dans le même fichier) — la première
passe avait retenu la mauvaise version en jugeant, à tort, que le vrai écran
câblé (`views.budget = ms`, vérifié en traçant le routeur de vues à la
ligne 4881) était un brouillon dépassé. Corrigé :

- **8 catégories, pas 5** : Conception, Fabrication, Panneau &
  programmation, Assemblage & tests, Installation, **Stock &
  consommables, Sous-traitance, Déplacements & frais** — ces 3 dernières
  n'existaient pas du tout dans la première construction.
- **Sections modulables** : Fabrication, Programmation, Assemblage,
  Sous-traitance et Déplacements permettent à Direction d'ajouter/retirer
  des lignes (jamais en bas d'une seule ligne restante) — Conception,
  Installation et Stock restent à composition fixe. Sous-tâches réelles
  ajoutées au modèle : Programmation → « Panneau & schémas » +
  « Programmation »; Assemblage → « Assemblage » + « Test & finition » +
  « Emballage » (taux internes inchangés, pas de nouveaux chiffres
  inventés — seule la structure en lignes nommées était manquante).
- **Achat direct par ligne** : chaque ligne peut porter, en plus des
  heures × taux, un montant d'achat direct (matériel, sous-traitance) —
  `sectionSummary` additionne maintenant les deux pour le coût avant
  marge d'une ligne. Nécessaire pour Stock/Sous-traitance/Déplacements
  (achats purs, 0 heure) et pour des lignes hybrides comme « Panneau &
  schémas » (heures ET achat).
- **Risque/note par ligne**, texte libre facultatif.
- **Champs d'en-tête du budgétaire** : PO client, quantité, date de
  validité, résumé du budgétaire, résumé des risques — tous facultatifs.
- **DEUX réserves back-up distinctes, jamais une remplaçant l'autre**
  (point le plus important de cette correction, tranché explicitement par
  l'utilisatrice) :
  - **Back-up D'HEURES** (déjà construit le 12 août, premier passage) —
    réserve calculée automatiquement à partir des heures admissibles
    (Fabrication + Programmation + Assemblage) × pourcentage × taux, avec
    sa propre complexité pour la marge. **Inchangé** — c'est la formule
    documentée dans « Back-up d'heures — confirmé au complet (7 août
    2026) » ci-dessus, qui a priorité sur le montant $ affiché dans
    l'écran `ms()` du prototype (bug déjà documenté et corrigé ailleurs
    dans ce même fichier, pas un mécanisme à reproduire).
  - **Back-up PROJET** (nouveau) — montant saisi à la main par Direction,
    non dérivé des heures; une complexité (0-10) détermine seulement la
    marge appliquée à ce montant, même mécanisme que
    `sectionSummary`/`backupSummary` (`complexityMarkup()`/
    `saleFromCost()` de `margin.ts`, non modifiées). Nouvelle fonction
    `projectBackupSummary()` dans `packages/business-rules/src/
    sections.ts`.
- **Complexité par section confirmée** (pas par ligne) : re-demandé
  explicitement après avoir vu que le vrai prototype varie la complexité
  ligne par ligne (ex. Soudage à 12, Peinture à 5, dans la même section
  Fabrication) — l'utilisatrice a confirmé garder la granularité par
  section déjà construite, décision d'origine de la toute première
  planification (avant le premier écran construit), qui prévaut donc sur
  ce que montre le prototype à cet endroit précis.

## Budgétaire — refonte complète après vérification catégorie par catégorie (12 août 2026, troisième passage)

La correction ci-dessus restait incomplète — l'utilisatrice a fourni des
captures d'écran du vrai prototype, une catégorie à la fois, comparées
directement à l'application construite. Constat final : **13 catégories**
réparties en 3 groupes visuels, **deux structures de ligne complètement
différentes** selon la catégorie, et des permissions qui varient **par
ligne**, pas seulement par catégorie.

- **Groupe Main-d'œuvre** (type "labor" — Tâche/Taux/Heures/Risque, jamais
  d'ajout/retrait de ligne, jamais d'achat direct sur la ligne, modifiable
  Direction seulement) :
  - **Conception** — Conception & Dessin (117 $), **Conception plus 10 %**
    (ligne calculée automatiquement : heures = celles de Conception &
    Dessin × 10 %, jamais saisie directement, non punchable — nouveau
    mécanisme `autoFromRowId`/`autoPct` dans `sections.ts`), Préparation
    (112 $), Gestion/BOM (112 $).
  - **Fabrication** — taux différenciés par tâche (vérifiés dans le
    prototype, pas inventés) : Plasma 116 $, Usinage 113 $, Pliage 113 $,
    Soudage/Montage 110 $, Peinture 107 $.
  - **Panneau & Programmation** — Panneau & Schémas 110 $, Programmation
    117 $ (taux différenciés, pas uniformes comme construit d'abord).
  - **Assemblage & Test** — Assemblage, Test & Finition, Emballage,
    **Ménage** (manquait), toutes à 112 $.
  - **Installation/Service — Main-d'œuvre** — Préparation (107 $), Temps
    homme régulier (112 $), **Temps homme supplémentaire (125 $)**,
    Gestion/BOM (112 $), Service après-vente (112 $).
- **Groupe Achats prévus** (type "purchase" — Article-Dépense/Qté/Prix
  unitaire/Risque, coût = qté × prix unitaire, jamais heures × taux) :
  Stock Fabrication/Châssis, Stock Panneau/Programmation, Motorisation/
  Automatisation, Quincaillerie/Autre, Sous-traitance — chacune **10
  lignes vierges au départ, ajustables** (ajout/retrait par Direction ET
  Propriétaire) ; Consommables — 5 lignes déjà nommées (Plasma, Soudage,
  Usinage, Peinture, Emballage), composition fixe, modifiable
  Direction/Propriétaire.
- **Groupe Installation (suite)** — Installation — Stock (10 lignes
  vierges, ajustables, type Achat) ; Installation — Frais divers (11
  lignes fixes avec de vrais taux : Formation 112 $, Hébergement 250 $,
  Kilométrage 0,97 $/km, Transport 112 $, Déjeuner 17,90 $, Dîner 26,90 $,
  Souper 37,65 $, Avion 0 $ — ces 8 **Direction seulement** ; Location,
  Manutention, Livraison — ces 3 **Direction ET Propriétaire**, même
  catégorie, permissions mélangées par ligne).
- **Aucune catégorie "labor" n'est modulable** — contrairement à ce qui
  avait été construit deux fois de suite (Fabrication/Programmation/
  Assemblage avaient un bouton « + Ajouter une ligne » à tort). Seules les
  6 catégories Achat à lignes vierges le sont.
- **Permissions par ligne, pas seulement par catégorie** — nouvelle
  fonction `canModifyBudgetPurchaseLine` (Direction OU Propriétaire) dans
  `roles.ts`, en plus de `canModifyBudget` (Direction seulement, déjà
  existante) : une ligne "labor" ou marquée `directionOnly` exige
  Direction seulement; une ligne "purchase" non marquée `directionOnly`
  accepte aussi le Propriétaire. Vérifié par test réel : le Propriétaire
  peut modifier une ligne Stock Fabrication mais pas « Formation »
  (Installation — Frais divers, marquée Direction seulement) ni aucune
  ligne Heures.
- **Résumé et résumé des risques obligatoires** avant de marquer un
  budgétaire prêt (« Terminer et marquer le budgétaire prêt ») — les
  champs existaient déjà, seul le blocage manquait.
- **Non reconstruit, jugé hors de portée pour cette passe** : la colonne
  « Prix vente réparti » par ligne (répartition proportionnelle du prix de
  vente de la catégorie, affichage seulement, aucun impact sur les
  calculs) — les totaux par catégorie et le grand total restent exacts
  sans elle.

Vérifié de bout en bout contre une vraie base de données (13 catégories,
96 lignes, ligne auto-calculée, permissions par ligne, blocage du
résumé/risques, totaux) avant d'être committé.

## Conversion Budgétaire → Projet — préparation (12 août 2026, en soirée)

Préparé par questions/réponses directes avec l'utilisatrice (aucun accès à
Supabase/Render/l'application depuis la maison ce soir-là) et une vraie
capture d'écran de la vue projet (vue cellulaire v19). **Construction
reportée à une session dédiée** — ceci documente seulement les règles déjà
confirmées, pour ne rien perdre d'ici là. Ne pas construire ce module à
partir de cette seule section sans revoir le reste de la vue avec
l'utilisatrice (voir dernier point).

- **Déclencheur** : le bouton de conversion n'est disponible qu'une fois le
  budgétaire au statut « Contrat obtenu » (`won`) — jamais avant.
- **Permission de convertir** : **Direction seulement** (`owner`) —
  distinct de la création *directe* d'un projet (Direction ET Propriétaire,
  voir « Projets — création directe » plus haut). Nouvelle fonction à
  ajouter dans `roles.ts` (ex. `canConvertBudgetToProject`), ne pas
  réutiliser `canCreateProjectDirectly`.
- **Vue projet — coup d'œil** (confirmé par capture d'écran réelle, vue
  cellulaire) : Prix vendu, Heures planifiées, Heures réelles, Utilisation
  heures (%), Achats prévus, Achats réels, Back-up heures (heures + $),
  **Back-up projet ($)**, Livraison planifiée (heures + $), Marge brute
  réelle ($), Marge brute %.
  - `Project` (schema.prisma) n'a actuellement **aucun champ pour le
    back-up projet** — à ajouter (ex. `projectBackupAmount`), copié/gelé
    depuis `Budget.projectBackupAmount` au moment de la conversion.
  - **Back-up projet, rôle confirmé** (mots de l'utilisatrice) : « réserve
    monétaire liée à un projet — nous n'affectons pas d'achat ni de punch
    [dessus], mais elle sert dans le calcul de la marge réelle. » Donc :
    jamais alimenté par de vraies dépenses/punches individuels
    (contrairement aux achats/heures réels), mais bien inclus comme un
    coût dans le calcul de la marge brute réelle.
  - **Nouveau champ demandé, absent de la v19 elle-même** : une case
    « Marge visée » (ou « marge résultante ») — le % de marge cible du
    budgétaire d'origine (ex. 20 %, gelé à la conversion), affichée À CÔTÉ
    de « Marge brute réelle »/« Marge brute % ». Confirmé utile par
    l'utilisatrice après avoir remarqué que « Marge brute % » affiche
    100 % dès la création du projet (puisqu'elle se calcule sur les coûts
    RÉELS encourus jusqu'ici, donc 0 $ au départ) — sans un point de
    comparaison fixe, ce chiffre est trompeur en début de projet.
  - **Le coup d'œil n'est qu'un résumé** — le détail des heures et des
    achats est plus bas sur la même page (probablement la table de
    comparaison planifié/réel décrite ci-dessous, à confirmer). Dit
    explicitement par l'utilisatrice : à revoir en détail au moment de
    construire ce module, pas deviné ici.
- **Table de comparaison planifié/réel** (tracée dans le code source v19 le
  12 août 2026 — `v14r1ProjectComparisonTable` / `v14ProjectComparisonRows`
  / `v15ComparisonIdentity`, avec un auto-test intégré au code qui vérifie
  explicitement ce comportement) : garde les **5 groupes historiques**, PAS
  les 13 catégories du budgétaire refondu — Conception, Programmation/
  panneau, Assemblage/test et Installation apparaissent chacune en une
  seule ligne (« Toutes les tâches »); **Fabrication seule éclate en une
  ligne par tâche** (Plasma, Usinage, Pliage, Soudage, Peinture). Confirmé
  volontairement reconduit tel quel par l'utilisatrice, malgré le passage
  du budgétaire à 13 catégories.
- **Achats du projet** : suivis sur l'axe des 9 catégories du module Achats
  déjà construit (`PurchaseCategory`), jamais celui du budgétaire — deux
  vocabulaires de catégorie complètement séparés sur un même projet.
- **`amendments.ts` (avenants)** : le taux interne unique par catégorie
  (`AMENDMENT_INTERNAL_RATES`, ex. 112 $/h pour toute la Fabrication) reste
  **intentionnellement** plus grossier que les taux différenciés par tâche
  du budgétaire refondu (116/113/113/110/107 $/h pour Fabrication).
  Confirmé « normal et voulu » par l'utilisatrice — aucune modification à
  `amendments.ts`.

**Encore à préciser lors de la construction de ce module** : détail complet
de la section « plus bas » de la vue projet (heures + achats), comportement
du bloc « Progression du projet » (« Calcul indépendant du Gantt, fondé sur
les heures et les achats », mode « Automatique » visible dans la capture) —
pas encore exploré.

## Conversion Budgétaire → Projet — Phase 1 construite (12 août 2026, tard en soirée)

Tout ce qui précède dans cette section a été construit, vérifié de bout en
bout contre une base de données locale (budgétaire réel créé, rempli,
marqué « Contrat obtenu », converti — chaque champ comparé à la valeur
attendue calculée à la main) et committé. Précisions supplémentaires
apparues pendant la construction :

- `Project.plannedHours`/`plannedPurchases` dérivés des catégories du
  budgétaire selon leur type (`labor` vs `purchase`) — jamais des réserves
  back-up, qui ont leurs propres champs séparés.
- `Project.laborHours`/`laborCost` démarrent égaux à `plannedHours`/coût de
  main-d'œuvre du budgétaire à la conversion, puis grossissent SEULS avec
  chaque avenant (`amendments.ts`, inchangé) — confirmé avec l'utilisatrice.
  `plannedHours`/`actualHours` restent la référence figée pour la
  comparaison, jamais touchés par un avenant.
- `Project.targetMarginPct` (marge visée) = marge globale du budgétaire
  ((prix vendu total − coût total) ÷ prix vendu total), gelée une seule
  fois à la conversion — confirmé avec l'utilisatrice.
- **« Marge brute réelle », mécanisme confirmé** (12 août 2026) : le
  back-up d'heures ET le back-up projet sont déjà inclus, avec leur propre
  marge, dans `sold` (le prix vendu total du budgétaire, gelé à la
  conversion) — jamais un coût à soustraire une deuxième fois. La marge
  réelle ne baisse que quand un coût ADDITIONNEL survient après coup : un
  vrai punch enregistré au projet, ou un achat réellement autorisé au
  projet. Tant qu'aucun des deux n'existe, `sold − 0 = sold`, donc 100 % —
  normal et attendu sur un projet neuf, peu importe la taille du back-up,
  pas une approximation. Formule Phase 1 (`sold − actualPurchases`)
  confirmée correcte telle quelle; une future phase qui ajoute le suivi
  réel des heures (`TimeEntry`) devra additionner le coût réel des punches
  approuvés au même titre que `actualPurchases`, jamais toucher aux champs
  back-up.
- Numérotation `PRJ-NNNN` via `Settings.nextProjectNumber` — bug de seed.ts
  trouvé et corrigé en vérifiant : le projet de test (`PRJ-0001`) ne faisait
  jamais avancer ce compteur, donc la toute première vraie conversion
  entrait en collision avec lui sur une base fraîchement seedée.

**Toujours hors de cette phase** : la table de comparaison planifié/réel
par catégorie, le Gantt, les sous-assemblages, le suivi réel des
heures/achats (`TimeEntry`/`ProjectPurchaseEntry`), la facturation, la
section « plus bas » de la vue projet et le bloc « Progression du projet ».

## Budgétaire — sommaire « Budgétaire détaillé » (12-13 août 2026)

Vue ajoutée au détail budgétaire existant (pas un nouvel écran), formules
confirmées verbalement par l'utilisatrice le 12 août 2026 — **pas** les
montants de sa capture d'écran de la v19, cette partie du prototype n'a
jamais été ajustée/fiabilisée. Entièrement dérivé de `sections`/`totals`
déjà renvoyés par l'API, aucun nouveau champ serveur. Regroupement propre
à cette vue, différent des 13 catégories du calculateur et des 5 groupes
de la comparaison Projet :

- **Coût planifié** = somme de `baseCost` de toutes les catégories, avant
  marge, **excluant les deux back-up** (back-up d'heures et back-up
  projet, chacun dans son propre champ, jamais mélangé aux catégories).
- **Achats détaillés** = somme de `baseCost` des catégories `purchase`,
  **excluant le groupe Installation ET Sous-traitance** — cette dernière
  a sa propre carte plus bas dans le sommaire; l'inclure aussi dans
  Achats détaillés la compterait deux fois. **Corrigé le 13 août 2026**
  (l'implémentation initiale l'incluait par erreur).
- **Marge résultante** = (prix vendu total − coût total, catégories +
  back-up) ÷ prix vendu total — même calcul que `totals`, arrondi à 1
  décimale.
- **Conception & Dessin**, **Panneau & Programmation**, **Installation —
  Heures** : heures + valeur de leur propre catégorie seule.
- **Fabrication & Assemblage** : Fabrication et Assemblage & Test
  combinées (heures + valeur additionnées des deux).
- **Sous-traitance** : sa propre carte (valeur seulement, pas d'heures —
  catégorie `purchase`).
- **Installation — Stock et frais divers** : Installation Stock et
  Installation Frais divers combinées.

## Achats — formulaire général, seuil par rôle, suivi de commande (13 août 2026)

Étend le mécanisme « demandes d'achat » confirmé plus haut (section
Achats), construit initialement le 12 août 2026 avec seulement la liste
rapide de projet. Règles confirmées directement avec l'utilisatrice avant
construction (voir échange du 13 août 2026) :

- **Formulaire général de demande d'achat construit** — avec catégorie
  (donc soumis au seuil de sa catégorie), ouvert à tous les rôles. Deux
  onglets dans l'écran Achats : « Demande d'achat » (général) et « Liste
  rapide de projet » (sans catégorie, jamais de seuil).
- **Liste rapide OUVERTE À TOUS LES RÔLES** — changement volontaire par
  rapport à la restriction Propriétaire/Direction confirmée le 12 août
  2026. L'utilisatrice a été informée explicitement que ça permet à
  n'importe qui (y compris Employé/Magasinier) de soumettre une ligne sans
  catégorie, donc sans jamais déclencher le seuil du Propriétaire peu
  importe le montant — **confirmé voulu malgré ce risque signalé**
  (`canSubmitPurchaseRequest`, roles.ts).
- **Le seuil de double autorisation dépend maintenant du RÔLE du
  demandeur, pas seulement du montant/catégorie** — règle nouvelle,
  absente de la version du 12 août 2026 : une demande soumise par
  Administration, Propriétaire ou Direction n'entraîne **jamais** de
  double autorisation du Propriétaire, peu importe le montant — Direction
  seule approuve toujours. Seules les demandes soumises par Employé ou
  Magasinier peuvent escalader au Propriétaire si le montant dépasse le
  seuil de la catégorie (`canApprovePurchaseRequest`, champ
  `requesterPersona`, roles.ts — rétrocompatible, comportement d'origine
  inchangé si ce champ est absent).
- **Modification par le demandeur** — chacun peut modifier
  description/fournisseur/montant estimé de sa PROPRE demande tant qu'elle
  reste en attente (jamais la catégorie ni le projet, qui déterminent le
  seuil gelé), plus aucune modification possible une fois autorisée ou
  rejetée. `editedAt` sert de signal visuel pour Direction dans son centre
  d'action (liste des demandes) — volontairement pas de système de
  notification séparé.
- **Suivi de commande ajouté après l'autorisation** — troisième étape en
  plus de « demande d'achat → autorisation » : Direction (ou délégué
  « purchases ») fait progresser un statut distinct **en attente → commandé
  → reçu** (`fulfillmentStatus`, démarre automatiquement à « en attente »
  au moment de l'autorisation, jamais un geste séparé pour le déclencher).
- **Application au projet — geste explicite, distinct de l'autorisation**
  — un achat autorisé ne compte plus automatiquement dans les totaux/le
  détail du projet. Direction doit d'abord atteindre le statut « Reçu »,
  puis appliquer explicitement au projet (`appliedToProjectAt`). Un achat
  déjà appliqué ne peut pas être appliqué une deuxième fois.
- **Propriétaire voit TOUTES les demandes d'achat et le statut de
  chacune** — pas seulement celles en attente de sa propre approbation
  (déjà couvert par `canViewPurchase`, mais la liste ne se limitait avant
  qu'aux statuts en attente par défaut — élargie pour montrer tout
  l'historique visible).
- **Vue « Achats » prévue dans le menu du module Projet** (pas encore
  construite, voir tâche séparée) — ouvrira le détail des achats appliqués
  à ce projet, avec description/numéro de pièce et fournisseur.
- Vérifié de bout en bout contre une vraie base de données (21 scénarios :
  seuil gelé, seuil par rôle demandeur × 4 personas, liste rapide toujours
  sans seuil, modification autorisée/refusée, suivi complet, application
  au projet avec ses gardes, visibilité par rôle) avant d'être committé.

## Achats — numéro de demande sur 5 chiffres, remise à zéro annuelle (14 août 2026)

Ajustement confirmé par l'utilisatrice après avoir testé le module :

- **Format `DA-AAAA-NNNNN`** — 5 chiffres pour le numéro séquentiel, pas 4
  (inchangé pour les autres numérotations — Budget, Demande client,
  Projet — non concernées par cette demande).
- **Remise à zéro automatique chaque nouvelle année d'affaires**, à la
  frontière réelle du 31 décembre 23h59 **heure du Québec** (America/
  Toronto) — pas minuit UTC, le serveur (Render) tournant probablement en
  UTC. `Settings.purchaseRequestNumberYear` retient l'année à laquelle le
  compteur s'applique; dès que l'année d'affaires courante diffère, la
  toute première demande de la nouvelle année repart à `00001`.
- **« Règle du plus haut +1 » conservée** à l'intérieur d'une même année —
  aucun changement au mécanisme d'incrémentation lui-même, seulement sa
  portée (par année plutôt qu'à vie).
- Vérifié contre une vraie base de données : format à 5 chiffres,
  incrémentation normale en cours d'année, remise à zéro correcte en
  simulant un changement d'année (ancienne année + compteur élevé forcés
  en base, la demande suivante repart bien à `00001` avec le préfixe de
  l'année réelle courante).

---

# Module Projet — Phase 2

La Phase 1 (12 août 2026, section « Conversion Budgétaire → Projet »
ci-dessus) laissait explicitement hors scope : la table de comparaison
planifié/réel, le Gantt, les sous-assemblages, le suivi réel des heures/
achats, la facturation, la garantie, le post-mortem et le menu Options.
Les sections 2A à 2F ci-dessous couvrent tout ce lot sauf le Gantt et les
sous-assemblages (sections séparées plus loin dans ce document). Tout ce
qui suit a été committé et vérifié contre une vraie base de données au
moment de sa construction (17 août 2026, sauf mention contraire) — cette
mise à jour du document elle-même ne fait que documenter ce code déjà
livré, à partir d'une relecture directe de `apps/api/src/modules/projects/
service.ts`, `packages/business-rules/src/{margin,warranty,fulfillment,
billing}.ts` et `roles.ts`.

## Projet 2A — Statut financier, Progression et Comparatif planifié/réel (confirmé le 17 août 2026)

- **Voyant de marge réelle** (`financialStatus`, `margin.ts`) — fonction
  **partagée** entre projets, roulements et calls de service (jamais
  dupliquée par entité) : conforme si la marge réelle ≥
  `Settings.marginConformeThreshold`, à risque si ≥
  `marginAtRiskThreshold` (mais sous le premier seuil), critique en
  dessous. Défauts 30 % / 25 %, réglables dans Paramètres (carte « Seuils
  du voyant de marge réelle », `MarginThresholdsCard.tsx`) — route
  `PATCH /api/settings/margin-thresholds` gardée par `canAccessSettings`
  (Direction seule, comme tout le module Paramètres). Recalculé à CHAQUE
  lecture depuis les vrais punchs/achats approuvés — jamais un champ figé
  sur le projet.
- **`computeProjectFinancials`** — calcul financier partagé entre la vue
  projet (`getProjectDetail`) et le Post-mortem (2E ci-dessous) : les deux
  écrans affichent exactement les mêmes chiffres, jamais recalculés
  séparément. Marge réelle = `sold − coût réel de main-d'oeuvre (au taux
  de COÛT de l'employé qui a punché) − achats réels` (`projectMargin`,
  déjà porté, inchangé).
- **Comparatif planifié/réel** — une ligne par **catégorie de main-d'oeuvre
  du budgétaire d'origine** (les 5 catégories `kind: "labor"` du catalogue
  à 13 catégories : Conception, Fabrication, Panneau & Programmation,
  Assemblage & Test, Installation/Service — Main-d'oeuvre — voir
  `categories.ts`), jamais les « 5 groupes historiques » de l'ancien
  prototype v19 envisagés dans la note du 12 août 2026 ci-dessus (qui
  proposait d'éclater Fabrication en une ligne par tâche DÈS ce niveau) —
  cette piste n'a pas été retenue telle quelle : Fabrication reste UNE
  seule ligne au niveau catégorie, exactement comme les 4 autres. Absent
  entièrement si le projet n'a pas de budgétaire d'origine (création
  directe) — rien à comparer.
- **Progression du projet** — **corrigée le 28 août 2026** (bug rapporté
  par l'utilisatrice, exemple chiffré à l'appui) : chaque catégorie de
  main-d'oeuvre est valorisée à SON PROPRE taux de ligne budgétaire
  (`computeHoursValueBase`, `section.baseCost / section.hours`), plus le
  back-up séparément à son propre taux (`Project.backupHourlyRate`, gelé à
  la conversion) — **jamais** le taux de back-up appliqué à la totalité
  des heures planifiées/réelles comme avant la correction (ce qui revenait
  à valoriser Conception et Installation au taux de back-up, qui ne leur
  revient jamais). Formule : `progressionPct = actualBase / plannedBase`,
  où chaque base = valeur des heures (par catégorie) + coût du back-up
  d'heures + achats (planifiés ou réels). Repli sur une valorisation
  globale au taux de back-up UNIQUEMENT si le projet n'a pas de budgétaire
  d'origine (aucun taux par catégorie disponible dans ce cas — impossible
  de faire mieux).
- **Visibilité** (`canSeeFinancialValues` — exclut Employé et Magasinier,
  règle transversale) : `sold`, achats planifiés/réels, coûts
  d'installation/back-up, marge, `financialStatus`, `progressionPct` et
  les coûts du comparatif sont TOUS omis du DTO pour ces deux rôles —
  seules les heures (planifiées/réelles/comparatif en heures) restent
  visibles.

## Projet 2B — Achats réels du projet (confirmé le 17 août 2026)

Mécanisme **volontairement séparé** du module Achats (demandes avec seuil
et double autorisation, déjà documenté plus haut) — confirmé comme un
deuxième chemin distinct, pas une contradiction :

- **`ProjectPurchaseEntry`** — saisie directe d'un achat déjà fait sur un
  projet, sans jamais passer par une demande ni un seuil : deux états
  seulement, `pending` → `approved` (pas de statut « rejeté » — une
  entrée erronée se **supprime**, elle ne se rejette pas). Modification du
  montant et suppression permises tant que `pending` seulement, plus
  aucune des deux après approbation.
- **Permissions** (`roles.ts`) : `canEnterProjectPurchase` (saisir) =
  Direction et Administration seulement; `canApproveProjectPurchase` =
  Direction OU un délégué actif sur la catégorie `"purchases"`
  (`actsAsDirection`, même mécanisme que le module Délégation) — jamais de
  seuil ni de double autorisation du Propriétaire, quel que soit le
  montant (contrairement aux demandes d'achat classiques).
- **`projectPurchasesActual(projectId)`** (`purchases/service.ts`) — le
  total « achats réels » d'un projet additionne DEUX sources : les
  `PurchaseRequest` déjà **appliquées** au projet (`appliedToProjectAt`
  non nul, mécanisme du module Achats) **+** les `ProjectPurchaseEntry`
  **approuvées** de ce projet. Toujours recalculé à la lecture, jamais un
  champ dupliqué/périmé sur `Project`.
- **Étendu au Roulement le 28 août 2026** (`rollingId`,
  `createRollingPurchaseEntry`/`rollingPurchasesActual`) — mais SANS le
  côté `PurchaseRequest` : un Roulement n'a pas de `rollingId` sur ce
  modèle, portée confirmée volontairement plus étroite (Marie a demandé le
  mécanisme « achats réels » simple, pas d'étendre tout le flux
  demande/autorisation à un deuxième type de dossier).

## Projet 2C — Production, sortie et cycle de facturation (confirmé le 17 août 2026)

Cette phase **branche** dans le module Projet des règles pures déjà
confirmées et portées le 8-9 août 2026 (`fulfillment.ts`/`billing.ts`,
inchangées) — elle n'invente pas de nouvelle règle de fond, seulement le
câblage API/écran :

- **Séquence** : `markProductionComplete` (Direction seulement) puis
  `chooseProjectFulfillmentMode` avec un des 4 modes (`FULFILLMENT_MODES`) :
  - `warehouse` (Bon de livraison) — crée automatiquement un `Delivery`
    assigné au magasinier choisi, avec sa propre numérotation
    `BL-AAAA-NNNN` (`Settings.nextDeliveryNumber`), dans la MÊME
    transaction. Se confirme ensuite via le Bon de livraison lui-même
    (`confirmWarehouseDelivery`), jamais via `confirmProjectFulfillment`.
  - `manual`/`pickup` (tiers/ramassage) — reste « à confirmer »
    (`awaiting_confirmation`) jusqu'à `confirmProjectFulfillment(note)`
    (Direction et Administration), qui met `billingReady=true` et fait
    passer le projet à `ready_invoice`.
  - `installation` — reste **intentionnellement ouvert** (heures/achats
    d'installation encore à venir) : ne ferme jamais automatiquement
    l'entité, aucun `confirmProjectFulfillment` applicable.
- **Cycle de facturation** — plan créé **une seule fois**, à la conversion
  (`convertBudgetToProject`), avec la répartition par défaut
  `DEFAULT_BILLING_SPLIT` (25 % signature / 25 % après conception / 40 %
  livraison / 10 % 30 jours après). `canRequestInvoice` (Direction
  seulement) fait apparaître la demande dans le centre d'actions
  d'Administration; `canCreateInvoiceRecord` (Direction et Administration)
  enregistre directement le numéro de facture, avec ou sans demande
  préalable; `canHoldInvoice` (Direction seulement) suspend un jalon
  envoyé (litige) — Sage reste la source réelle de la facture, GSC Pilot
  ne fait que suivre plan + statut.
- **Cycle personnalisable par projet — ajouté le 26 août 2026** (confirmé
  avec l'utilisatrice : un vrai projet peut n'avoir besoin que de 2 jalons,
  ex. 30 % après conception / 70 % après installation, pas seulement les %
  des 4 jalons par défaut) : `updateProjectBillingPlan` remplace
  entièrement la répartition (doit totaliser exactement 100 %), **bloqué
  dès qu'un seul jalon a déjà été demandé, facturé ou payé** — même porte
  que `canRequestInvoice`, pour ne jamais casser un suivi déjà commencé.
- **Paiement additif — corrigé le 31 août 2026** (rapport de
  l'utilisatrice) : `recordInvoicePayment` n'accepte maintenant QUE le
  montant du NOUVEAU versement reçu, additionné au `paidAmount` déjà
  accumulé — avant cette date, l'usager devait ressaisir le total
  cumulatif à chaque versement partiel (recalculé de tête à chaque fois).

## Projet 2D — Garantie (confirmé le 17 août 2026)

- **Deux données indépendantes** (`warranty.ts`) : `warrantyExpected`
  (case informative, cochée dès la création si on sait déjà que le projet
  ira en garantie mais pas encore quand — n'active rien seule) et
  `warrantyEndsAt` (le vrai interrupteur : nul = pas en garantie, rempli =
  en garantie jusqu'à cette date). `isUnderWarranty` compare simplement à
  « maintenant » — régler une nouvelle fin dans le passé désactive la
  garantie immédiatement, pas de bouton « annuler » séparé.
- **`canManageWarranty`** = Direction seulement, activable/modifiable
  n'importe quand — aucun préalable de production ou de sortie.
- **`projectLifecycleTab`** (dérivé, jamais un statut stocké) : Garantie si
  `isUnderWarranty`; sinon Fermés si `closedAt` rempli; sinon Actifs. Un
  projet peut être fermé ET en garantie active en même temps — deux
  données indépendantes, jamais une contradiction.
- Les heures punchées pendant la garantie comptent **encore** dans la
  marge réelle du projet — aucun traitement à part, le même
  `TimeEntry`/`margin.ts` s'applique tel quel.
- **Section toujours visible sur la vue projet**, volontairement PAS dans
  le menu Options — écart confirmé par rapport à la référence v19 : Marie,
  citée directement, « Je préfère sur la vue projet comme tu l'as mis ».
- Chaque activation/modification crée une ligne `WarrantyHistoryEntry`
  (fin précédente/nouvelle, motif, référence de facture, qui, quand) —
  surfacée dans l'Historique complet du projet (2F).

## Projet 2E — Post-mortem (confirmé le 17 août 2026, détail par tâche le 24 août 2026)

- **Mêmes chiffres que le reste du module** (`computeProjectFinancials`
  réutilisé tel quel) — jamais un deuxième calcul divergent entre la vue
  projet et le Post-mortem.
- **Seule vraie donnée propre à cet écran** : l'« Analyse finale », 3
  champs texte (`postMortemDepassements`, `postMortemAmeliorations`,
  `postMortemRecommandation`).
- **`costBreakdown`** : Main-d'oeuvre / Achats et frais / Back-up d'heures
  / Back-up projet, planifié vs réel — le back-up affiche **toujours**
  0 $ de réel : c'est une réserve, jamais consommée par un mécanisme suivi
  (aucun geste « dépenser le back-up » n'existe dans l'application), même
  logique que la marge réelle qui ne compte jamais le back-up comme un
  coût réel.
- Confirmé le 17 août 2026 : cet écran sera réutilisé **tel quel** par le
  futur module Rapports (sélection d'un projet en post-mortem) — aucune
  logique propre à `ProjectDetail.tsx` ne doit s'y infiltrer.
- **Détail par tâche — ajouté le 24 août 2026** (demandé par l'utilisatrice
  après avoir trouvé la vue par catégorie insuffisante) : chaque ligne du
  comparatif gagne un tableau `tasks` imbriqué (`ProjectComparatifTaskRow`),
  joint via `PunchableTask.budgetModelRowId === BudgetRow.modelRowId` — un
  punch se retrace ainsi jusqu'à sa ligne budgétaire planifiée exacte.
  **`ProjectDetail.tsx` (la vue projet en direct) garde délibérément le
  niveau catégorie seul**, confirmé « parfait » tel quel par
  l'utilisatrice — le détail par tâche reste réservé au Post-mortem.
- **Même jour (24 août 2026)**, les deux drill-down « Détail des heures
  approuvées » (`getApprovedTimeEntries`) et « Détail des achats
  approuvés » (`getApprovedPurchaseEntries`) gagnent/confirment une
  colonne Tâche — ce dernier combine explicitement les MÊMES deux sources
  que `projectPurchasesActual` (2B), jamais un troisième total divergent.
- Visibilité : `sold`, achats, coûts du comparatif, `costBreakdown` et
  `financialStatus` omis pour Employé/Magasinier — heures seules restent
  visibles.

## Projet 2F — Menu Options du projet (confirmé le 17 août 2026, tiroir latéral droit depuis le 18 août 2026)

- Structure confirmée par capture d'écran de la référence v19, section par
  section — mais construite en **tiroir latéral droit** dès le 18 août
  2026 (jamais la carte inline d'origine, jugée inefficace car elle
  poussait tout le contenu de la page vers le bas) : `OptionsDrawer.tsx`
  (`components/`), extrait ce jour-là et depuis réutilisé par le menu
  Options de chaque autre module (Demandes clients, Budgétaire, Roulement,
  Appels de service…) plutôt que dupliqué.
- **État accumulé actuel des sections** (au 1er septembre 2026 — enrichi
  au fil de plusieurs sessions au-delà du 17 août d'origine) : « Projet »
  (Modifier les informations — nom, échéance — `canManageProject` =
  Direction et Administration) · « Planification et budget » (Accéder au
  Budgétaire, Créer un avenant, Accéder au Gantt, « Gérer les dépendances »
  — visible mais **toujours désactivée**, générées automatiquement par les
  assemblages, aucune édition manuelle prévue —, Checklist de production,
  et depuis le 31 août 2026 un champ Priorité Gantt éditable gardé par
  `canEditGanttSchedule`, délibérément DISTINCT de `canManageProject` : un
  levier de planification, pas une info administrative) · « Heures et
  opérations » (Ajouter une entrée manuelle, Ajouter un achat, Créer un
  call lié — `canCreateServiceCall`, désactivé avec note explicite sinon —,
  Consulter les heures) · « Documents et suivi » (Code QR, Post-mortem,
  Historique complet) · « Contact » (toujours affichée — `Project.contactId`
  existe pour tout projet, créé directement ou via une demande) ·
  « Demande client d'origine » (seulement si `clientRequestId`) ·
  « Actions sensibles » en pied de tiroir (Archiver/Désarchiver + Supprimer
  avec confirmation, `canArchiveProject`/`canDeleteProject` = Direction
  seulement — la capture d'écran de référence les regroupe elle-même ainsi).
- Les lignes dont le module cible n'existait pas encore à la construction
  (punch d'heures, Appels de service, Contacts) sont restées **visibles
  mais inertes** plutôt que masquées, pour ne jamais donner l'impression
  d'un menu incomplet — toutes branchées depuis, au fur et à mesure de la
  construction de ces modules.
- **`getProjectHistory`** — première version **agrégée à la lecture**
  depuis les tables déjà horodatées (garantie, cycle de facturation,
  achats réels), plutôt qu'un nouveau journal d'audit générique écrit dans
  chaque action existante déjà testée (risque de régression jugé inutile
  pour un simple menu). Les événements de demande/enregistrement de
  facturation n'ont pas encore de nom résolu (seulement l'id) — lacune
  acceptée pour cette première version, jamais devinée.
- **Archiver ≠ Fermer** : un projet archivé reste pleinement accessible
  par lien direct, seulement sorti des listes actives (`listProjects`).
  **Supprimer** = corbeille (`deletedAt`) seulement — l'écran de
  restauration à 90 jours attend le module Paramètres complet (hors de
  cette phase, confirmé à l'origine).

Les 6 sections ci-dessus (2A-2F) ont chacune été vérifiées contre une
vraie base de données au moment de leur construction (17 août 2026, avec
les corrections/ajouts datés individuellement ci-dessus les jours
suivants) — cette mise à jour du document découle d'une relecture directe
du code actuellement en place, jamais d'une supposition sur ce qui aurait
« dû » être fait.

---

# Module Punch d'heures (confirmé le 18 août 2026)

Nouveau module construit de zéro (aucun équivalent dans
`docs/handoff/03-modules-v01/` — resté à l'état de squelette jusqu'ici,
voir CLAUDE.md sur l'ordre des modules). Un punch actif = `TimeEntry` avec
`endAt` nul — pas de table « minuteur actif » séparée.

- **Quatre références possibles** (`projectType`) : `project` | `rolling` |
  `service` | `internal` — jamais un mélange. Le coût est **gelé au punch**
  (`TimeEntry.costRate`), jamais recalculé après coup, selon la
  référence :
  - `project`/`rolling` → taux interne de la catégorie
    (`BudgetModelRow.hourlyRate`, via `PunchableTask.budgetModelRowId`) —
    le MÊME taux que la planification budgétaire, jamais le coût
    personnel de l'employé. Un Roulement utilise exactement le même
    catalogue de tâches/taux qu'un Projet (générique par catégorie,
    jamais propre à un budgétaire particulier).
  - `service` → **deux totaux volontairement distincts, jamais mélangés** :
    le coût réel reste `Employee.costRate` (coût personnel, comme pour
    `internal`); le prix FACTURÉ AU CLIENT se fige séparément via la
    classe facturable choisie AU PUNCH parmi celles de l'employé
    (`Employee.techLevels`, plusieurs classes possibles par employé,
    confirmé le 18 août 2026) et le type de taux (`rateType` :
    régulier/temps supplémentaire/extra, `rateForType`,
    `service-calls.ts`).
  - `internal` → `Employee.costRate` — Interne suit un coût de centre de
    coûts réel, pas un taux de catégorie standard.
- **Arrondi toujours vers le HAUT** (`roundPunchMinutes`, `punch.ts`),
  jamais au plus proche ni vers le bas — confirmé explicitement par
  l'utilisatrice. Le pas (`Settings.punchRoundingMinutes`, 15 min par
  défaut) s'applique à `TimeEntry.roundedMinutes` seulement;
  `TimeEntry.exactMinutes` garde toujours la vraie durée. **Corrigé le 19
  août 2026** : un punch de quelques secondes doit compter comme 1 minute
  exacte, jamais 0 — `Math.round` aurait arrondi 0,08 minute à 0, faisant
  disparaître le punch de `roundPunchMinutes` aussi (`Math.ceil(0/x) = 0`).
  Aucune règle de pause dîner ni d'heures hors plage — non confirmées,
  volontairement absentes.
- **`canPunchForOtherEmployee`** (Direction, Administration, Propriétaire)
  seuls peuvent puncher pour un autre employé (backfill) — un Employé ou
  Magasinier ne peut puncher que pour lui-même
  (`resolveActingEmployeeId`). Le rapport de l'utilisatrice du 19 août
  2026 sur cette règle a été vérifié directement contre le code déjà en
  place — aucune correction nécessaire.
- **`canPunchServiceCall`** — un Employé ne peut puncher que sur un call
  de service qui lui est assigné (plusieurs employés possibles par call,
  voir Appels de service ci-dessous); les autres rôles ne sont pas
  limités ainsi; le Magasinier n'a jamais de rôle dans les appels de
  service, punché ou non.
- **Classes facturables visibles par tout employé — corrigé le 20 août
  2026** (bogue trouvé en testant avec le compte Employé) : la route de
  lecture des classes (`GET /api/settings/tech-levels`, libellé
  seulement) est déclarée AVANT le `.use()` qui gate le reste du module
  Paramètres à Direction seulement — chaque employé doit pouvoir choisir,
  à chaque punch, laquelle de ses classes s'applique.
- **Correction d'un punch déjà approuvé** (`updateTimeEntry`) : Direction
  peut corriger n'importe quand (`canApprovePunch`), un Employé seulement
  avant approbation et sur son propre punch (`canEditOwnPunch`). Une
  correction Direction sur un punch déjà approuvé le **repasse en
  `submitted`** plutôt que de modifier silencieusement un enregistrement
  verrouillé. Un changement de référence (projet/call/interne) est
  journalisé (`logPunchReassignment`, journal d'audit).
- **Suppression (corbeille)** : Direction seulement (`canDeleteTimeEntry`,
  même palier que les autres corbeilles du projet), confirmé le 20 août
  2026, pour corriger une erreur de punch.
- **Sélecteur de tâche en cascade catégorie → tâche** et **entrée manuelle
  en lot** (plusieurs lignes soumises ensemble, avec suivi du nombre déjà
  enregistré pour ne jamais resoumettre en double après une erreur en
  cours de lot) — confirmés le 19 août 2026.
- **`blockageNote`** — champ libre à la saisie (punch minuté ou entrée
  manuelle) pour signaler un blocage (« pièce manquante, en attente d'une
  information ») — affiché comme badge « Blocage signalé » dans la vue
  Direction (`TimePunchPage.tsx`).
- **Call de service « lié » à un projet/roulement** (27-28 août 2026, voir
  module Appels de service ci-dessous) : `TimeEntry.projectId`/`rollingId`
  suit automatiquement `ServiceCall.projectId`/`rollingId` quand le call
  punché est lié — jamais forcé à nul dans ce cas, contrairement à un call
  non lié.

# Module Appels de service (confirmé le 18-19 août 2026)

Nouveau module (aucun équivalent v01). **Cycle confirmé** : résumé
obligatoire → signature client → approbation Direction → envoi à
Administration pour facturation. Numérotation `CS-AAAA-NNNN`
(`Settings.nextServiceCallNumber`, même patron que les autres
numérotations sans remise à zéro annuelle à ce jour).

- **Deux totaux séparés, jamais mélangés** (`serviceCallLaborTotals`,
  `service-calls.ts`) — coût réel de main-d'oeuvre
  (`TimeEntry.costRate`, gelé au punch) et prix de vente (tarif de la
  classe facturable choisie au punch, ou `PunchableTask.specificServiceRate`
  quand renseigné — remplace le taux de classe pour CETTE tâche
  précise sans jamais toucher le coût réel, confirmé le 20 août 2026).
  Seuls les punchs **approuvés** comptent dans les totaux — un punch
  encore `submitted` apparaît dans la liste « Temps consigné » mais reste
  hors total, avec une note explicative dédiée dans l'écran (« X punch(s)
  en attente d'approbation — pas encore compté(s) dans la main-d'oeuvre
  ci-dessous », confirmée le 20 août 2026).
- **`canSeeServicePricing`** (Direction, Administration, Propriétaire) —
  le technicien (Employé) ne voit **jamais** de prix, même après
  signature client; la carte « Demande et coordonnées » (nom, adresse,
  téléphone, courriel, entreprise, demande), elle, reste visible à tous
  (confirmé le 20 août 2026) — seuls les montants sont gatés.
  `canPriceServiceParts` (tarifer une pièce, coût réel saisi après coup,
  prix de vente = `saleFromCost`, jamais réimplémenté) reste Direction
  seulement.
- **Plusieurs techniciens assignés au même call** — confirmé le 19 août
  2026, citation directe de l'utilisatrice : « ils doivent parfois y
  aller à deux techniciens » (`ServiceCall.assignedEmployees`,
  plusieurs-à-plusieurs; réassignation = `canReassignServiceCall`,
  Direction et Administration).
- **Signature** : capturée comme image (`dataUrl`) directement dans
  `signatureImageUrl` — aucune vraie infrastructure de stockage de
  fichiers cette passe (photos exposées en lecture seule, téléversement
  réel différé, non utilisées durant la période de test selon la
  spécification, jamais une étape obligatoire du cycle). **Nom du
  signataire obligatoire** et capturé dans une fenêtre contextuelle dédiée
  (pas inline) — confirmé le 20 août 2026, en plus d'une case à cocher de
  déclaration.
- **`canApproveServiceCall`/`canSendServiceCallToAdmin`** — Direction
  seulement pour les deux, même porte que `canRequestInvoice` (écart
  trouvé dans la v19 vérifiée : ces deux actions n'y avaient aucune
  vérification de rôle — jamais réintroduit ici). Approuver exige résumé
  ET signature déjà faits. Envoyer à l'administration crée le jalon de
  facturation (un seul jalon à 100 % du total réel — pas de cycle à 4
  jalons comme un projet) et pose `requestedAt` immédiatement : l'envoi
  EST la demande, pas de « Demander » séparé comme pour un projet.
- **Suppression (corbeille)** — Direction seulement (`canDeleteServiceCall`),
  confirmé le 19 août 2026, même mécanisme que les autres corbeilles.
- **Titre distinct de la description** — champ `title` court, TOUJOURS
  saisi par la personne qui crée le call, jamais copié depuis
  `request`/`summary` d'une demande (confirmé le 27 août 2026);
  `serviceCallDisplayTitle` retombe sur `request` pour les calls créés
  avant l'ajout de ce champ — utilisé partout où un call est affiché
  (liste, détail, rapports, facturation, dossiers liés).
- **Conversion directe depuis une demande client** — même mécanique que
  Budgétaire↔Demande (statut posé à `converted` + lien créés dans la
  MÊME transaction que le call). Restreinte à `requestType === "service"`
  du 27 au 31 août 2026, **puis retirée** : depuis le 31 août 2026,
  n'importe quelle demande peut être convertie en call quel que soit son
  type déclaré au départ (même logique que « Créer le budgétaire » —
  la disposition réelle d'une demande est une décision de Direction, pas
  figée par ce que le client a coché).
- **Call « lié » à un projet** (sous-garantie, confirmé le 27 août 2026) —
  `ServiceCall.projectId`, plusieurs calls peuvent viser le même projet
  (plusieurs visites, pas d'unicité comme pour `clientRequestId`). Les
  heures/achats punchés sur ce call comptent quand même dans le projet
  (voir Punch d'heures ci-dessus), mais `sendServiceCallToAdmin` **refuse
  la facturation séparée** tant que `projectId` (ou, depuis le 28 août
  2026, `rollingId`) est renseigné — le même travail ne se facture jamais
  deux fois.

Vérifié de bout en bout contre une vraie base de données au moment de la
construction de ces deux modules (18-20 août 2026, corrections/ajouts
datés individuellement ci-dessus jusqu'au 31 août 2026) — cette mise à
jour du document découle d'une relecture directe de
`packages/business-rules/src/{punch,service-calls}.ts`,
`apps/api/src/modules/{timeEntries,serviceCalls}/service.ts` et
`roles.ts`.

---

# Module Contacts (confirmé le 19 août 2026)

Carnet d'adresses — simple, pas d'ambiguïté. La plupart des contacts
s'enregistrent déjà automatiquement (`ensureContactRow`, appelé par
Demandes clients/Budgétaire/Appels de service/Projet) — ce module ajoute
la **consultation** (avec les dossiers liés : demandes, projets,
roulements, appels de service, livraisons) et la **création/modification
manuelle**, nécessaire pour les contacts jamais créés par ce mécanisme
(ex. fournisseurs).

- **Permission unique** : `canAccessOverviewViews` — pas de distinction
  consultation/modification confirmée.
- Fiche détail = liste des 5 types de dossiers liés
  (`ContactDetailDto.{clientRequests,projects,rollings,serviceCalls,
  deliveries}`), chacun avec son propre `displayId` réel (jamais un
  identifiant tronqué présenté comme un vrai numéro).
- **Composant `ContactAutocomplete.tsx` partagé** entre le formulaire de
  demande client, le formulaire de budgétaire et le formulaire d'appel de
  service — un seul mécanisme de recherche/autofill entreprise-contact,
  jamais dupliqué 3 fois.
- **Corrigé au passage de cette mise à jour de spécification** : la
  vignette « Roulement » liée sur une fiche contact affichait le texte
  générique « Roulement » au lieu du vrai `rollingNumber`
  (`RL-AAAA-NNNN`) — reliquat d'avant le 31 août 2026 (date à laquelle
  Roulement a reçu sa propre numérotation), jamais mis à jour dans ce
  module précis. `getContactDetail` (`contacts/service.ts`) utilise
  maintenant `row.rollingNumber` directement.

# Projet — création directe (confirmé le 9 août 2026, construite le 19 août 2026)

Deuxième filière de création d'un projet, hors conversion d'un
budgétaire — `canCreateProjectDirectly` (Direction et Propriétaire).
Aucun budgétaire à l'origine : tous les champs $ (`sold`, `plannedHours`,
`targetMarginPct`, etc.) restent à leur valeur par défaut du schéma —
pas de plan de facturation généré à la création (rien de réel à répartir
tant qu'aucun prix vendu n'est connu).

- **`updateProjectPlanning`** (demandé le 19 août 2026 : « certaines
  soumissions se vendent seulement avec un montant global, sans détail
  d'heures par catégorie ») — remplit après coup les champs qu'un
  budgétaire aurait normalement fournis (`sold`, `plannedHours`,
  `plannedPurchases`, `installationPlannedHours`,
  `installationPlannedCost`). **Chaque champ est indépendant, jamais
  dérivé d'un autre** — remplir `plannedHours` ne recalcule jamais
  `sold`, et vice-versa. Réservé aux projets SANS budgétaire d'origine :
  sur un projet converti, ces mêmes champs restent gelés depuis la
  conversion. `targetMarginPct` reste volontairement toujours nul pour un
  projet créé directement.
- **Plan de facturation généré une seule fois** — la première fois que
  `sold` devient `> 0` sur un projet qui n'a encore aucune entrée de plan
  (même `computeBillingPlan` que `convertBudgetToProject`, jamais
  réimplémenté). Un `sold` déjà facturé n'est plus jamais retouché ici,
  mais reste modifiable — seul le plan déjà généré reste gelé.
- **Conversion directe d'une demande client en projet — confirmé le 31
  août 2026** (même jour que l'assouplissement équivalent pour les
  Appels de service ci-dessus) : `Project.clientRequestId` (`@unique`,
  contrairement à `budgetId`/`serviceCallId` qui vivent sur
  `ClientRequest`) — une demande déjà liée à un projet ne peut pas l'être
  deux fois.

# Module Tableau de bord (confirmé le 21 août 2026)

Confirmé (spécification) : « vue de synthèse personnalisée par
utilisateur ». **Reste accessible à TOUS les rôles** — c'est la route
`/`, la cible de repli de `RequireRole` quand un rôle est refusé
ailleurs (la restreindre créerait une boucle de redirection infinie pour
Employé/Magasinier). La restriction de visibilité financière s'applique
donc au CONTENU seulement, jamais à la route elle-même.

- **Chaque compteur réutilise une fonction déjà vérifiée d'un autre
  module** (`listProjects`, `listRollings`, `listBudgets`,
  `listInvoiceEntries`, `listMyTimeEntries`, `listDeliveries`,
  `getActionCenterItems`, `getChannelConversion`) — jamais une deuxième
  requête divergente.
- **« Appels de service actifs » délibérément omis** : `ServiceCall.status`
  n'est en fait jamais mis à jour nulle part dans le code (toujours
  `"scheduled"`) — un compteur basé dessus serait trompeur, pas juste
  incomplet.
- **Marge du portefeuille actif** — pondérée par le prix vendu (somme des
  marges ÷ somme des prix vendus sur les projets actifs), jamais une
  moyenne simple des % par projet (qui pèserait un projet à 500 $ autant
  qu'un à 500 000 $).
- **Enrichissements confirmés le 23-25 août 2026** (au-delà des quelques
  compteurs simples voulus au départ, avant la construction du Centre
  d'actions) : solde à recevoir + factures récemment envoyées (mêmes
  chiffres que Facturation) — pipeline de conversion par canal de vente
  rejoué tel quel depuis Rapports, citation directe de l'utilisatrice :
  « le but d'un tableau de bord est justement de voir rapidement tout ce
  qui est actif », donc pas seulement un lien vers Rapports — santé des
  projets actifs (mêmes champs que la liste Projets, limité aux 8 premiers)
  — mini-aperçu du Centre d'actions (6 premiers items, même liste déjà
  calculée, jamais un second calcul).
- **Heures de la semaine courante** (`myWeekHours`, lundi-dimanche —
  affichage seulement, jamais une règle de paie) et **entrées en
  attente** (`myPendingEntriesCount`) — visibles à tous, y compris
  Employé/Magasinier. Magasinier reçoit en plus le compte de ses
  livraisons planifiées assignées.

# Module Centre d'actions (confirmé le 21 août 2026)

Citation directe de l'utilisatrice : « chaque action qui demande un
traitement, une approbation, etc se retrouve dans le centre d'action des
vues Propriétaire, Administration et Direction » — point central de
l'application. **Chaque item réutilise le calcul déjà vérifié d'un autre
module, jamais une deuxième règle divergente.** Neuf types réels
(`ActionItemType`), chacun gardé par la même fonction de permission que
son action de traitement :

- **Budgétaire à approuver** (`budget_approval`) — `canApproveBudgetForSending`,
  brouillon avec résumé ET risques déjà remplis.
- **Achat à approuver** (`purchase_approval`) — rejoue **exactement**
  `canApprovePurchaseRequest` avec les vrais paramètres de délégation et
  les seuils gelés à la soumission, jamais une approximation
  `owner_pending → Direction` qui ignorerait un délégué actif ou
  l'escalade de seuil.
- **Commande à passer** (`purchase_to_order`, ajouté le 26 août 2026) —
  achat déjà AUTORISÉ, en attente que la commande soit effectivement
  passée (`fulfillmentStatus === "waiting"`) — `canManagePurchaseFulfillment`,
  jamais l'escalade de seuil de l'approbation ci-dessus, une étape qui
  suit toujours l'autorisation.
- **Facturation à traiter** (`invoicing`) — `canCreateInvoiceRecord`,
  demandée mais pas encore enregistrée.
- **Nouvelle demande client** (`client_request_new`, ajouté le 23 août
  2026 — rapport de l'utilisatrice : une demande fraîchement entrée doit
  être visible immédiatement) — `canCreateClientRequest`, statut `"new"`.
- **Suivi dossier** (`followup_due`, ajouté le 31 août 2026) — date de
  relance (`nextFollowUp`) arrivée ou dépassée; même audience que
  l'item précédent; `listClientRequests()` exclut déjà les demandes
  converties/perdues, donc un suivi ne peut jamais rester affiché après
  résolution.
- **Demande transmise** (`client_request_transmitted`) — signal
  spécifiquement destiné au Propriétaire (persona `boss`) seul, distinct
  et complémentaire de « Nouvelle demande client ».
- **Assemblage à préparer** (`subassembly_ready`) — `canPrepareSubassemblyPartsList`,
  assemblage déclaré prêt par le designer (Marc), en attente que
  Direction crée la liste de pièces. Porte `projectId` séparément (31 août
  2026, rapport de l'utilisatrice : l'id de l'item est celui de
  l'assemblage, pas un uuid de projet — le lien amenait sur la liste
  complète des projets, pas le bon).
- **Heures à approuver** (`hours_approval`, ajouté le 26 août 2026 —
  rapport de l'utilisatrice : la catégorie n'existait pas alors que les
  achats avaient la leur) — `canApprovePunch`, rejoue
  `listTimeEntriesForApproval` tel quel.

Vérifié contre le code actuellement en place (`actionCenter/service.ts`,
`dashboard/service.ts`, `contacts/service.ts`, `projects/service.ts`) —
cette mise à jour du document découle d'une relecture directe, jamais
d'une supposition.

---

# Sous-assemblages (« Assemblage »), Avenants, Gantt de production

Les RÈGLES pures de `subassembly.ts` (voir plus haut, section « Le
sous-assemblage de conception ») et `amendments.ts` (voir plus haut,
section « Avenants ») ont été **confirmées le 9 août 2026** — mais
jamais construites (schéma/API/interface) avant le **21 août 2026**,
avec le Gantt de production v1. Ce qui suit couvre uniquement cette
construction et ce qui a changé depuis.

## Sous-assemblages / Assemblage — construction (confirmé le 21 août 2026)

- **`canDeclareSubassembly` — corrigé le 21 août 2026** (rapport de
  l'utilisatrice : « sous-assemblage toujours Marc (propriétaire) ») :
  Propriétaire réel SEULEMENT (persona `boss`) — jamais Direction,
  Administration, Employé ou Magasinier, contrairement à un premier jet
  qui l'ouvrait à tout employé. `canPrepareSubassemblyPartsList` (créer
  la liste de pièces) et `canDeclareAssemblyReady` (débloquer la tâche
  d'Assemblage) restent Direction seulement (`ROLES.OWNER`) — trois
  gestes, trois rôles différents.
- **Centre d'actions** : un sous-assemblage déclaré prêt (`pending_parts_list`)
  atterrit sous « Assemblage à préparer » (`subassembly_ready`, voir
  section Centre d'actions ci-dessus).
- **Renommage « Assemblage » — 31 août 2026, UI seulement** : le module
  s'affiche désormais « Assemblage » dans l'interface
  (`ProjectSubassemblies.tsx`, Centre d'actions) — **rien n'a changé en
  interne** (modèle Prisma `Subassembly`, fichiers, fonctions
  `declareSubassemblyReady`/`markPartsListReady`, tous inchangés). Voir
  CLAUDE.md pour le détail complet du piège de nommage et les deux
  confusions déjà tranchées avec l'utilisatrice (`declareAssemblyReady`
  ≠ la déclaration de Marc; le « sous-assemblage » du module Checklist
  est un concept totalement différent et sans lien).
- **Partie 1 — liste de pièces : fenêtre contextuelle + reste planifié
  (confirmé le 31 août 2026)**, en réaction à un rapport de test de
  Marie : la création de la liste de pièces (Direction, sept champs fixes —
  les 5 Fabrication-X, Programmation, Assemblage — jamais de marge/achats/
  description, seulement des heures) affiche maintenant, sous chaque
  champ, le **reste planifié au budgétaire du projet** pour cette
  catégorie : la ligne budgétaire correspondante (Fabrication-X exacte;
  Programmation = « Programmation » + « Panneau & Schémas » additionnées;
  Assemblage = « Assemblage » + « Test & Finition » + « Emballage » +
  « Ménage » additionnées), **moins ce que les AUTRES assemblages du même
  projet ont déjà déclaré** pour cette même sous-catégorie
  (`getRemainingHoursByCategory`, `subassemblies/service.ts`) — calcul
  STATIQUE (basé sur ce qui est déjà soumis), pas un décompte en direct
  pendant la saisie du formulaire courant. Repose sur `BudgetRow.slug`
  (copié depuis `BudgetModelRow.slug` à la création du budgétaire,
  existait déjà en seed mais n'avait jamais de consommateur avant cette
  date). **Rien affiché si le projet n'a pas de budgétaire d'origine**
  (création directe) — jamais une erreur ni un 0 trompeur.

## Avenants — construction (confirmé le 21 août 2026)

Règles inchangées (voir section « Avenants » plus haut, 9 août 2026) —
construction du schéma (`Project.nextAmendmentNumber`), de l'API et de
l'interface (`ProjectAmendments.tsx`). Compléments confirmés
individuellement après coup :

- **Fenêtre contextuelle avec catégories fixes et totaux en direct**
  (24 août 2026) — remplace un formulaire à lignes dynamiques.
- **Marge par défaut = marge visée du projet** (`Project.targetMarginPct`,
  20 août 2026) plutôt qu'une valeur neutre à ressaisir à chaque fois.
- **Sous-catégories de Fabrication restaurées** (plasma/pliage/usinage/
  soudage/peinture, 24 août 2026) et **champ description facultative**
  (24 août 2026).

## Gantt de production — v1, tableau simple (confirmé le 21 août 2026)

Version volontairement simple à la construction initiale : un tableau à
dépendances (`ProjectTask.assignedEmployeeId`, affectation manuelle
directe), **sans dates ni capacité** — le moteur automatique était
délibérément reporté à une phase séparée. `canEditGanttSchedule`
(Direction seulement) garde l'édition; les autres rôles consultent.

## Gantt de production — moteur de planification automatique (confirmé le 31 août 2026)

Nouveau module de règles pures, `gantt-schedule.ts` (`packages/business-rules`)
— reprend la forme du moteur déjà conçu et validé dans la référence v19
(jamais construit dans GSC Pilot avant cette date), en particulier le cas
du goulot d'étranglement à un seul employé qualifié, vérifié correct dès
le 9 août 2026. **Explicitement HORS scope** : le mini Gantt de conception
de Marc (`subassembly.ts`, jamais touché) — ce moteur planifie
uniquement les tâches déjà générées par les Assemblages ou les Avenants,
jamais leur création.

- **Principe central** : une date ici est TOUJOURS PRÉDITE (sert à
  enchaîner les tâches dépendantes et à afficher les barres), **jamais**
  la complétion réelle — qui reste `ProjectTask.ganttCompleted`, un
  geste 100 % manuel de Direction. Le calendrier est toujours recalculé
  au complet à la lecture, jamais une date stockée (même principe que
  `progressionPct`/statut financier ailleurs dans l'application).
- **Semaine québécoise** : lundi-jeudi 8,5 h, vendredi 4 h, week-end 0.
  **Horizon dynamique** : toujours 30 jours ouvrables à partir
  d'aujourd'hui, jamais une plage calendaire fixe.
- **Entrée au Gantt — geste explicite, jamais automatique** :
  - Un **Roulement** entre TOUJOURS en entier, via `activateRollingGantt`
    (bouton « Activer », avec heures par catégorie saisies à ce moment —
    les `ProjectTask` n'existent pas avant ce geste, contrairement à un
    Projet).
  - Un **Projet** entre par choix de Direction (`enterProjectGanttBatch`,
    fenêtre contextuelle à deux boutons) : soit un LOT précis (assemblage
    ou avenant, tamponne les `ProjectTask` déjà créées via
    `enteredGanttAt`/`enteredGanttById`), soit `whole_project` (pose
    `Project.ganttAutoEnter = true` — tout, maintenant et pour l'avenir,
    lu à chaque calcul). Ce geste ne touche **jamais**
    `subassemblies/service.ts` ni `amendments/service.ts`.
  - `listGanttReadyQueue` — file « prêt mais pas encore entré » (lots de
    projet + roulements pas encore activés), toujours visible.
- **Priorité et départage** : `Project.priority` (Direction, éditable
  manuellement, `updateProjectGanttPriority`, `canEditGanttSchedule` —
  délibérément DISTINCT de `canManageProject`, un levier de planification
  pas une info administrative) ou `Rolling.priority` **+ un bonus
  structurel de +2** (`ROLLING_PRIORITY_BONUS`, repris tel quel du moteur
  v19) — un Roulement passe « presque toujours » avant un Projet (son
  stock est physiquement arrivé, il est réellement prêt à démarrer
  MAINTENANT), jamais une règle absolue : un Projet à priorité manuelle
  assez élevée peut encore passer devant. Départage ensuite par échéance
  (`Project.deadline`/`Rolling.dueDate`).
- **Algorithme** — jour par jour dans l'horizon : tâches admissibles
  (dépendances déjà prédites complétées STRICTEMENT AVANT ce jour, jamais
  un enchaînement le jour même) triées priorité DESC puis échéance ASC,
  consommant la capacité disponible des employés qualifiés dans cet
  ordre. Une tâche = un seul employé à la fois (`ProjectTask.minPeople`/
  `maxPeople` existent dans le schéma mais restent hors scope, aucune
  exigence confirmée ne le demande).
- **Efficacité par compétence** (`Employee.skillEfficiencies`, 0-200 %) —
  étire ou compresse le calendrier (20 h réelles à 50 % d'efficacité =
  40 h de calendrier), mais n'affecte JAMAIS le budgétaire/heures/
  post-mortem, qui restent sur les heures réelles. Sans pourcentage
  explicite mais compétence listée : 100 % par défaut; sans la compétence
  du tout : 0 (pas qualifié).
- **`pinnedEmployeeId`** (`ProjectTask.assignedEmployeeId`) — depuis le
  moteur automatique, une affectation manuelle devient une **dérogation
  optionnelle** (le moteur choisit seul si vide), jamais une affectation
  obligatoire comme en v1. Une compétence absente ne bloque pas un
  employé imposé — dérogation volontaire déjà permise, traitée comme
  100 % plutôt que 0 (sinon aucune heure ne serait jamais consommée).
- **Interruptions** (`Interruption`, nouveau module `interruptions/`) —
  employé précis OU tout l'atelier (`employeeId` nul), heures partielles,
  validées contre la vraie capacité de CE jour précis
  (`validateInterruptionHours` — jamais un maximum arbitraire côté
  client, ex. 8,5 h un vendredi où la vraie capacité n'est que 4 h).
  Direction seulement (`canEditGanttSchedule`), lecture pour tous. Huit
  motifs (`INTERRUPTION_REASONS`) : absence, vacances, appel de service
  urgent, livraison, formation, maintenance interne, **jour férié**, autre
  — ce dernier motif a été AJOUTÉ (aucun équivalent dans la liste
  d'origine confirmée) plutôt que de glisser un jour férié sous
  « Autre »; **non re-confirmé mot pour mot avec l'utilisatrice**, à
  signaler si elle préfère l'inverse. Aucun jour férié québécois
  pré-rempli — un seul mécanisme uniforme, Direction les entre comme
  n'importe quelle interruption tout-atelier.

Vérifié contre le code actuellement en place
(`packages/business-rules/src/{subassembly,amendments,gantt-schedule}.ts`,
`apps/api/src/modules/{subassemblies,gantt,interruptions}/service.ts`,
`roles.ts`) — cette mise à jour du document découle d'une relecture
directe, jamais d'une supposition. Les décisions notées ci-dessus comme
« non re-confirmées mot pour mot » restent des interprétations
raisonnables du plan approuvé avec l'utilisatrice avant construction, pas
des confirmations verbatim — à vérifier avec elle si un doute survient.

---

# Module Checklist de production (confirmé le 21 août 2026)

NOUVEAU module (aucun port), **indépendant du module Sous-assemblages** —
confirmé explicitement par l'utilisatrice, aucun lien de schéma malgré le
nom proche (voir CLAUDE.md, piège de nommage). Suit les pièces
**fabriquées à l'interne** (catalogue configurable d'étapes, ex.
MEP→DXF→Plasma→Pliage→Usinage→Soudage→CQ→Peinture) — jamais les pièces
achetées, qui restent la liste rapide d'achats déjà existante.

- **Modèle** : une checklist = un contenant (projet + assemblage libre
  optionnel, texte libre). Un item = une pièce OU un sous-assemblage
  (regroupement propre à CE module, sans lien avec `Subassembly`) — un
  item « pièce » peut avoir un parent « sous-assemblage » de la même
  checklist; un « sous-assemblage » reste toujours racine.
- **États à 3 niveaux par étape** (`ProductionChecklistItemStep`) :
  inactive (grisée, ne s'applique pas) / active + non complétée / active +
  complétée. `active` se choisit UNE FOIS par Direction à la création —
  cocher une étape à la création **ne la marque jamais complétée**
  (précision explicite du 21 août 2026).
- **Un item disparaît de la vue active** une fois toutes ses étapes
  actives complétées, mais reste enregistré en permanence (vue archive
  par projet, jamais supprimé) — confirmé le 26 août 2026 : un
  sous-assemblage ET ses pièces enfants disparaissent ensemble de la vue
  active.
- **`canManageProductionChecklist`** (créer/ajouter) = Direction
  seulement; **`canAccessProductionChecklist`** (voir, cocher une étape) =
  tout le monde SAUF Magasinier (« le Magasinier n'a pas de travail
  d'atelier de fabrication »).
- **Unicité du numéro de pièce par PROJET**, tous checklists confondus
  (deux projets différents peuvent réutiliser le même numéro, jamais
  deux items du même projet) — **avertissement contournable**
  (`force: true`, « Ajouter quand même »), jamais un blocage définitif.
- **Rework de navigation (26 août 2026)** : structure à 3 niveaux
  (projets actifs avec checklist → checklists du projet → items filtrés),
  remplace une vue transversale unique — 3 catalogues Paramètres
  (Épaisseur/Matériau/Étape) fusionnés visuellement en une seule section
  à cette occasion (présentation seulement, restent 3 modèles Prisma
  séparés). Catalogues : « supprimer » = désactiver seulement (même
  patron que les catégories d'achat) — les items déjà créés gardent leur
  valeur figée en texte, jamais invalidée rétroactivement.

# Module Scan QR (confirmé le 23 août 2026)

Étiquette 1×1 po par projet, scannable (caméra, `qr-scanner` — jamais
`BarcodeDetector`, peu fiable sur iOS, décision technique du plan de
fondation) ou saisie manuelle en repli, toujours disponible même caméra
indisponible/refusée.

- **Résolution par rôle, un seul branchement (`canAccessOverviewViews`)** :
  Direction/Administration/Propriétaire → ouvre la fiche projet (et ses
  achats); Employé/Magasinier → ouvre directement le choix de tâche à
  puncher (Propriétaire et Magasinier non nommés dans la spec d'origine,
  confirmés séparément le 23 août 2026 : Propriétaire suit Direction/
  Administration, Magasinier suit Employé).
- **Étendu aux roulements le 28 août 2026** (`rollingNumber RL-AAAA-NNNN`)
  — même résolution, mais **sans cache hors ligne** contrairement aux
  projets : un code de roulement scanné hors ligne échoue proprement avec
  un message d'erreur plutôt que d'étendre le sous-système hors-ligne
  sans que ce soit demandé.

# Mode hors ligne (confirmé le 23 août 2026)

**Limité à 3 tâches de terrain**, spec confirmée : punch d'heures
(chronomètre en direct inclus), scan QR (raccourci de punch seulement),
appel de service (données terrain seulement). Isolé dans
`apps/web/src/offline/` — aucun autre écran n'importe ce dossier,
impossible d'écrire hors ligne ailleurs par accident.

- **Outbox** (Dexie/IndexedDB, `apps/web/src/offline/db.ts`) — chaque
  action est un item **indépendant et ré-essayable** (jamais un gros item
  combiné), pour ne jamais rejouer une pièce déjà ajoutée si une étape
  suivante échoue à la synchronisation. Cinq types :
  démarrer/arrêter un punch, modifier un call, ajouter une pièce à un
  call, capturer une signature.
  `flushOutbox` rejoue dans l'ordre de création, un item à la fois — un
  échec n'empêche pas d'essayer les suivants.
  - **Chronomètre local** (`LocalActiveEntry`, clé fixe `"active"`) —
    démarré hors ligne, lu en plus de l'entrée active du serveur.
  - **Copie locale des projets/roulements punchables** (`cachedProjects`)
    — rafraîchie à chaque chargement en ligne, pour que le Scan QR et le
    punch fonctionnent hors ligne même après un redémarrage sans réseau.
  - **`PendingStop`** — une entrée serveur arrêtée hors ligne reste cachée
    de l'affichage « active » jusqu'à ce que la synchronisation confirme
    l'arrêt côté serveur (évite un double-arrêt visuel).

# Délégation d'approbation (confirmé le 7-8 août 2026, construite le 23 août 2026)

Les règles (voir plus haut, section « Délégation d'approbation ») étaient
déjà confirmées avant le 14 août 2026 — `delegationActive`/`actsAsDirection`
déjà écrites et branchées partout dans `roles.ts` depuis le port initial.
La construction du 23 août 2026 n'ajoute que la **gestion réelle**
(créer/révoquer/lister des `DelegationGrant`), rien côté permissions :

- **Une seule délégation active/à venir à la fois** — une nouvelle
  création est refusée tant qu'une délégation non révoquée n'est pas déjà
  expirée, pour éviter toute ambiguïté (`loadDelegationSettings` ne
  charge jamais qu'une seule délégation à la fois).
- Déléguer seulement à Propriétaire ou Administration (jamais Employé/
  Magasinier), catégorie(s) parmi `hours`/`purchases`/`service`/`changes`
  (au moins une), justification obligatoire, date de fin ≥ date de
  début. `canGrantDelegation` = Direction seulement.
- **Corrigé le 1er septembre 2026** (cette même session) : un test de
  `roles.test.ts` sur les fenêtres de délégation dépendait de l'horloge
  réelle (`new Date()`), devenu instable avec le temps — fixé avec
  `vi.useFakeTimers()` dans le test seulement, `roles.ts` lui-même
  jamais modifié (rappel CLAUDE.md : ce fichier ne se modifie jamais).

Vérifié contre le code actuellement en place
(`apps/api/src/modules/{checklists,settings/delegation}.ts`,
`apps/web/src/features/qrScan/QrScanPage.tsx`,
`apps/web/src/offline/{db,sync}.ts`, `roles.ts`) — cette mise à jour du
document découle d'une relecture directe, jamais d'une supposition.
