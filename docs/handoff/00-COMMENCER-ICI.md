# GSC Pilot — Guide de transfert vers Claude Code

Ce dossier contient tout ce qui a été confirmé et construit avant la
construction réelle de l'application. Ordre de lecture recommandé pour
Claude Code : **01 → 02 → 03 → 04**.

## 01-architecture/ — À lire en premier
`GSC_Pilot_Architecture.md` — la forme technique de l'application :
une seule appli web responsive, installable depuis le navigateur (pas
les magasins d'applications), vrai backend + base de données centrale,
hors ligne avec synchronisation, hébergement infonuagique. Contient
aussi ce qui reste **encore à trancher** : lequel des 3 hébergeurs
proposés (Supabase / Render / DigitalOcean).

**Ce qui n'a jamais été décidé et qui reste ouvert pour Claude Code** :
le langage/cadre technique précis (ex. React, Node.js, Python — rien
de tout ça n'a été choisi). Ce document couvre la forme et les
contraintes, pas l'implémentation. C'est une bonne première question à
poser à Claude Code une fois le contexte chargé.

## 02-specification-metier/ — La référence pour chaque règle
`GSC_Pilot_Specification_confirmee.md` — document vivant qui couvre
absolument toutes les règles métier confirmées au fil de nombreuses
conversations : back-up d'heures, marge, achats, budgétaire,
permissions par rôle (Direction/Administration/Propriétaire/Employé/
Magasinier), facturation, livraisons, avenants, Gantt et
sous-assemblages, etc. **La source de vérité** — si le comportement du
prototype v19 contredit ce document, c'est ce document qui a raison.

## 03-modules-v01/ — Code déjà construit, testé, prêt à réutiliser
Neuf modules JavaScript purs (aucune dépendance à un cadre ou une base
de données précise) — `backup.js`, `margin.js`, `roles.js`,
`internal-stats.js`, `billing.js`, `fulfillment.js`, `contacts.js`,
`audit-log.js`, `subassembly.js`, `amendments.js` — plus leurs fichiers
de tests (166 tests, tous verts au moment du transfert). Chaque module
encode une règle confirmée dans le document 02. **Ce code n'a pas
besoin d'être réécrit** — Claude Code peut l'adapter à la vraie base de
données plutôt que de repartir de zéro. Voir `README.md` dans ce
dossier pour le détail de chaque module.

## 04-reference-v19/ — Référence seulement, jamais la base du nouveau code
`GSC_Pilot_Prototype_v19_corrections.html` — le prototype construit par
ChatGPT (16 bugs trouvés et corrigés au fil de ce projet). **Ne pas
construire par-dessus ce fichier** — l'architecture est différente
(aucun serveur, tout dans le navigateur) et ne convient pas pour la
vraie version. Utile pour deux choses seulement : voir comment une
fonctionnalité était présentée visuellement (mise en page, libellés), et
éviter de reproduire les bugs déjà trouvés et documentés dans le
document 02.

## Statut au moment du transfert
- ✅ Règles métier confirmées et documentées au complet.
- ✅ Architecture technique de haut niveau confirmée.
- ✅ 9 modules de logique métier construits et testés (166 tests).
- ⬜ Choix du cadre technique (langage, base de données précise) —
  jamais discuté, à faire avec Claude Code.
- ⬜ Choix final de l'hébergeur parmi les 3 proposés.
- ⬜ Toute l'interface utilisateur — rien construit, seulement des
  démos isolées (`index.html`, `roles-demo.html` dans 03) pour
  illustrer certaines règles, pas une vraie interface.
- ⬜ Authentification réelle, base de données réelle, tout le reste de
  l'implémentation — pas commencé.
