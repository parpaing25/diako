import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { jeuDeTailles } from "./imageThumb";
// ⚠ On ne importe PAS `FAMILLES` : `destinations.ts` tire le client Supabase,
//   qui lit `localStorage` et n'existe pas sous vitest/node. De toute façon ce
//   qu'on veut vérifier ici, c'est ce que le BUILD lit dans le texte source.

/**
 * 🔴 CE QUE CES TESTS PROTÈGENT. `public/app-init.js` précharge la photo de
 *    tête de /explorer avant que React n'existe : c'est 60 % du LCP de cette
 *    page (Lighthouse, production, 28/10/2026 — 2 868 ms d'attente avant même
 *    la requête de l'image, sur 4,80 s de LCP). Pour que ce preload serve, il
 *    doit demander EXACTEMENT le fichier que la carte affichera ensuite. S'il
 *    se trompe de variante ou de créneau, le navigateur télécharge DEUX
 *    images : on paie le double et le LCP empire.
 *
 *    Or ce bloc vit dans un fichier non compilé, hors du bundle, qui ne peut
 *    rien importer : les règles de `jeuDeTailles` et le `sizes` de la carte y
 *    sont forcément RECOPIÉS. Ces tests sont ce qui empêche les copies de
 *    diverger en silence — le défaut serait invisible, le site marcherait.
 */

const racine = path.resolve(__dirname, "../..");
const lire = (p: string) => readFileSync(path.resolve(racine, p), "utf8");

const APP_INIT = lire("public/app-init.js");
const EXPLORER = lire("src/pages/Explorer.tsx");
const DESTINATIONS = lire("src/lib/destinations.ts");

/** Le seul bloc qui nous concerne : les autres preloads ont leurs propres règles. */
const BLOC = APP_INIT.slice(APP_INIT.indexOf("function prechargerPhotoExplorer"));

describe("preload de la photo de tête d'Explorer", () => {
  it("le bloc existe et n'a pas été déplacé hors du fichier", () => {
    expect(BLOC).not.toBe("");
    expect(BLOC).toContain('l.rel = "preload"');
  });

  it("annonce les mêmes variantes que jeuDeTailles", () => {
    // La carte appelle `jeuDeTailles(d.cover_url)` : sans w/h, donc largeurs
    // nominales et plafond 1600. Chaque couple « suffixe + largeur » attendu
    // doit se retrouver tel quel dans le fichier recopié.
    const u = "https://diako.fonenako.mg/uploads/pages/diako/places/x.jpg";
    const attendu = jeuDeTailles(u);
    expect(attendu).not.toBeNull();

    for (const candidat of (attendu as string).split(", ")) {
      const [fichier, largeur] = candidat.split(" ");
      const suffixe = fichier.slice(fichier.lastIndexOf("/x") + 2); // ".thumb.webp"
      // ⚠ Sans le guillemet fermant : les deux premières entrées sont suivies
      //   du séparateur (`" 480w, "`), seule la dernière ferme tout de suite.
      const recopie = `"${suffixe}" + q + " ${largeur}`;
      expect(BLOC, `variante absente du preload : ${recopie}`).toContain(recopie);
    }
  });

  it("annonce le même sizes que la carte « grande »", () => {
    // Le `sizes` de la carte pleine largeur, lu dans le composant lui-même :
    // c'est lui qui décide de la variante choisie.
    // ⚠ Ancré sur `sizes={` : le composant porte un autre `grande ? "…"`
    //   quelques lignes plus haut (la hauteur de la tuile), que l'expression
    //   attrapait à sa place.
    const grande = EXPLORER.match(
      /sizes=\{\s*grande\s*\?\s*"((?:[^"\\]|\\.)*)"/
    )?.[1];
    expect(grande, "le sizes de la carte grande n'a pas été retrouvé").toBeTruthy();
    expect(BLOC).toContain(grande as string);
  });

  it("l'ordre des familles reste extractible par le plugin de build", () => {
    // Même expression que `dk-identifiants-publics` dans vite.config.ts :
    // si `FAMILLES` change de forme, l'attribut data-dk-familles devient vide
    // et le preload disparaît sans bruit. Ce test le dit tout de suite.
    const bloc = DESTINATIONS.match(/export const FAMILLES[\s\S]*?\n\];/)?.[0] ?? "";
    const lus = [...bloc.matchAll(/kind:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(lus.length).toBeGreaterThan(0);
    // Autant de genres que d'entrées : une famille dont le `kind` échapperait
    // à l'expression partirait silencieusement du preload.
    const entrees = [...bloc.matchAll(/titre:\s*"/g)].length;
    expect(lus.length).toBe(entrees);
    // La première famille décide du LCP : elle doit être lisible.
    expect(lus[0]).toMatch(/^[a-z_]+$/);
  });

  it("ne précharge que nos images, et jamais sans l'ordre des familles", () => {
    // Deux garde-fous du bloc : une URL hors /uploads/ n'a pas de variantes,
    // et sans l'attribut on ne devine pas quelle famille vient en tête.
    expect(BLOC).toContain('url.indexOf("/uploads/") < 0');
    expect(BLOC).toContain("if (!json || !ordre) return;");
  });
});
