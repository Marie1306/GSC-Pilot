import { describe, it, expect } from "vitest";
import { employeeSchema } from "../src/schemas/employee.js";

const validEmployee = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  authUserId: "3fa85f64-5717-4562-b3fc-2c963f66afa7",
  name: "Marc Designer",
  initials: "MD",
  email: "marc@gscautomation.com",
  persona: "owner",
  costRate: 45,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

describe("employeeSchema", () => {
  it("accepte un employé valide", () => {
    expect(() => employeeSchema.parse(validEmployee)).not.toThrow();
  });

  it("rejette un persona inconnu", () => {
    expect(() => employeeSchema.parse({ ...validEmployee, persona: "director" })).toThrow();
  });

  it("rejette un courriel invalide", () => {
    expect(() => employeeSchema.parse({ ...validEmployee, email: "pas-un-courriel" })).toThrow();
  });
});
