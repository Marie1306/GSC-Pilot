/**
 * GSC Pilot — SEAO (nouveau module, 16 septembre 2026)
 *
 * Suivi des appels d'offres publics : dépôt des documents → analyse IA citée
 * (résumé + changements entre versions, voir apps/api/src/lib/ai/) →
 * chiffrage du bordereau (coût/marge saisis par un humain, description
 * suggérée par l'IA seulement à la première extraction, jamais réécrite
 * après coup) → suivi des concurrents → go/no-go → issue finale → conversion
 * en projet (réutilise createProjectDirect/updateProjectPlanning,
 * projects/service.ts, tous deux inchangés).
 */
import { seaoBordereauLineSalePrice, seaoBordereauTotal } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { ensureContactRow } from "../clientRequests/service.js";
import { resolveSequentialNumber } from "../settings/sequentialNumbers.js";
import { createProjectDirect, updateProjectPlanning } from "../projects/service.js";
import { STORAGE_BUCKETS, buildStoragePath, createSignedDownloadUrl, createSignedUploadTarget, type SignedUploadTarget } from "../../lib/storage.js";
import { uploadDocumentToAnthropic } from "../../lib/ai/documents.js";
import { runCitedCompletion } from "../../lib/ai/citedCompletion.js";
import { extractBordereauLines } from "../../lib/ai/structuredExtraction.js";
import { plainTextFromContent } from "../../lib/ai/content.js";

const BUCKET = STORAGE_BUCKETS.SEAO_DOCUMENTS;

function resolveNextSeaoNumber(settings: { nextSeaoNumber: number; seaoNumberYear: number }, year?: number) {
  return resolveSequentialNumber({ next: settings.nextSeaoNumber, year: settings.seaoNumberYear }, year);
}
function formatSeaoDisplayId(year: number, number: number): string {
  return `AO-${year}-${String(number).padStart(4, "0")}`;
}

async function loadSeaoFileOrThrow(id: string) {
  const file = await prisma.seaoFile.findUnique({ where: { id }, include: { contact: { select: { name: true, company: true } } } });
  if (!file) throw new HttpError(404, "Dossier SEAO introuvable.");
  return file;
}

/** Résolution groupée des noms d'employé depuis des id scalaires (createdById/uploadedById/authorId/...) — jamais une nouvelle relation Prisma, même patron que WarrantyHistoryEntry/ProjectPurchaseEntry. */
async function resolveEmployeeNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => !!id)));
  if (uniqueIds.length === 0) return new Map();
  const rows = await prisma.employee.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } });
  return new Map(rows.map((row) => [row.id, row.name]));
}

export interface NextSeaoNumberDto {
  nextDisplayId: string;
  defaultMarginPct: number;
}

export async function getNextSeaoDisplayId(): Promise<NextSeaoNumberDto> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const { year, number } = resolveNextSeaoNumber(settings);
  return { nextDisplayId: formatSeaoDisplayId(year, number), defaultMarginPct: Number(settings.seaoDefaultMarginPct) };
}

export interface NewSeaoContactInput {
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

export interface CreateSeaoFileInput {
  newContact: NewSeaoContactInput;
  referenceNumber?: string;
  title?: string;
  submissionDeadline?: string;
}

export async function createSeaoFile(createdById: string, input: CreateSeaoFileInput) {
  if (!input.newContact?.contactName?.trim()) throw new HttpError(400, "Le nom du contact est requis.");
  const contact = await ensureContactRow({ ...input.newContact, requestType: "seao" });

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const { year, number } = resolveNextSeaoNumber(settings);
    const displayId = formatSeaoDisplayId(year, number);

    const file = await tx.seaoFile.create({
      data: {
        displayId,
        contactId: contact.id,
        referenceNumber: input.referenceNumber?.trim() || null,
        title: input.title?.trim() || null,
        submissionDeadline: input.submissionDeadline ? new Date(input.submissionDeadline) : null,
        createdById,
      },
    });
    await tx.settings.update({ where: { id: settings.id }, data: { nextSeaoNumber: number + 1, seaoNumberYear: year } });
    return file;
  });
}

