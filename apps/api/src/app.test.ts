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

/**
 * Bogue réel rapporté par l'utilisatrice le 28 août 2026 : ajouter une
 * photo à un rapport d'erreur renvoyait "internal_error". Cause : la
 * limite par défaut d'express.json() (100kb) est bien plus petite qu'une
 * photo compressée encodée en base64 — PayloadTooLargeError tombait dans
 * le 500 générique de errorHandler.ts, jamais distingué. Le body-parser
 * s'exécute avant requireAuth (middleware global, voir app.ts) — ces tests
 * vérifient donc le comportement de la limite/du message d'erreur sans
 * jeton réel, la partie qui compte se joue avant l'authentification.
 */
describe("Limite de taille du corps JSON (photos base64, Rapport d'erreurs)", () => {
  it("un corps de ~500kb (une photo compressée typique) n'est plus bloqué par l'ancienne limite de 100kb", async () => {
    const res = await request(app)
      .post("/api/error-reports")
      .send({ photos: ["a".repeat(500_000)] });
    expect(res.status).toBe(401); // auth manquante — PAS 413, la taille n'est plus le problème
  });

  it("un corps dépassant la nouvelle limite (15mb) renvoie 413 avec un message clair, jamais internal_error", async () => {
    const res = await request(app)
      .post("/api/error-reports")
      .send({ photos: ["a".repeat(20_000_000)] });
    expect(res.status).toBe(413);
    expect(res.body.error).not.toBe("internal_error");
    expect(res.body.error).toMatch(/volumineux/);
  });
});
