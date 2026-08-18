import { describe, it, expect } from "vitest";
import { roundPunchMinutes } from "../src/punch.js";

describe("Arrondi des punchs (toujours vers le haut)", () => {
  it("2h03 (123 min) devient 2h15 (135 min) avec un pas de 15", () => expect(roundPunchMinutes(123, 15)).toBe(135));
  it("un multiple exact reste inchangé", () => expect(roundPunchMinutes(120, 15)).toBe(120));
  it("1 minute arrondit tout de même à un pas complet", () => expect(roundPunchMinutes(1, 15)).toBe(15));
  it("0 minute reste 0", () => expect(roundPunchMinutes(0, 15)).toBe(0));
  it("jamais négatif même avec une entrée négative", () => expect(roundPunchMinutes(-10, 15)).toBe(0));
  it("respecte un pas différent (ex. 30 minutes)", () => expect(roundPunchMinutes(31, 30)).toBe(60));
});