export interface SeaoFileListItemDto {
  id: string;
  displayId: string;
  title: string | null;
  contactName: string;
  company: string | null;
  status: string;
  submissionDeadline: string | null;
  createdAt: string;
  /** Pour le Centre d'actions (seao_go_no_go_pending) — jamais une deuxième requête séparée là-bas. */
  hasDocuments: boolean;
}

export async function listSeaoFiles(): Promise<SeaoFileListItemDto[]> {
  const rows = await prisma.seaoFile.findMany({
    where: { deletedAt: null },
    include: { contact: { select: { name: true, company: true } }, _count: { select: { documents: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    displayId: row.displayId,
    title: row.title,
    contactName: row.contact.name,
    company: row.contact.company,
    status: row.status,
    submissionDeadline: row.submissionDeadline?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    hasDocuments: row._count.documents > 0,
  }));
}

export interface SeaoDocumentDto {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedByName: string;
  uploadedAt: string;
}
export interface SeaoAnalysisDto {
  id: string;
  version: number;
  summaryContent: unknown;
  changesContent: unknown;
  requestedByName: string;
  createdAt: string;
}
export interface SeaoBordereauLineDto {
  id: string;
  description: string;
  cost: number;
  marginPct: number;
  salePrice: number;
  source: string;
  sortOrder: number;
}
export interface SeaoCompetitorDto {
  id: string;
  companyName: string;
  submittedPrice: number;
}
export interface SeaoNoteDto {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}
export interface SeaoFileDetailDto extends SeaoFileListItemDto {
  referenceNumber: string | null;
  contactId: string;
  goNoGoDecidedAt: string | null;
  nonSubmissionReason: string | null;
  outcomeDecidedAt: string | null;
  projectId: string | null;
  documents: SeaoDocumentDto[];
  analyses: SeaoAnalysisDto[];
  bordereauLines: SeaoBordereauLineDto[];
  competitors: SeaoCompetitorDto[];
  notes: SeaoNoteDto[];
}

export async function getSeaoFileDetail(id: string): Promise<SeaoFileDetailDto> {
  const file = await loadSeaoFileOrThrow(id);
  const [documents, analyses, bordereauLines, competitors, notes] = await Promise.all([
    prisma.seaoDocument.findMany({ where: { seaoFileId: id }, orderBy: { uploadedAt: "asc" } }),
    prisma.seaoAnalysis.findMany({ where: { seaoFileId: id }, orderBy: { version: "desc" } }),
    prisma.seaoBordereauLine.findMany({ where: { seaoFileId: id }, orderBy: { sortOrder: "asc" } }),
    prisma.seaoCompetitor.findMany({ where: { seaoFileId: id }, orderBy: { createdAt: "asc" } }),
    prisma.seaoNote.findMany({ where: { seaoFileId: id }, orderBy: { createdAt: "desc" } }),
  ]);

  const names = await resolveEmployeeNames([
    ...documents.map((d) => d.uploadedById),
    ...analyses.map((a) => a.requestedById),
    ...notes.map((n) => n.authorId),
  ]);
  const nameFor = (id: string) => names.get(id) ?? "—";

  return {
    id: file.id,
    displayId: file.displayId,
    title: file.title,
    contactName: file.contact.name,
    company: file.contact.company,
    contactId: file.contactId,
    referenceNumber: file.referenceNumber,
    status: file.status,
    submissionDeadline: file.submissionDeadline?.toISOString() ?? null,
    hasDocuments: documents.length > 0,
    goNoGoDecidedAt: file.goNoGoDecidedAt?.toISOString() ?? null,
    nonSubmissionReason: file.nonSubmissionReason,
    outcomeDecidedAt: file.outcomeDecidedAt?.toISOString() ?? null,
    projectId: file.projectId,
    createdAt: file.createdAt.toISOString(),
    documents: documents.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      fileSize: d.fileSize,
      uploadedByName: nameFor(d.uploadedById),
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    analyses: analyses.map((a) => ({
      id: a.id,
      version: a.version,
      summaryContent: a.summaryContent,
      changesContent: a.changesContent,
      requestedByName: nameFor(a.requestedById),
      createdAt: a.createdAt.toISOString(),
    })),
    bordereauLines: bordereauLines.map((line) => ({
      id: line.id,
      description: line.description,
      cost: Number(line.cost),
      marginPct: Number(line.marginPct),
      salePrice: Number(line.salePrice),
      source: line.source,
      sortOrder: line.sortOrder,
    })),
    competitors: competitors.map((c) => ({ id: c.id, companyName: c.companyName, submittedPrice: Number(c.submittedPrice) })),
    notes: notes.map((n) => ({ id: n.id, authorName: nameFor(n.authorId), body: n.body, createdAt: n.createdAt.toISOString() })),
  };
}

/** Étape 1 du flux d'upload (voir lib/storage.ts, en-tête) — vérifie que le dossier existe avant de générer l'URL signée. */
export async function createSeaoDocumentUploadUrl(seaoFileId: string, fileName: string): Promise<SignedUploadTarget> {
  await loadSeaoFileOrThrow(seaoFileId);
  const path = buildStoragePath(`seao/${seaoFileId}`, fileName);
  return createSignedUploadTarget(BUCKET, path);
}

export interface ConfirmSeaoDocumentInput {
  storagePath: string;
  fileName: string;
  fileSize: number;
}

/** Étape 3 (voir lib/storage.ts) — pousse le fichier vers l'API Files d'Anthropic AVANT de créer la ligne, pour ne jamais avoir de SeaoDocument sans anthropicFileId dans le chemin normal. */
export async function confirmSeaoDocumentUpload(seaoFileId: string, uploadedById: string, input: ConfirmSeaoDocumentInput) {
  await loadSeaoFileOrThrow(seaoFileId);
  const anthropicFileId = await uploadDocumentToAnthropic(BUCKET, input.storagePath, input.fileName);
  return prisma.seaoDocument.create({
    data: {
      seaoFileId,
      fileName: input.fileName,
      storagePath: input.storagePath,
      fileSize: input.fileSize,
      anthropicFileId,
      uploadedById,
    },
  });
}

export async function getSeaoDocumentDownloadUrl(documentId: string): Promise<string> {
  const document = await prisma.seaoDocument.findUnique({ where: { id: documentId } });
  if (!document) throw new HttpError(404, "Document introuvable.");
  return createSignedDownloadUrl(BUCKET, document.storagePath);
}

/**
 * Checklist confirmée avec l'utilisatrice le 16 septembre 2026 — remplace un
 * premier prompt trop vague (« tout élément à surveiller » seul), qui ne
 * garantissait pas la vérification de points précis (dépôt de garantie,
 * visite obligatoire, etc.), seulement le jugement du modèle. Chaque point
 * doit être nommé explicitement, y compris s'il est absent — jamais omis en
 * silence, pour que l'absence d'une mention dans le résumé signifie
 * « vérifié, non applicable » plutôt que « peut-être oublié ».
 */
const SEAO_SUMMARY_SYSTEM_PROMPT = `Tu analyses un appel d'offres public pour une entreprise d'automatisation industrielle (GSC Automation). Dans ton résumé, vérifie et nomme explicitement chacun des points suivants, dans cet ordre — indique clairement s'il ne s'applique pas ou n'est pas mentionné dans les documents plutôt que de l'omettre silencieusement :

1. Dépôt de garantie de soumission (montant, forme exigée — chèque visé, lettre de crédit, etc.)
2. Cautionnement d'exécution exigé après l'obtention du contrat (distinct du dépôt de garantie de soumission ci-dessus — montant, pourcentage)
3. Assurances exigées (responsabilité civile, montants de couverture, etc.)
4. Garantie exigée sur les travaux ou équipements livrés (durée, conditions)
5. Date cible de livraison ou d'achèvement du projet
6. Certifications exigées (ISO, RBQ, etc.)
7. Visite des lieux obligatoire (oui/non, date si applicable)
8. Exigences techniques détaillées
9. Échéancier complet (date limite de soumission et toute autre échéance)
10. Critères d'évaluation (pondération technique vs prix, etc.)
11. Tout autre élément à surveiller qui ne rentre pas dans les catégories ci-dessus

Sois concis mais complet, et cite les documents sources.`;

/**
 * Lance une nouvelle version d'analyse — résumé cité (toujours) + changements
 * depuis la version précédente (si version > 1) en DEUX appels IA séparés
 * (history: [] chacun — jamais des tours d'un même fil, voir
 * citedCompletion.ts), puis extraction du bordereau UNE SEULE FOIS (jamais
 * si des lignes existent déjà — ne réécrit jamais un chiffrage humain déjà
 * commencé).
 */
export async function triggerSeaoAnalysis(seaoFileId: string, requestedById: string) {
  await loadSeaoFileOrThrow(seaoFileId);
  const documents = await prisma.seaoDocument.findMany({ where: { seaoFileId }, orderBy: { uploadedAt: "asc" } });
  if (documents.length === 0) throw new HttpError(400, "Aucun document déposé pour ce dossier.");
  const missingUpload = documents.find((d) => !d.anthropicFileId);
  if (missingUpload) throw new HttpError(409, `Le document « ${missingUpload.fileName} » n'est pas encore prêt — réessayer dans quelques instants.`);

  const citedDocs = documents.map((d) => ({ anthropicFileId: d.anthropicFileId!, title: d.fileName }));
  const lastAnalysis = await prisma.seaoAnalysis.findFirst({ where: { seaoFileId }, orderBy: { version: "desc" } });
  const version = (lastAnalysis?.version ?? 0) + 1;

  const summary = await runCitedCompletion({
    documents: citedDocs,
    history: [],
    system: SEAO_SUMMARY_SYSTEM_PROMPT,
    userText: "Résume ce dossier d'appel d'offres.",
  });

  let changes: Awaited<ReturnType<typeof runCitedCompletion>> | null = null;
  if (lastAnalysis) {
    const previousSummary = plainTextFromContent(lastAnalysis.summaryContent);
    changes = await runCitedCompletion({
      documents: citedDocs,
      history: [],
      system: "Tu compares un appel d'offres à sa version précédente pour repérer les changements (addenda, exigences modifiées, nouvelle échéance).",
      userText: `Voici le résumé de la version précédente (${lastAnalysis.version}) :\n\n${previousSummary}\n\nEn comparant avec les documents actuels (incluant tout addenda déposé depuis), décris précisément ce qui a changé. S'il n'y a aucun changement de fond, dis-le clairement.`,
    });
  }

  const existingLineCount = await prisma.seaoBordereauLine.count({ where: { seaoFileId } });
  if (existingLineCount === 0) {
    const settings = await prisma.settings.findFirst();
    const defaultMarginPct = Number(settings?.seaoDefaultMarginPct ?? 20);
    const extracted = await extractBordereauLines(citedDocs);
    if (extracted.length > 0) {
      await prisma.seaoBordereauLine.createMany({
        data: extracted.map((line, index) => ({
          seaoFileId,
          description: line.description,
          cost: 0,
          marginPct: defaultMarginPct,
          salePrice: seaoBordereauLineSalePrice(0, defaultMarginPct),
          source: "ai",
          sortOrder: index,
        })),
      });
    }
  }

  return prisma.seaoAnalysis.create({
    data: {
      seaoFileId,
      version,
      documentIds: documents.map((d) => d.id),
      summaryContent: summary.content as unknown as object,
      changesContent: (changes?.content as unknown as object) ?? undefined,
      requestedById,
      inputTokens: summary.inputTokens + (changes?.inputTokens ?? 0),
      outputTokens: summary.outputTokens + (changes?.outputTokens ?? 0),
    },
  });
}

export async function decideSeaoGoNoGo(seaoFileId: string, decidedById: string, go: boolean, nonSubmissionReason?: string) {
  const file = await loadSeaoFileOrThrow(seaoFileId);
  if (file.status !== "a_l_etude") throw new HttpError(400, "Le go/no-go a déjà été décidé pour ce dossier.");
  await prisma.seaoFile.update({
    where: { id: seaoFileId },
    data: {
      status: go ? "en_soumission" : "non_soumissionne",
      goNoGoDecidedById: decidedById,
      goNoGoDecidedAt: new Date(),
      nonSubmissionReason: go ? null : (nonSubmissionReason?.trim() || null),
    },
  });
}

export async function recordSeaoOutcome(seaoFileId: string, decidedById: string, won: boolean) {
  const file = await loadSeaoFileOrThrow(seaoFileId);
  if (file.status !== "en_soumission") throw new HttpError(400, "Seul un dossier « en soumission » peut recevoir une issue finale.");
  await prisma.seaoFile.update({
    where: { id: seaoFileId },
    data: { status: won ? "gagne" : "perdu", outcomeDecidedById: decidedById, outcomeDecidedAt: new Date() },
  });
}

export interface ConvertSeaoFileToProjectInput {
  name: string;
  projectNumber?: string;
}

export async function convertSeaoFileToProject(seaoFileId: string, createdById: string, input: ConvertSeaoFileToProjectInput) {
  const file = await loadSeaoFileOrThrow(seaoFileId);
  if (file.status !== "gagne") throw new HttpError(400, "Seul un dossier gagné peut être converti en projet.");
  if (file.projectId) throw new HttpError(400, "Ce dossier SEAO a déjà un projet associé.");

  const lines = await prisma.seaoBordereauLine.findMany({ where: { seaoFileId } });
  const sold = seaoBordereauTotal(lines.map((line) => Number(line.salePrice)));

  const project = await createProjectDirect(createdById, {
    name: input.name,
    projectNumber: input.projectNumber,
    newContact: {
      contactName: file.contact.name,
      company: file.contact.company ?? undefined,
    },
  });
  if (sold > 0) await updateProjectPlanning(project.id, { sold });
  await prisma.seaoFile.update({ where: { id: seaoFileId }, data: { projectId: project.id } });
  return project;
}

export interface UpsertSeaoBordereauLineInput {
  description: string;
  cost: number;
  marginPct: number;
}

export async function createSeaoBordereauLine(seaoFileId: string, input: UpsertSeaoBordereauLineInput) {
  await loadSeaoFileOrThrow(seaoFileId);
  const maxSortOrder = await prisma.seaoBordereauLine.aggregate({ where: { seaoFileId }, _max: { sortOrder: true } });
  return prisma.seaoBordereauLine.create({
    data: {
      seaoFileId,
      description: input.description.trim(),
      cost: input.cost,
      marginPct: input.marginPct,
      salePrice: seaoBordereauLineSalePrice(input.cost, input.marginPct),
      source: "manual",
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateSeaoBordereauLine(lineId: string, input: Partial<UpsertSeaoBordereauLineInput>) {
  const existing = await prisma.seaoBordereauLine.findUnique({ where: { id: lineId } });
  if (!existing) throw new HttpError(404, "Ligne de bordereau introuvable.");
  const cost = input.cost ?? Number(existing.cost);
  const marginPct = input.marginPct ?? Number(existing.marginPct);
  return prisma.seaoBordereauLine.update({
    where: { id: lineId },
    data: {
      ...(input.description !== undefined && { description: input.description.trim() }),
      cost,
      marginPct,
      salePrice: seaoBordereauLineSalePrice(cost, marginPct),
    },
  });
}

export async function deleteSeaoBordereauLine(lineId: string): Promise<void> {
  const existing = await prisma.seaoBordereauLine.findUnique({ where: { id: lineId } });
  if (!existing) throw new HttpError(404, "Ligne de bordereau introuvable.");
  await prisma.seaoBordereauLine.delete({ where: { id: lineId } });
}

export async function createSeaoCompetitor(seaoFileId: string, createdById: string, companyName: string, submittedPrice: number) {
  await loadSeaoFileOrThrow(seaoFileId);
  return prisma.seaoCompetitor.create({ data: { seaoFileId, companyName: companyName.trim(), submittedPrice, createdById } });
}

export async function deleteSeaoCompetitor(competitorId: string): Promise<void> {
  const existing = await prisma.seaoCompetitor.findUnique({ where: { id: competitorId } });
  if (!existing) throw new HttpError(404, "Concurrent introuvable.");
  await prisma.seaoCompetitor.delete({ where: { id: competitorId } });
}

export async function addSeaoNote(seaoFileId: string, authorId: string, body: string) {
  await loadSeaoFileOrThrow(seaoFileId);
  return prisma.seaoNote.create({ data: { seaoFileId, authorId, body: body.trim() } });
}
