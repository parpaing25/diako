import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Droplets,
  Eye,
  Landmark,
  Loader2,
  Mountain,
  MountainSnow,
  Palette,
  PawPrint,
  Search,
  Trees,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { EtatErreur } from "@/components/Etats";
import { ImageProgressive } from "@/components/ImageProgressive";
import { getThumbUrl } from "@/lib/imageThumb";
import { chargerSuggestions, lienDuChoix, type Suggestion } from "@/lib/envies";
import { porteDe } from "@/lib/decouvrir";
import { REGIONS_ADMIN } from "@/lib/grandesRegions";
import { cn } from "@/lib/utils";

/**
 * CE QU'UNE PORTE OUVRE — la liste d'une envie, en trois densités.
 *
 * 🔴 LA CONTRAINTE QUI COMMANDE TOUT, mesurée le 27/10/2026 : sur les 2 435
 *    sites publiés, 301 ont une photo. 26 plages sur 318, 28 sommets sur 791,
 *    1 grotte sur 27. Une grille de vignettes à cette échelle, c'est un mur de
 *    cadres gris — et c'est exactement ce que /sites faisait avant sa refonte.
 *
 * ⚠ TROIS DENSITÉS, CHOISIES PAR CE QU'ON SAIT DE LA FICHE, pas par sa place
 *   dans la liste :
 *     · une PHOTO            → la vedette, 160 px de haut, elle porte l'écran
 *     · un RÉSUMÉ, sans photo → la ligne, séparée d'un filet, sans ombre
 *     · RIEN QUE LE NOM       → la puce, un glyphe et un mot
 *   Le vide se compacte au lieu de s'étaler. Et le glyphe du genre fait le
 *   travail de l'image absente : il dit plage, sommet ou cascade d'un coup
 *   d'œil sans rien prétendre montrer de l'endroit.
 *
 * ⚠ L'ORDRE VIENT DU SERVEUR (`suggestions_envie`, tri photo puis résumé) :
 *   les trois densités arrivent donc déjà groupées. On ne retrie rien ici —
 *   un tri côté client sur une liste paginée réordonnerait à chaque volée.
 */

const PAR_VOLEE = 24;

/**
 * Combien de fiches passent en vedette — une grande, puis deux rangs de deux.
 *
 * 🔴 POURQUOI UN PLAFOND, ET PAS « TOUTES CELLES QUI ONT UNE PHOTO ».
 *    Deux raisons mesurées le 27/10/2026, sur l'envie « sommets » :
 *
 *    · LE VOLUME. 28 fiches sur 791 ont une photo, et le serveur les sert en
 *      tête : les 24 premières reçues sont donc presque toutes illustrées.
 *      Sans plafond, l'écran redevient un défilé de grandes images — 12 000 px
 *      de haut pour 24 fiches.
 *
 *    · LA QUALITÉ DES IMAGES. Ces photos viennent d'un import, et une part
 *      d'entre elles ne montre pas son sujet : Tsiafajavona et Mount Ambohitra
 *      affichent une CARTE topographique, Tanambao un couloir d'hôpital.
 *      Agrandir cinq images douteuses coûte moins cher que d'en agrandir
 *      vingt-quatre. Ce n'est pas un correctif — c'est une donnée à nettoyer,
 *      signalée comme telle — mais le dessin n'a pas à l'amplifier.
 *
 * ⚠ RIEN N'EST CACHÉ : au-delà du plafond, une fiche illustrée devient une
 *   LIGNE, vignette comprise. Elle est toujours là, elle prend moins de place.
 */
const MAX_VEDETTES = 5;

/** ⚠ Plus court, une requête part par LETTRE tapée : sur une 3G les réponses
 *  reviennent dans le désordre et la liste clignote. */
const ATTENTE_FRAPPE = 350;

const GENRE: Record<string, string> = {
  plage: "plage", parc: "parc national", reserve: "réserve",
  parc_animalier: "parc animalier", cascade: "cascade", grotte: "grotte",
  source: "source", aire: "aire protégée", sommet: "sommet",
  point_de_vue: "point de vue", patrimoine: "patrimoine", musee: "musée",
  oeuvre: "œuvre", site: "site", plat: "plat",
};

/**
 * ⚠ DÉCORATIF, TOUJOURS DOUBLÉ DU GENRE ÉCRIT. Un lecteur d'écran entend
 *   « plage », pas une vague.
 */
const GLYPHE: Record<string, LucideIcon> = {
  plage: Waves, parc: Trees, reserve: Trees, aire: Trees,
  parc_animalier: PawPrint, cascade: Droplets, source: Droplets,
  grotte: Mountain, sommet: MountainSnow, point_de_vue: Eye,
  patrimoine: Landmark, musee: Landmark, oeuvre: Palette, site: Mountain,
  plat: UtensilsCrossed,
};

const nombre = (n: number) => n.toLocaleString("fr-FR");

