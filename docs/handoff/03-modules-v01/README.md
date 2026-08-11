# GSC Pilot v01 — fondation, pas une refonte complète

## Ce que c'est

Un début propre, pas une recréation complète de la v19. Ça couvre exactement ce
qu'on a vérifié ensemble dans ce fil : le back-up d'heures et la marge/prix de
vente. Chaque formule vient du dossier de vérification v19, pas de ma mémoire —
`test.js` rejoue les mêmes scénarios (BKP-01, BKP-02, BKP-03, BUD-04, MARG-01,
MARG-02) avec les mêmes chiffres, et passe.

## Pourquoi pas tout, tout de suite

Recréer la v19 au complet « à partir de tout ce que je sais déjà » aurait voulu
dire deviner une bonne partie de l'application — Gantt, facturation, appels de
service, roulements, statistiques internes, canaux de vente, le système de
niveaux techniques par employé, les 5 permissions par rôle sur chaque action…
Je n'ai lu en détail qu'une fraction du fichier v19 (ce qu'on a vérifié
ensemble). Inventer le reste pour un outil qui gère de vrais budgets et de
vrais employés, c'est exactement le genre de risque que le dossier de
vérification demandait d'éviter (« ne pas déduire qu'une valeur absente doit
être inventée »).

Et il y a plus simple à éviter : si je rends tout dans un seul fichier HTML
géant comme avant, je reproduis le problème qu'on vient de diagnostiquer
ensemble sur AM Installation — juste avec ma signature à la place de celle de
ChatGPT.

## Ce que ce v01 fait différemment

- **Une fonction, un endroit.** `eligibleHours()` dans `backup.js` est la
  SEULE définition de la règle du back-up dans tout le projet. Impossible
  d'avoir cinq versions divergentes comme dans la v19.
- **Des tests qui tournent pour de vrai** (`node test.js`), pas juste des
  `assert()` collés dans le fichier de prod. Un changement qui casse la règle
  du back-up serait attrapé avant même d'arriver dans le navigateur.
- **Aucun état figé implicitement.** Le gel du taux historique
  (`budget.backupHourlyRate`) est explicite et documenté dans le code — pas un
  effet de bord d'une fonction de migration qui ne se redéclenche jamais.

## Fichiers

- `backup.js`, `margin.js` — logique du back-up d'heures et de la marge.
- `roles.js` — rôles et permissions, source unique pour tout `persona === "..."`.
- `test.js`, `roles.test.js` — `node test.js` et `node roles.test.js` pour vérifier (46 tests au total).
- `index.html` — démo du back-up d'heures.
- `roles-demo.html` — démo de la matrice de permissions (choisir un rôle, activer la délégation).
  Comme pour `index.html`, les imports ES module ne fonctionnent pas en `file://`, donc
  ces pages reprennent la même logique en ligne, avec un commentaire qui le dit clairement.

## Pour la suite

Le reste de l'application est trop gros pour continuer comme ça, module par
module, collé dans le chat — c'est justement le genre de projet multi-fichiers
que Claude Code est fait pour porter correctement (avec de vrais tests à
chaque étape, sans jamais retomber dans un seul fichier de 20 000 lignes). On
peut aussi continuer ici si tu préfères avancer plus lentement, un module
vérifié à la fois.
