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
});
