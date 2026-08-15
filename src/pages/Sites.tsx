import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, Trees } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EmptyState, EtatErreur } from "@/components/Etats";
import { ImageProgressive } from "@/components/ImageProgressive";
import { ariary } from "@/lib/etablissements";
import { chargerSites, type SiteListe } from "@/lib/decouverte";

/**
 * SITES ET PARCS — /sites (écran N2 du design final, vue liste).
 *
 * ⚠ LA DOUBLE GRILLE RÉSIDENT / NON-RÉSIDENT EST AFFICHÉE DÈS LA VIGNETTE.
 *   Les parcs nationaux malgaches facturent deux tarifs, et l'écart va de un à
 *   cinq ou dix. Montrer un seul prix tromperait la moitié des visiteurs, dans
 *   un sens ou dans l'autre — un Malgache croirait le parc hors de portée, un
 *   étranger arriverait avec la moitié de la somme.
 *
 * ⚠ LES FADY SONT PORTÉS PAR LA FICHE, pas par une note de bas de page. Les
 *   interdits locaux n'existent sur aucun concurrent : c'est une marque de
 *   respect autant qu'une information utile.
 */
export default function Sites() {
  useSEO({
    titre: "Sites et parcs de Madagascar — tarifs et fady",
    description:
      "Les parcs nationaux et sites à visiter de Madagascar : entrée résident et non-résident, guide obligatoire ou non, meilleurs mois, et les fady à respecter.",
    url: "https://diako.fonenako.mg/sites",
  });

  const [sites, setSites] = useState<SiteListe[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  useReveal(sites.length);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(false);
    try {
      setSites(await chargerSites(24));
    } catch {
      setErreur(true);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  return (
    <div className="px-4 py-5">
      <p className="dk-etiquette">Nature et patrimoine</p>
      <h1 className="dk-titre mt-1">Sites et parcs</h1>
      <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
        Les parcs nationaux et les sites à visiter, avec leurs deux tarifs
        d'entrée, le guide quand il est obligatoire, les meilleurs mois — et les
        fady à respecter sur place.
      </p>

      {erreur && <EtatErreur className="mt-5" onReessayer={() => void charger()} />}

      {chargement && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="dk-skeleton h-56 rounded-2xl" />
          ))}
        </ul>
      )}

      {!chargement && sites.length > 0 && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
          {sites.map((s) => (
            <li key={s.id}>
              <Link
                to={`/site/${s.slug}`}
                className="dk-reveal dk-carte block overflow-hidden rounded-2xl border border-border bg-card"
              >
                <div className="dk-zoom aspect-[4/3] bg-secondary">
                  {s.cover_url ? (
                    <ImageProgressive src={s.cover_url} alt={s.name} ajustement="cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center">
                      <Trees className="h-8 w-8 text-primary/40" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="p-3.5">
                  <p className="dk-etiquette">{s.kind}</p>
                  <h2 className="mt-1 truncate text-[16px] font-bold leading-tight">{s.name}</h2>
                  {s.place && <p className="dk-secondaire mt-0.5 truncate">{s.place.name_fr}</p>}

                  {/* ⚠ LES DEUX TARIFS, TOUJOURS ENSEMBLE ET TOUJOURS NOMMÉS. */}
                  {(s.fee_resident_ar != null || s.fee_nonresident_ar != null) && (
                    <dl className="mt-3 space-y-1 border-t border-border pt-2.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Entrée · résident</dt>
                        <dd className="font-semibold tabular-nums">
                          {s.fee_resident_ar != null ? ariary(s.fee_resident_ar) : "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Entrée · non-résident</dt>
                        <dd className="font-semibold tabular-nums">
                          {s.fee_nonresident_ar != null ? ariary(s.fee_nonresident_ar) : "—"}
                        </dd>
                      </div>
                      {s.guide_required && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Guide obligatoire</dt>
                          <dd className="text-right font-semibold tabular-nums">
                            {s.guide_fee_group_ar != null
                              ? `${ariary(s.guide_fee_group_ar)} / groupe`
                              : "par groupe"}
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}

                  {s.fady.length > 0 && (
                    <p className="mt-2.5 rounded-lg bg-gold-soft px-2.5 py-1.5 text-[11px] font-semibold text-warn">
                      {s.fady.length} fady à respecter
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!chargement && sites.length === 0 && !erreur && (
        <EmptyState
          className="mt-5"
          icone={Trees}
          manque="Aucun site n'est encore documenté sur Diako."
          action={{ libelle: "Raconter une visite", lien: "/publier" }}
          contenuReel={
            <>
              <p className="dk-secondaire leading-relaxed">
                Les parcs et les sites arrivent avec leurs deux grilles de tarifs
                et leurs fady, saisis un par un. En attendant, les destinations
                du référentiel portent déjà leur saisonnalité et leurs accès.
              </p>
              <Link
                to="/explorer"
                className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold"
              >
                <Compass className="h-4 w-4" aria-hidden="true" />
                Explorer les destinations
              </Link>
            </>
          }
        />
      )}
    </div>
  );
}
