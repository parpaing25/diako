import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, MapPin, Search } from "lucide-react";
import { EtatErreur } from "@/components/Etats";
import { getThumbUrl } from "@/lib/imageThumb";
import {
  chargerSuggestions,
  envieDe,
  type Suggestion,
  type TableChoix,
} from "@/lib/envies";
import { REGIONS_ADMIN } from "@/lib/grandesRegions";
import { cn } from "@/lib/utils";

/**
 * CHOISIR SES LIEUX POUR UNE ENVIE.
 *
 * ⚠ POURQUOI UNE RECHERCHE ET UN FILTRE, ET PAS UNE SIMPLE LISTE. Il y a 318
 *   plages, 836 sommets, 977 sites de patrimoine. Une liste qu'on parcourt à la
 *   main n'existe pas à cette échelle : sans recherche ni filtre par région,
 *   l'écran serait un mur qu'on referme.
 *
 * 🔴 ET PRESQUE AUCUNE N'A DE PHOTO — 10 plages sur 318, 16 sommets sur 801.
 *    Une vignette conçue autour de l'image donnerait une grille de cadres gris
 *    qui hurle l'absence. La ligne est donc construite autour du TEXTE : le nom,
 *    le genre, la ville la plus proche et sa distance. La photo, quand elle
 *    existe, vient en petit à gauche — elle enrichit, elle ne structure pas.
 *
 * ⚠ LA DISTANCE À LA VILLE EST LA VRAIE INFORMATION. « à 32 km d'Antsiranana »
 *   répond à la question qu'on se pose avant d'y aller ; un couple de
 *   coordonnées n'y répond pas.
 */

const PAR_VOLEE = 24;

/** ⚠ Un délai plus court fait partir une requête par LETTRE tapée. Sur une 3G
 *  malgache, les réponses reviennent dans le désordre et la liste clignote. */
const ATTENTE_FRAPPE = 350;

const GENRE: Record<string, string> = {
  plage: "plage", parc: "parc", reserve: "réserve", parc_animalier: "parc animalier",
  cascade: "cascade", grotte: "grotte", source: "source", aire: "aire protégée",
  sommet: "sommet", point_de_vue: "point de vue", patrimoine: "patrimoine",
  musee: "musée", oeuvre: "œuvre", site: "site", plat: "plat",
};

export function ChoixEnvie({
  envie,
  choisis,
  onBasculer,
}: {
  envie: string;
  /** Les références déjà retenues, toutes envies confondues. */
  choisis: Set<string>;
  onBasculer: (s: { ref: string; table: TableChoix; nom: string }) => void;
}) {
  const def = envieDe(envie);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<string | null>(null);
  const [elements, setElements] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [curseur, setCurseur] = useState<string | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "erreur">("chargement");
  const [encore, setEncore] = useState(false);

  /** ⚠ CHAQUE RECHERCHE PORTE UN NUMÉRO. Sans lui, une réponse lente à « pla »
   *  arrivant après la réponse à « plage » écraserait la bonne liste : on
   *  taperait un mot précis pour obtenir un résultat plus large. */
  const numero = useRef(0);

  const charger = useCallback(async () => {
    const mien = ++numero.current;
    setEtat("chargement");
    try {
      const p = await chargerSuggestions(envie, { q, region, limite: PAR_VOLEE });
      if (mien !== numero.current) return;
      setElements(p.elements);
      setTotal(p.total);
      setCurseur(p.curseur);
      setEtat("ok");
    } catch {
      if (mien !== numero.current) return;
      setEtat("erreur");
    }
  }, [envie, q, region]);

  useEffect(() => {
    const t = setTimeout(() => void charger(), q ? ATTENTE_FRAPPE : 0);
    return () => clearTimeout(t);
  }, [charger, q]);

  async function voirPlus() {
    if (!curseur || encore) return;
    setEncore(true);
    try {
      const p = await chargerSuggestions(envie, { q, region, curseur, limite: PAR_VOLEE });
      setElements((avant) => {
        // ⚠ Une garde contre le doublon : si le curseur venait à répéter une
        //   ligne, on la verrait deux fois avec la même clé React.
        const vus = new Set(avant.map((x) => x.ref));
        return [...avant, ...p.elements.filter((x) => !vus.has(x.ref))];
      });
      setCurseur(p.curseur);
    } finally {
      setEncore(false);
    }
  }

  if (!def?.propose) return null;

  return (
    <section className="mt-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          Quelle {def.label} ?{" "}
          <span className="font-normal text-muted-foreground">{def.quoi}</span>
        </h3>
        {/* ⚠ LE TOTAL EST CELUI DE LA BASE, pas le nombre de lignes affichées. */}
        {etat === "ok" && (
          <p className="dk-secondaire">
            {total.toLocaleString("fr-FR")} proposition{total > 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Chercher parmi les {def.quoi}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Chercher une ${def.label}…`}
            className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-[16px] outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <select
          aria-label="Filtrer par région"
          value={region ?? ""}
          onChange={(e) => setRegion(e.target.value || null)}
          className="h-11 rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Toutes les régions</option>
          {REGIONS_ADMIN.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {etat === "erreur" && <EtatErreur className="mt-3" onReessayer={() => void charger()} />}

      {etat === "chargement" && (
        <ul className="mt-3 space-y-2">
          {[0, 1, 2, 3].map((i) => <li key={i} className="dk-skeleton h-16 rounded-xl" />)}
        </ul>
      )}

      {etat === "ok" && elements.length === 0 && (
        /* 🔴 UNE LISTE VIDE SANS UN MOT PASSE POUR UNE PANNE. On dit ce qui est
           filtré, et comment revenir en arrière. */
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Rien ne correspond{q ? ` à « ${q} »` : ""}
          {region ? ` dans ${region}` : ""}.{" "}
          {(q || region) && (
            <button
              onClick={() => { setQ(""); setRegion(null); }}
              className="font-medium text-primary underline underline-offset-4"
            >
              Tout afficher
            </button>
          )}
        </p>
      )}

      {etat === "ok" && elements.length > 0 && (
        <ul className="mt-3 space-y-2">
          {elements.map((s) => {
            const pris = choisis.has(s.ref);
            return (
              <li key={s.ref}>
                <button
                  onClick={() => onBasculer({ ref: s.ref, table: s.table, nom: s.nom })}
                  aria-pressed={pris}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-2 text-left transition",
                    pris
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  {/* ⚠ La vignette n'occupe la place que si elle existe : neuf
                      lignes sur dix n'ont pas de photo, et un cadre gris répété
                      vingt-quatre fois remplirait l'écran sans rien dire. */}
                  {s.cover_url && (
                    <img
                      src={getThumbUrl(s.cover_url)}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.nom}</span>
                    <span className="dk-secondaire block truncate">
                      {GENRE[s.kind] ?? s.kind}
                      {s.ville && (
                        <>
                          {" · "}
                          {s.km_ville !== null && s.km_ville > 0
                            ? `à ${s.km_ville} km de ${s.ville}`
                            : s.ville}
                        </>
                      )}
                      {s.region && ` · ${s.region}`}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                      pris ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    )}
                    aria-hidden="true"
                  >
                    {pris ? <Check className="h-4 w-4" /> : <MapPin className="h-3.5 w-3.5 text-muted-foreground" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {etat === "ok" && curseur && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => void voirPlus()}
            disabled={encore}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-input px-5 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {encore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Voir plus — {elements.length} sur {total.toLocaleString("fr-FR")}
          </button>
        </div>
      )}
    </section>
  );
}
