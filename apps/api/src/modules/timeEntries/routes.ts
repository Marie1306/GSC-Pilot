import { Router } from "express";
import { z } from "zod";
import { canApprovePunch, canPunchForOtherEmployee } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission, requirePermissionWithDelegation } from "../../auth/middleware.js";
import {
  startTimer,
  stopTimer,
  createManualEntry,
  listMyTimeEntries,
  listTimeEntriesForApproval,
  listAllTimeEntries,
  approveTimeEntry,
  updateTimeEntry,
  listPunchableTasks,
  listProjectOptions,
  listServiceCallOptions,
  listPunchableEmployees,
} from "./service.js";

export const timeEntriesRouter = Router();

const referenceFields = {
  employeeId: z.uuid().optional(),
  projectType: z.enum(["project", "service", "internal"]),
  projectId: z.uuid().optional(),
  serviceCallId: z.uuid().optional(),
  taskId: z.uuid(),
  techLevelId: z.uuid().optional(),
  rateType: z.enum(["regular", "overtime", "extra"]).optional(),
};

timeEntriesRouter.get("/punchable-tasks", requireAuth, async (_req, res) => {
  res.json({ tasks: await listPunchableTasks() });
});

timeEntriesRouter.get("/time-entries/project-options", requireAuth, async (_req, res) => {
  res.json({ projects: await listProjectOptions() });
});

timeEntriesRouter.get("/time-entries/service-call-options", requireAuth, async (req, res) => {
  const employee = req.employee!;
  res.json({ serviceCalls: await listServiceCallOptions(employee.id, employee.persona) });
});

timeEntriesRouter.get(
  "/time-entries/employees",
  requireAuth,
  requirePermission((persona) => canPunchForOtherEmployee(persona)),
  async (_req, res) => {
    res.json({ employees: await listPunchableEmployees() });
  },
);

timeEntriesRouter.get("/time-entries/mine", requireAuth, async (req, res) => {
  const employee = req.employee!;
  res.json({ timeEntries: await listMyTimeEntries(employee.id, employee.persona) });
});

timeEntriesRouter.get(
  "/time-entries/for-approval",
  requireAuth,
  requirePermissionWithDelegation((settings, persona) => canApprovePunch(settings, persona)),
  async (req, res) => {
    res.json({ timeEntries: await listTimeEntriesForApproval(req.employee!.persona) });
  },
);

timeEntriesRouter.get(
  "/time-entries/all",
  requireAuth,
  requirePermissionWithDelegation((settings, persona) => canApprovePunch(settings, persona)),
  async (req, res) => {
    res.json({ timeEntries: await listAllTimeEntries(req.employee!.persona) });
  },
);

const startSchema = z.object(referenceFields).extend({ note: z.string().optional() });
timeEntriesRouter.post("/time-entries/start", requireAuth, async (req, res) => {
  const employee = req.employee!;
  const body = startSchema.parse(req.body);
  const timeEntry = await startTimer(employee.id, employee.persona, { ...body, employeeId: body.employeeId ?? employee.id });
  res.status(201).json({ timeEntry });
});

timeEntriesRouter.post("/time-entries/:id/stop", requireAuth, async (req, res) => {
  const employee = req.employee!;
  const id = z.uuid().parse(req.params.id);
  const timeEntry = await stopTimer(employee.id, employee.persona, id);
  res.json({ timeEntry });
});

const manualSchema = z.object(referenceFields).extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date requise (AAAA-MM-JJ)."),
  hours: z.number().positive(),
  note: z.string().optional(),
  blockageNote: z.string().optional(),
});
timeEntriesRouter.post("/time-entries", requireAuth, async (req, res) => {
  const employee = req.employee!;
  const body = manualSchema.parse(req.body);
  const timeEntry = await createManualEntry(employee.id, employee.persona, { ...body, employeeId: body.employeeId ?? employee.id });
  res.status(201).json({ timeEntry });
});

const updateSchema = z.object({
  note: z.string().optional(),
  blockageNote: z.string().nullable().optional(),
  projectType: z.enum(["project", "service", "internal"]).optional(),
  projectId: z.uuid().optional(),
  serviceCallId: z.uuid().optional(),
  taskId: z.uuid().optional(),
  hours: z.number().positive().optional(),
  justification: z.string().optional(),
});
timeEntriesRouter.patch("/time-entries/:id", requireAuth, async (req, res) => {
  const employee = req.employee!;
  const id = z.uuid().parse(req.params.id);
  const body = updateSchema.parse(req.body);
  const timeEntry = await updateTimeEntry(id, employee.id, employee.persona, body);
  res.json({ timeEntry });
});

timeEntriesRouter.post(
  "/time-entries/:id/approve",
  requireAuth,
  requirePermissionWithDelegation((settings, persona) => canApprovePunch(settings, persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const timeEntry = await approveTimeEntry(id, req.employee!.persona);
    res.json({ timeEntry });
  },
);
