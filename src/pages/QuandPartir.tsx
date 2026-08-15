import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Compass, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EtatErreur, Squelettes } from "@/components/Etats";
import { cn } from "@/lib/utils";

/**
 * QUAND PARTIR OÙ — /quand-partir
 *
 * ⚠ C'EST LA PAGE QUI EXPLOITE LE FOSSÉ DÉFENSIF DU PRODUIT. Le référentiel
 *   porte, pour cinq grandes destinations, les douze mois de l'année avec leur
 *   note ET LEUR RAISON — « saison des pluies, pistes coupées », « baleines ».
 *   Personne d'autre ne publie le POURQUOI. Cette donnée dormait dans
 *   `place_seasons` depuis le lot 1 et n'était visible que sur la fiche d'un
 *   lieu, un lieu à la fois : impossible de répondre à la vraie question, qui
 *   est « je pars en août, où est-ce que ça vaut le coup ? ».
 *
 * ⚠ LE TABLEAU SE LIT DANS LES DEUX SENS. Par colonne, on compare un mois
 *   entre destinations ; par ligne, on lit l'année d'une destination. C'est
 *   exactement ce qu'un tableau sait faire et qu'une suite de fiches ne sait
 *   pas — et c'est la raison d'être d'un grand écran.
 *
 * ⚠ LA COUVERTURE EST ANNONCÉE EN CLAIR : 5 destinations sur 178. Ne montrer
 *   que les cinq sans le dire laisserait croire que le reste du pays n'a pas
 *   de saison.
 */

const MOIS_COURT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MOIS_LONG = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const NOTE = {
  ideale: { mot: "idéal", classe: "bg-ok text-white", pastille: "bg-ok" },
  correcte: { mot: "correct", classe: "bg-ok-soft text-ok", pastille: "bg-ok-soft" },
  deconseillee: {
    mot: "déconseillé",
    classe: "bg-accent/20 text-accent-strong",
    pastille: "bg-accent/30",
  },
} as const;

type Note = keyof typeof NOTE;

interface Lieu {
  slug: string;
  nom: string;
  region: string | null;
  resume: string | null;
  mois: { mois: number; note: Note | null; raison: string | null }[];
}

interface Donnees {
  lieux: Lieu[];
  nb_documentes: number;
  nb_lieux: number;
}

