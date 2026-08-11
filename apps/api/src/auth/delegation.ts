import { prisma } from "../db.js";
import type { DelegationSettings, DelegationCategory } from "@gsc-pilot/business-rules";

/**
 * Trouve la délégation active en ce moment (s'il y en a une) et la
 * transforme dans la forme attendue par roles.ts (delegationActive) —
 * patron d'adaptateur : la base de données garde un historique complet
 * (DelegationGrant), roles.ts ne connaît qu'« y a-t-il une délégation
 * active, et pour qui ».
 */
export async function loadDelegationSettings(): Promise<DelegationSettings> {
  const now = new Date();
  const grant = await prisma.delegationGrant.findFirst({
    where: {
      revokedAt: null,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    include: { delegate: true },
    orderBy: { createdAt: "desc" },
  });
  if (!grant) return { delegation: null };
  return {
    delegation: {
      delegatePersona: grant.delegate.persona,
      start: grant.startDate.toISOString().slice(0, 10),
      end: grant.endDate.toISOString().slice(0, 10),
      permissions: grant.categories as DelegationCategory[],
    },
  };
}
