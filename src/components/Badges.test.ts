import { describe, expect, it, afterEach, vi } from "vitest";
import { etatOuverture } from "./Badges";

/** Fige l'horloge à une heure MALGACHE donnée (UTC+3). */
function aMadagascar(jour: number, h: number, min = 0) {
  // 2026-08-16 est un dimanche ; on décale pour tomber sur le jour voulu.
  const d = new Date(Date.UTC(2026, 7, 16 + jour, h - 3, min));
  vi.setSystemTime(d);
}

afterEach(() => vi.useRealTimers());

describe("etatOuverture", () => {
  const midiEtSoir = [
    { weekday: 3, opens_at: "11:30", closes_at: "14:00" },
    { weekday: 3, opens_at: "18:00", closes_at: "22:00" },
  ];

  it("ne dit rien quand aucun horaire n'est saisi", () => {
    expect(etatOuverture([])).toEqual({ etat: "inconnu" });
  });

  it("dit ouvert pendant le service", () => {
    vi.useFakeTimers();
    aMadagascar(3, 12, 30);
    expect(etatOuverture(midiEtSoir)).toEqual({ etat: "ouvert", fermeDansMin: 90 });
  });

  it("⚠ CE QUI CHANGE UNE DÉCISION : annonce la fermeture proche", () => {
    vi.useFakeTimers();
    aMadagascar(3, 21, 20);
    const v = etatOuverture(midiEtSoir);
    expect(v).toEqual({ etat: "ouvert", fermeDansMin: 40 });
  });

  it("dit fermé entre les deux services, avec l'heure de réouverture", () => {
    vi.useFakeTimers();
    aMadagascar(3, 16);
    expect(etatOuverture(midiEtSoir)).toEqual({ etat: "ferme", ouvreA: "18:00" });
  });

  it("dit fermé après le dernier service, sans heure de réouverture", () => {
    vi.useFakeTimers();
    aMadagascar(3, 23);
    expect(etatOuverture(midiEtSoir)).toEqual({ etat: "ferme", ouvreA: undefined });
  });

  it("dit fermé un jour sans horaire", () => {
    vi.useFakeTimers();
    aMadagascar(1, 12, 30);
    expect(etatOuverture(midiEtSoir).etat).toBe("ferme");
  });

  it("gère un bar qui ferme après minuit", () => {
    vi.useFakeTimers();
    aMadagascar(3, 23, 30);
    const nuit = [{ weekday: 3, opens_at: "18:00", closes_at: "02:00" }];
    expect(etatOuverture(nuit)).toEqual({ etat: "ouvert", fermeDansMin: 150 });
  });

  it("⚠ RAISONNE À L'HEURE DE MADAGASCAR, pas à celle du navigateur", () => {
    vi.useFakeTimers();
    // 21 h 00 UTC = minuit passé à Tana : le restaurant du soir est fermé.
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 19, 21, 0)));
    expect(etatOuverture(midiEtSoir).etat).toBe("ferme");
    // 09 h 00 UTC = midi à Tana : il est ouvert.
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 19, 9, 0)));
    expect(etatOuverture(midiEtSoir).etat).toBe("ouvert");
  });
});
