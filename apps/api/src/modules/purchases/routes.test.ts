import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";

const app = createApp();

describe("Routes d'achats — aucun jeton fourni (401 avant même la vérification de rôle)", () => {
  it("POST /api/purchase-requests/shortlist refuse sans jeton", async () => {
    const res = await request(app).post("/api/purchase-requests/shortlist").send({ projectId: "x", lines: [] });
    expect(res.status).toBe(401);
  });

  it("GET /api/purchase-requests refuse sans jeton", async () => {
    const res = await request(app).get("/api/purchase-requests");
    expect(res.status).toBe(401);
  });

  it("PATCH /api/purchase-requests/:id/amount refuse sans jeton", async () => {
    const res = await request(app).patch("/api/purchase-requests/00000000-0000-0000-0000-000000000000/amount").send({ amount: 100 });
    expect(res.status).toBe(401);
  });

  it("POST /api/purchase-requests/:id/approve refuse sans jeton", async () => {
    const res = await request(app).post("/api/purchase-requests/00000000-0000-0000-0000-000000000000/approve");
    expect(res.status).toBe(401);
  });

  it("POST /api/purchase-requests/:id/reject refuse sans jeton", async () => {
    const res = await request(app).post("/api/purchase-requests/00000000-0000-0000-0000-000000000000/reject");
    expect(res.status).toBe(401);
  });

  it("GET /api/projects refuse sans jeton", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(401);
  });
});
