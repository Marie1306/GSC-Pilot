import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";

const app = createApp();

describe("Routes Paramètres — aucun jeton fourni (401 avant même la vérification de rôle)", () => {
  it("GET /api/settings/purchase-categories refuse sans jeton", async () => {
    const res = await request(app).get("/api/settings/purchase-categories");
    expect(res.status).toBe(401);
  });

  it("POST /api/settings/purchase-categories refuse sans jeton", async () => {
    const res = await request(app).post("/api/settings/purchase-categories").send({ name: "Test", thresholdAmount: 100 });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/settings/purchase-categories/:id refuse sans jeton", async () => {
    const res = await request(app).patch("/api/settings/purchase-categories/00000000-0000-0000-0000-000000000000").send({ active: false });
    expect(res.status).toBe(401);
  });

  it("GET /api/settings/sales-channels refuse sans jeton", async () => {
    expect((await request(app).get("/api/settings/sales-channels")).status).toBe(401);
  });
  it("POST /api/settings/sales-channels refuse sans jeton", async () => {
    expect((await request(app).post("/api/settings/sales-channels").send({ name: "Test" })).status).toBe(401);
  });
  it("POST /api/settings/sales-channels/:id/move refuse sans jeton", async () => {
    expect(
      (await request(app).post("/api/settings/sales-channels/00000000-0000-0000-0000-000000000000/move").send({ direction: "up" })).status,
    ).toBe(401);
  });

  it("GET /api/settings/punchable-tasks refuse sans jeton", async () => {
    expect((await request(app).get("/api/settings/punchable-tasks")).status).toBe(401);
  });
  it("POST /api/settings/punchable-tasks refuse sans jeton", async () => {
    expect((await request(app).post("/api/settings/punchable-tasks").send({ category: "service", label: "Test" })).status).toBe(401);
  });

  it("GET /api/settings/service-rates refuse sans jeton", async () => {
    expect((await request(app).get("/api/settings/service-rates")).status).toBe(401);
  });
  it("PATCH /api/settings/service-rates refuse sans jeton", async () => {
    expect((await request(app).patch("/api/settings/service-rates").send({ urgencyFee: 100 })).status).toBe(401);
  });

  it("GET /api/settings/billing-split refuse sans jeton", async () => {
    expect((await request(app).get("/api/settings/billing-split")).status).toBe(401);
  });
  it("PATCH /api/settings/billing-split refuse sans jeton", async () => {
    expect((await request(app).patch("/api/settings/billing-split").send({ steps: [{ label: "x", pct: 100 }] })).status).toBe(401);
  });

  it("GET /api/settings/budget-model-rate refuse sans jeton", async () => {
    expect((await request(app).get("/api/settings/budget-model-rate")).status).toBe(401);
  });
  it("PATCH /api/settings/budget-model-rate refuse sans jeton", async () => {
    expect((await request(app).patch("/api/settings/budget-model-rate").send({ backupHourlyRate: 100 })).status).toBe(401);
  });

  it("GET /api/settings/audit-log refuse sans jeton", async () => {
    expect((await request(app).get("/api/settings/audit-log")).status).toBe(401);
  });

  it("GET /api/settings/trash refuse sans jeton", async () => {
    expect((await request(app).get("/api/settings/trash")).status).toBe(401);
  });
  it("POST /api/settings/trash/:entityType/:id/restore refuse sans jeton", async () => {
    expect((await request(app).post("/api/settings/trash/project/00000000-0000-0000-0000-000000000000/restore")).status).toBe(401);
  });

  it("POST /api/employees refuse sans jeton", async () => {
    expect((await request(app).post("/api/employees").send({ name: "Test", initials: "T", email: "t@t.com", persona: "member" })).status).toBe(
      401,
    );
  });
  it("PATCH /api/employees/:id refuse sans jeton", async () => {
    expect((await request(app).patch("/api/employees/00000000-0000-0000-0000-000000000000").send({ name: "Test" })).status).toBe(401);
  });
});
