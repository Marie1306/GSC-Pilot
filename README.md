# GSC Pilot

Outil de gestion interne pour l'atelier de GSC Automation. Voir
[`CLAUDE.md`](./CLAUDE.md) pour l'orientation technique et
[`docs/handoff/`](./docs/handoff/) pour les règles métier confirmées
(source de vérité) et l'architecture technique confirmée.

## Démarrage

```bash
nvm use            # Node 22
npm install
cp apps/api/.env.example apps/api/.env   # remplir avec le projet Supabase
cp apps/web/.env.example apps/web/.env
npm run db:migrate
npm run db:seed
npm run dev
```

- API : http://localhost:3000
- Interface : http://localhost:5173

## Structure

```
packages/business-rules/   # logique métier pure, testée (roles, backup, marge, facturation, ...)
packages/shared/            # types, schémas de validation, jetons de conception
apps/api/                   # serveur Express + Prisma
apps/web/                   # interface React + Vite (PWA)
docs/handoff/                # règles métier et architecture confirmées — source de vérité
```

## Tests

```bash
npm test            # une seule fois
npm run test:watch  # mode continu
```
