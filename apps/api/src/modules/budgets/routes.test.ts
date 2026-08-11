import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";

const app = createApp();
const zeroId = "00000000-0000-0000-0000-000000000000";

describe("Routes de budgétaire — aucun jeton fourni (401 avant même la vérification de rôle)", () => {
  it("POST /api/budgets refuse sans jeton", async () => {
    const res = await request(app).post("/api/budgets").send({ clientRequestId: zeroId });
    expect(res.status).toBe(401);
  });

  it("GET /api/budgets refuse sans jeton", async () => {
    const res = await request(app).get("/api/budgets");
    expect(res.status).toBe(401);
  });

  it("GET /api/budgets/:id refuse sans jeton", async () => {
    const res = await request(app).get(`/api/budgets/${zeroId}`);
    expect(res.status).toBe(401);
  });

  it("PATCH /api/budgets/:id/rows/:rowId refuse sans jeton", async () => {
    const res = await request(app).patch(`/api/budgets/${zeroId}/rows/${zeroId}`).send({ hours: 10 });
    expect(res.status).toBe(401);
  });

  it("POST /api/budgets/:id/sections/:sectionId/rows refuse sans jeton", async () => {
    const res = await request(app).post(`/api/budgets/${zeroId}/sections/${zeroId}/rows`).send({ label: "Ligne" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/budgets/:id/rows/:rowId refuse sans jeton", async () => {
    const res = await request(app).delete(`/api/budgets/${zeroId}/rows/${zeroId}`);
    expect(res.status).toBe(401);
  });

  it("PATCH /api/budgets/:id/project-backup refuse sans jeton", async () => {
    const res = await request(app).patch(`/api/budgets/${zeroId}/project-backup`).send({ amount: 1000 });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/budgets/:id/meta refuse sans jeton", async () => {
    const res = await request(app).patch(`/api/budgets/${zeroId}/meta`).send({ poNumber: "PO-123" });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/budgets/:id/sections/:sectionId refuse sans jeton", async () => {
    const res = await request(app).patch(`/api/budgets/${zeroId}/sections/${zeroId}`).send({ complexity: 5 });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/budgets/:id/backup refuse sans jeton", async () => {
    const res = await request(app).patch(`/api/budgets/${zeroId}/backup`).send({ pct: 10 });
    expect(res.status).toBe(401);
  });

  it("POST /api/budgets/:id/mark-ready refuse sans jeton", async () => {
    const res = await request(app).post(`/api/budgets/${zeroId}/mark-ready`);
    expect(res.status).toBe(401);
  });

  it("POST /api/budgets/:id/mark-sent refuse sans jeton", async () => {
    const res = await request(app).post(`/api/budgets/${zeroId}/mark-sent`);
    expect(res.status).toBe(401);
  });

  it("POST /api/budgets/:id/mark-won refuse sans jeton", async () => {
    const res = await request(app).post(`/api/budgets/${zeroId}/mark-won`);
    expect(res.status).toBe(401);
  });

  it("POST /api/budgets/:id/mark-declined refuse sans jeton", async () => {
    const res = await request(app).post(`/api/budgets/${zeroId}/mark-declined`);
    expect(res.status).toBe(401);
  });
});
