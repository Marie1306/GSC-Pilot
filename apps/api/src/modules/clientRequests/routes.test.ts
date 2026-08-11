import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";

const app = createApp();

describe("Routes de demandes clients — aucun jeton fourni (401 avant même la vérification de rôle)", () => {
  it("GET /api/sales-channels refuse sans jeton", async () => {
    const res = await request(app).get("/api/sales-channels");
    expect(res.status).toBe(401);
  });

  it("POST /api/client-requests refuse sans jeton", async () => {
    const res = await request(app).post("/api/client-requests").send({});
    expect(res.status).toBe(401);
  });

  it("GET /api/client-requests refuse sans jeton", async () => {
    const res = await request(app).get("/api/client-requests");
    expect(res.status).toBe(401);
  });

  it("GET /api/client-requests/:id refuse sans jeton", async () => {
    const res = await request(app).get("/api/client-requests/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });

  it("POST /api/client-requests/:id/notes refuse sans jeton", async () => {
    const res = await request(app).post("/api/client-requests/00000000-0000-0000-0000-000000000000/notes").send({ body: "x" });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/client-requests/:id/status refuse sans jeton", async () => {
    const res = await request(app)
      .patch("/api/client-requests/00000000-0000-0000-0000-000000000000/status")
      .send({ status: "in_progress" });
    expect(res.status).toBe(401);
  });
});