/** Où se trouve la fiche, dit comme on se le demande avant d'y aller. */
function situation(s: Suggestion): string {
  const bouts: string[] = [];
  if (s.ville) {
    bouts.push(
      s.km_ville !== null && s.km_ville > 0 ? `à ${s.km_ville} km de ${s.ville}` : s.ville
    );
  }
  if (s.region && s.region !== s.ville) bouts.push(s.region);
  return bouts.join(" · ");
}

export function ListeEnvie({ code }: { code: string }) {
  const porte = porteDe(code);
  const [q, setQ] = useState("");
  const [saisie, setSaisie] = useState("");
  const [region, setRegion] = useState<string | null>(null);
  const [elements, setElements] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [curseur, setCurseur] = useState<string | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "erreur">("chargement");
  const [encore, setEncore] = useState(false);

  /** ⚠ CHAQUE RECHERCHE PORTE UN NUMÉRO : sans lui, la réponse lente à « pla »
   *  arrivant après celle à « plage » écrase la bonne liste. */
  const numero = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQ(saisie), ATTENTE_FRAPPE);
    return () => clearTimeout(t);
  }, [saisie]);

  const charger = useCallback(async () => {
    const mien = ++numero.current;
    setEtat("chargement");
    try {
      const p = await chargerSuggestions(code, { q, region, limite: PAR_VOLEE });
      if (mien !== numero.current) return;
      setElements(p.elements);
      setTotal(p.total);
      setCurseur(p.curseur);
      setEtat("ok");
    } catch {
      if (mien === numero.current) setEtat("erreur");
    }
  }, [code, q, region]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const voirPlus = useCallback(async () => {
    if (!curseur || encore) return;
    const mien = numero.current;
    setEncore(true);
    try {
      const p = await chargerSuggestions(code, { q, region, curseur, limite: PAR_VOLEE });
      if (mien !== numero.current) return;
      setElements((v) => [...v, ...p.elements]);
      setCurseur(p.curseur);
    } catch {
      /* La liste déjà reçue reste à l'écran : une volée ratée n'efface rien. */
    } finally {
      setEncore(false);
    }
  }, [code, curseur, encore, q, region]);

  /** Les trois densités, découpées sur la liste TELLE QUE LE SERVEUR LA REND. */
  const { vedettes, lignes, puces } = useMemo(() => {
    const vedettes: Suggestion[] = [];
    const lignes: Suggestion[] = [];
    const puces: Suggestion[] = [];
    for (const s of elements) {
      if (s.cover_url && vedettes.length < MAX_VEDETTES) vedettes.push(s);
      else if (s.cover_url || (s.resume && s.resume.trim() !== "")) lignes.push(s);
      else puces.push(s);
    }
    return { vedettes, lignes, puces };
  }, [elements]);

  if (!porte) return null;

  const filtre = q.trim() !== "" || region !== null;

  return (
    <div>
      {/* ── CHERCHER ET RESTREINDRE ──────────────────────────────────────
          ⚠ Il y a 824 sommets : une liste qu'on parcourt à la main n'existe
            pas à cette échelle. */}
      {/* ⚠ LE CHAMP PREND TOUTE LA LARGEUR AU TÉLÉPHONE. Côte à côte, le
          sélecteur de région mangeait la moitié des 390 px et le champ
          affichait « Chercher un no… » — le geste principal tronqué par le
          geste secondaire. */}
      <div className="flex flex-wrap gap-2">
        <label className="relative w-full min-w-0 sm:flex-1">
          <span className="sr-only">Chercher parmi les {porte.quoi}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Chercher un nom…"
            className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-[16px] outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <select
          aria-label="Filtrer par région"
          value={region ?? ""}
          onChange={(e) => setRegion(e.target.value || null)}
          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus:ring-2 focus:ring-ring sm:w-auto"
        >
          <option value="">Toutes les régions</option>
          {REGIONS_ADMIN.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {etat === "ok" && (
        <p className="dk-secondaire mt-2.5 tabular-nums">
          {nombre(total)} {total > 1 ? "résultats" : "résultat"}
          {region ? ` dans ${region}` : ""}
        </p>
      )}

      {etat === "erreur" && <EtatErreur className="mt-4" onReessayer={() => void charger()} />}

      {etat === "chargement" && (
        <div className="mt-4 space-y-2" aria-hidden="true">
          <div className="dk-skeleton h-40 rounded-2xl" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="dk-skeleton h-14 rounded-xl" />
          ))}
        </div>
      )}

      {etat === "ok" && elements.length === 0 && (
        /* 🔴 UNE LISTE VIDE SANS UN MOT PASSE POUR UNE PANNE. */
        <p className="mt-5 rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
          Rien ne correspond{q ? ` à « ${q} »` : ""}
          {region ? ` dans ${region}` : ""}.{" "}
          {filtre && (
            <button
              onClick={() => { setSaisie(""); setQ(""); setRegion(null); }}
              className="font-medium text-primary underline underline-offset-4"
            >
              Tout afficher
            </button>
          )}
        </p>
      )}

      {/* 🔴 UNE GRANDE, PUIS DEUX PAR RANG. En une seule colonne à 390 px,
          chaque fiche illustrée mangeait 300 px : sur l'envie « sommets », où
          les 24 premières fiches reçues sont justement celles qui ont une
          photo, l'écran redevenait un défilé de deux cartes par écran. La
          première garde sa pleine largeur — elle décide du LCP et c'est elle
          qui donne envie ; les suivantes se comparent côte à côte. */}
      {etat === "ok" && vedettes.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
          {vedettes.map((s, i) => (
            <li key={s.ref} className={i === 0 ? "col-span-2 xl:col-span-1" : undefined}>
              <Vedette s={s} lcp={i === 0} grande={i === 0} />
            </li>
          ))}
        </ul>
      )}

      {etat === "ok" && lignes.length > 0 && (
        <ul className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
          {lignes.map((s) => (
            <li key={s.ref} className="border-b border-border last:border-b-0">
              <Ligne s={s} />
            </li>
          ))}
        </ul>
      )}

      {etat === "ok" && puces.length > 0 && (
        <section className="mt-5">
          {/* 🔴 ON DIT CE QUE C'EST, au lieu de le cacher : ces fiches n'ont
              qu'un nom et une position. L'annoncer évite de faire croire que le
              site a perdu les descriptions en route. */}
          <h3 className="dk-secondaire">
            {nombre(puces.length)} {puces.length > 1 ? "n'ont" : "n'a"} que leur nom et leur position
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {puces.map((s) => (
              <li key={s.ref}>
                <Puce s={s} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {etat === "ok" && curseur && (
        <div className="mt-5 flex justify-center">
          <button
            onClick={() => void voirPlus()}
            disabled={encore}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input px-5 text-sm font-semibold hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {encore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Voir plus — {nombre(elements.length)} sur {nombre(total)}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── LA VEDETTE : celle qui a une photo ────────────────────────────────── */

function Vedette({ s, lcp, grande }: { s: Suggestion; lcp: boolean; grande: boolean }) {
  const ou = situation(s);
  return (
    <Link
      to={lienDuChoix(s)}
      className="dk-carte group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div
        className={cn(
          "dk-zoom w-full overflow-hidden bg-muted",
          grande ? "aspect-[16/10]" : "aspect-[4/3]"
        )}
      >
        <ImageProgressive
          src={s.cover_url!}
          alt={s.nom}
          ajustement="cover"
          prioritaire={lcp}
          largeurAffichee={
            grande
              ? "(min-width:1280px) 30vw, 92vw"
              : "(min-width:1280px) 30vw, 46vw"
          }
        />
      </div>
      <div className={cn("flex flex-1 flex-col gap-0.5", grande ? "p-3" : "p-2.5")}>
        <h3 className={cn("font-semibold leading-tight", !grande && "text-[15px]")}>{s.nom}</h3>
        <p className="dk-secondaire">
          {GENRE[s.kind] ?? s.kind}
          {ou && ` · ${ou}`}
        </p>
        {/* ⚠ Le résumé ne tient que sur la grande : dans une demi-colonne à
            390 px, deux lignes de texte gris poussent le nom hors de vue. */}
        {grande && s.resume && (
          <p className="dk-secondaire mt-1 line-clamp-2 text-muted-foreground">{s.resume}</p>
        )}
      </div>
    </Link>
  );
}

/* ── LA LIGNE : un résumé, pas de photo ────────────────────────────────── */

function Ligne({ s }: { s: Suggestion }) {
  const Glyphe = GLYPHE[s.kind] ?? Mountain;
  const ou = situation(s);
  return (
    <Link to={lienDuChoix(s)} className="flex min-h-[56px] items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
      {/* ⚠ La vignette ne prend sa place que si elle existe. */}
      {s.cover_url ? (
        <img
          src={getThumbUrl(s.cover_url)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-teal-soft text-primary-fort"
        >
          <Glyphe className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium leading-tight">{s.nom}</span>
        <span className="dk-secondaire block truncate">
          {GENRE[s.kind] ?? s.kind}
          {ou && ` · ${ou}`}
        </span>
        {s.resume && (
          <span className="dk-secondaire block truncate text-muted-foreground">{s.resume}</span>
        )}
      </span>
    </Link>
  );
}

/* ── LA PUCE : rien que le nom ─────────────────────────────────────────── */

function Puce({ s }: { s: Suggestion }) {
  const Glyphe = GLYPHE[s.kind] ?? Mountain;
  return (
    <Link
      to={lienDuChoix(s)}
      title={situation(s) || undefined}
      className={cn(
        "inline-flex min-h-11 max-w-[min(100%,20rem)] items-center gap-2 rounded-full",
        "border border-border bg-card py-1.5 pl-1.5 pr-3.5 text-sm hover:border-primary hover:text-primary"
      )}
    >
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-soft text-primary-fort"
      >
        <Glyphe className="h-4 w-4" />
      </span>
      <span className="truncate font-medium">{s.nom}</span>
    </Link>
  );
}
