import { Router } from "express";
import { z } from "zod";
import { canAccessErrorReports, canDeleteErrorReport } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import {
  createErrorReport,
  getErrorReportDetail,
  getErrorReportsByEmployee,
  listErrorReportsForEmployee,
  getErrorReportsStats,
  listErrorReportSubjects,
  deleteErrorReport,
} from "./service.js";

// Monté sur /api directement (voir app.ts) — même patron que rollings/reports.
export const errorReportsRouter = Router();

const gate = requirePermission((persona) => canAccessErrorReports(persona));

const filtersQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().optional(),
});
const statsQuerySchema = filtersQuerySchema.extend({ employeeId: z.uuid().optional() });

errorReportsRouter.get("/error-reports/subjects", requireAuth, gate, async (_req, res) => {
  res.json({ employees: await listErrorReportSubjects() });
});

errorReportsRouter.get("/error-reports/by-employee", requireAuth, gate, async (req, res) => {
  const filters = filtersQuerySchema.parse(req.query);
  res.json(await getErrorReportsByEmployee(filters));
});

errorReportsRouter.get("/error-reports/by-employee/:employeeId", requireAuth, gate, async (req, res) => {
  const employeeId = z.uuid().parse(req.params.employeeId);
  const filters = filtersQuerySchema.parse(req.query);
  res.json({ reports: await listErrorReportsForEmployee(employeeId, filters) });
});

errorReportsRouter.get("/error-reports/stats", requireAuth, gate, async (req, res) => {
  const filters = statsQuerySchema.parse(req.query);
  res.json(await getErrorReportsStats(filters));
});

errorReportsRouter.get("/error-reports/:id", requireAuth, gate, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  res.json({ report: await getErrorReportDetail(id) });
});

const createSchema = z.object({
  employeeId: z.uuid(),
  materialValue: z.coerce.number().min(0).default(0),
  hoursLost: z.coerce.number().min(0).default(0),
  note: z.string().optional(),
  photos: z.array(z.string()).optional(),
});
errorReportsRouter.post("/error-reports", requireAuth, gate, async (req, res) => {
  const input = createSchema.parse(req.body);
  const report = await createErrorReport(req.employee!.id, input);
  res.status(201).json({ report });
});

errorReportsRouter.delete(
  "/error-reports/:id",
  requireAuth,
  requirePermission((persona) => canDeleteErrorReport(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await deleteErrorReport(id);
    res.status(204).end();
  },
);
