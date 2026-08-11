import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

const app = createApp();

describe("GET /health", () => {
  it("répond 200 sans authentification", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("Routes protégées — aucun jeton fourni", () => {
  it("GET /api/me refuse sans jeton (401)", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/employees refuse sans jeton (401)", async () => {
    const res = await request(app).get("/api/employees");
    expect(res.status).toBe(401);
  });

  it("GET /api/me refuse un jeton mal formé (401)", async () => {
    const res = await request(app).get("/api/me").set("Authorization", "NotBearer abc");
    expect(res.status).toBe(401);
  });
});

describe("Route inconnue", () => {
  it("répond 404", async () => {
    const res = await request(app).get("/api/ceci-nexiste-pas");
    expect(res.status).toBe(404);
  });
});