export default function QuandPartir() {
  useSEO({
    titre: "Quand partir à Madagascar — mois par mois, destination par destination",
    description:
      "Le calendrier réel de Madagascar : pour chaque destination, les mois idéaux, corrects et déconseillés — avec la raison. Baleines, pluies, pistes coupées.",
    url: "https://diako.fonenako.mg/quand-partir",
  });

  const [d, setD] = useState<Donnees | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "erreur">("chargement");
  const moisCourant = new Date().getMonth() + 1;
  const [moisChoisi, setMoisChoisi] = useState<number>(moisCourant);
  useReveal(d?.lieux.length);

  const charger = useCallback(async () => {
    setEtat("chargement");
    const { data, error } = await supabase.rpc("quand_partir");
    if (error) return setEtat("erreur");
    setD(data as unknown as Donnees);
    setEtat("ok");
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  /** Les destinations classées pour le mois choisi : idéal d'abord. */
  const pourLeMois = useMemo(() => {
    if (!d) return [];
    const rang: Record<string, number> = { ideale: 0, correcte: 1, deconseillee: 2 };
    return d.lieux
      .map((l) => ({ lieu: l, m: l.mois.find((x) => x.mois === moisChoisi) }))
      .filter((x) => x.m?.note)
      .sort((a, b) => rang[a.m!.note!] - rang[b.m!.note!]);
  }, [d, moisChoisi]);

  if (etat === "chargement")
    return (
      <div className="space-y-4 px-4 py-5">
        <div className="dk-skeleton h-8 w-2/3" />
        <Squelettes nombre={3} hauteur="h-16" />
      </div>
    );

  if (etat === "erreur" || !d)
    return (
      <div className="px-4 py-8">
        <EtatErreur onReessayer={() => void charger()} />
      </div>
    );

  return (
    <div className="px-4 py-5">
      <p className="dk-etiquette">Le calendrier réel</p>
      <h1 className="dk-titre mt-1">Quand partir où</h1>
      <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
        Pour chaque destination, les douze mois avec leur note{" "}
        <strong className="text-foreground">et leur raison</strong>. C'est le
        « pourquoi » qui compte : savoir qu'un mois est déconseillé ne sert à
        rien si on ignore que ce sont les pistes qui sont coupées, ou au
        contraire les baleines qu'on va rater.
      </p>

      {/* ── Le sélecteur de mois ─────────────────────────────────────────── */}
      <section className="dk-reveal mt-6">
        <h2 className="dk-etiquette">Je pars en…</h2>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {MOIS_LONG.map((m, i) => (
            <li key={m}>
              <button
                onClick={() => setMoisChoisi(i + 1)}
                aria-pressed={moisChoisi === i + 1}
                className={cn(
                  "min-h-10 rounded-full border px-3.5 text-sm font-medium capitalize transition",
                  moisChoisi === i + 1
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:border-primary hover:text-primary"
                )}
              >
                {m}
                {i + 1 === moisCourant && moisChoisi !== i + 1 && (
                  <span className="ml-1.5 text-[10px] opacity-70">· ce mois-ci</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── La réponse, classée ──────────────────────────────────────────── */}
      <section className="dk-reveal mt-5">
        <h2 className="text-lg font-semibold capitalize">
          En {MOIS_LONG[moisChoisi - 1]}
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 large:grid-cols-3">
          {pourLeMois.map(({ lieu, m }) => (
            <li key={lieu.slug}>
              <Link
                to={`/lieu/${lieu.slug}`}
                className="dk-carte block h-full rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-bold leading-tight">{lieu.nom}</p>
                    {lieu.region && <p className="dk-secondaire mt-0.5">{lieu.region}</p>}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase",
                      NOTE[m!.note!].classe
                    )}
                  >
                    {NOTE[m!.note!].mot}
                  </span>
                </div>
                {/* ⚠ LA RAISON EST LE CŒUR DE LA PAGE, pas une note de bas de
                    page : c'est elle qui permet de décider. */}
                {m!.raison && (
                  <p className="dk-corps mt-2.5 leading-relaxed text-muted-foreground">
                    {m!.raison}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Le tableau complet, qui se lit dans les deux sens ─────────────── */}
      <section className="dk-reveal mt-8">
        <h2 className="text-lg font-semibold">L'année entière</h2>
        <p className="dk-secondaire mt-1">
          Par colonne, comparez un mois entre destinations. Par ligne, lisez
          l'année d'une destination.
        </p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Saisonnalité mois par mois des destinations documentées
            </caption>
            <thead>
              <tr className="bg-secondary/60">
                <th scope="col" className="sticky left-0 z-10 bg-secondary/60 px-3 py-2 text-left font-semibold">
                  Destination
                </th>
                {MOIS_COURT.map((m, i) => (
                  <th
                    key={i}
                    scope="col"
                    title={MOIS_LONG[i]}
                    className={cn(
                      "px-1 py-2 text-center font-semibold",
                      moisChoisi === i + 1 && "bg-primary/15 text-primary"
                    )}
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.lieux.map((l) => (
                <tr key={l.slug} className="bg-card">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">
                    <Link to={`/lieu/${l.slug}`} className="hover:text-primary">
                      {l.nom}
                    </Link>
                  </th>
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = l.mois.find((x) => x.mois === i + 1);
                    return (
                      <td key={i} className="p-1">
                        <span
                          title={`${MOIS_LONG[i]} — ${
                            m?.note ? NOTE[m.note].mot : "non renseigné"
                          }${m?.raison ? ` : ${m.raison}` : ""}`}
                          className={cn(
                            "grid h-8 w-full place-items-center rounded text-[10px] font-bold",
                            m?.note ? NOTE[m.note].pastille : "bg-muted",
                            m?.note === "ideale" && "text-white",
                            m?.note === "correcte" && "text-ok",
                            m?.note === "deconseillee" && "text-accent-strong",
                            moisChoisi === i + 1 && "ring-2 ring-primary ring-offset-1"
                          )}
                        >
                          {m?.note ? NOTE[m.note].mot.slice(0, 3) : "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="mt-3 flex flex-wrap gap-3 text-xs">
          {(Object.keys(NOTE) as Note[]).map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("h-3.5 w-3.5 rounded", NOTE[k].pastille)} aria-hidden="true" />
              {NOTE[k].mot}
            </li>
          ))}
        </ul>
      </section>

      {/* ── LA COUVERTURE, DITE EN CLAIR ─────────────────────────────────── */}
      <section className="dk-reveal mt-8 rounded-2xl border border-dashed border-border p-5">
        <p className="inline-flex items-center gap-2 font-semibold">
          <CalendarCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          {d.nb_documentes} destination{d.nb_documentes > 1 ? "s" : ""} documentée
          {d.nb_documentes > 1 ? "s" : ""} sur {d.nb_lieux}
        </p>
        <p className="dk-secondaire mt-2 max-w-[70ch] leading-relaxed">
          Le reste du pays a évidemment ses saisons — elles ne sont simplement
          pas encore saisies. Ce sont des faits, pas des avis : n'importe quel
          voyageur qui connaît un endroit peut les documenter, et c'est comme ça
          que ce tableau s'allonge.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/publier"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            <Sun className="h-4 w-4" aria-hidden="true" />
            Documenter une destination
          </Link>
          <Link
            to="/explorer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input px-5 text-sm font-semibold"
          >
            <Compass className="h-4 w-4" aria-hidden="true" />
            Les {d.nb_lieux} destinations
          </Link>
        </div>
      </section>
    </div>
  );
}
