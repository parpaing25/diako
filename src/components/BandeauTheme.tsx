import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { FicheCard } from "@/components/FicheCard";
import { CarteLieu, CartePlat } from "@/components/CartesReferentiel";
import { useReveal } from "@/hooks/useReveal";
import type { CompteTheme } from "@/lib/api";
import {
  chargerFichesTheme,
  titreFiches,
  type FichesTheme,
  type ThemeFil,
} from "@/lib/themesFil";

/**
 * LE BLOC DE TÊTE D'UN ONGLET THÉMATIQUE — les fiches du thème.
 *
 * 🔴 C'EST CE BLOC QUI REND LES ONGLETS POSSIBLES. Mesuré le 01/09/2026, les
 *    récits seuls ne remplissent pas les six thèmes : restaurants 1, plats 3,
 *    location 0, voyages 0. Six onglets branchés sur les seules publications
 *    auraient donc ouvert sur du vide — ce que la charte du dépôt interdit
 *    explicitement (« un onglet vide coûte plus cher en confiance que son
 *    absence »). La matière existe, mais dans l'annuaire : 1 428 hôtels,
 *    1 872 restaurants, 95 plats, 508 destinations, 19 loueurs, 35 agences.
 *
 * ⚠ CE BLOC NE PAGINE PAS. C'est un aperçu de huit fiches suivi d'un lien vers
 *   l'écran qui, lui, va jusqu'au bout et sait filtrer. Le défilement infini de
 *   la page appartient aux RÉCITS, en dessous : deux scrolls infinis empilés et
 *   ni l'un ni l'autre n'est atteignable.
 *
 * ⚠ LE NOMBRE ANNONCÉ VIENT DU SERVEUR (`fil_themes_comptes`), jamais du nombre
 *   de vignettes chargées. Annoncer « 8 hôtels » au-dessus de huit vignettes
 *   quand la base en porte 1 428 est le compteur menteur que ce dépôt a déjà
 *   réparé deux fois (0092, 0108). Tant que le compte n'est pas arrivé, on
 *   n'écrit AUCUN chiffre.
 */
export function BandeauTheme({
  theme,
  compte,
}: {
  theme: ThemeFil;
  compte?: CompteTheme;
}) {
  const [fiches, setFiches] = useState<FichesTheme | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let vivant = true;
    setChargement(true);
    setErreur(false);
    setFiches(null);
    // ⚠ Six fiches d'établissement, huit plats ou destinations : la carte
    //   d'établissement porte un prix et une note, elle tient sur trois
    //   colonnes ; un plat n'a ni l'un ni l'autre et en supporte quatre.
    chargerFichesTheme(theme, theme.forme === "page" ? 6 : 8)
      .then((f) => {
        if (vivant) setFiches(f);
      })
      .catch(() => {
        if (vivant) setErreur(true);
      })
      .finally(() => {
        if (vivant) setChargement(false);
      });
    // ⚠ Le drapeau `vivant` n'est pas décoratif : changer d'onglet pendant un
    //   chargement affichait les hôtels sous l'étiquette « Restaurants ». Même
    //   défaut que le garde-fou `version` du fil, même correction.
    return () => {
      vivant = false;
    };
  }, [theme]);

  /* ⚠ ON PASSE `fiches`, PAS `fiches?.liste ?? []`. Le `?? []` fabrique un
     tableau NEUF à chaque rendu : sa référence change toujours, donc l'effet se
     relancerait à chaque rendu au lieu de se relancer à chaque arrivée de
     données. `fiches` ne change de référence qu'au `setFiches` — la condition
     exactement voulue par le hook. */
  useReveal(fiches);

  const n = compte?.fiches;

  return (
    <section className="mb-6" aria-labelledby={`titre-${theme.cle}`}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="dk-etiquette">{theme.label}</p>
          <h2 id={`titre-${theme.cle}`} className="text-lg font-semibold leading-tight">
            {n != null ? titreFiches(theme, n) : theme.label}
          </h2>
        </div>
        <Link
          to={theme.vers}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary"
        >
          Voir tout <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {theme.aussi && (
        <p className="mt-1 text-sm text-muted-foreground">
          <Link to={theme.aussi.vers} className="underline underline-offset-4 hover:text-foreground">
            {theme.aussi.libelle}
          </Link>
        </p>
      )}

      {chargement && (
        <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 large:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="dk-skeleton h-44 rounded-xl" />
          ))}
        </ul>
      )}

      {/* ⚠ UNE ERREUR DE CE BLOC NE DOIT PAS EMPORTER LES RÉCITS. On le dit et
          on continue : le fil en dessous reste lisible. */}
      {erreur && (
        <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          Les fiches n'ont pas pu être chargées. Le fil, lui, est plus bas.
        </p>
      )}

      {fiches?.forme === "page" && fiches.liste.length > 0 && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2 large:grid-cols-3">
          {fiches.liste.map((f) => (
            <FicheCard key={f.id} fiche={f} />
          ))}
        </div>
      )}

      {fiches?.forme === "plat" && fiches.liste.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 large:grid-cols-4">
          {fiches.liste.map((p) => (
            <li key={p.id}>
              <CartePlat plat={p} />
            </li>
          ))}
        </ul>
      )}

      {fiches?.forme === "lieu" && fiches.liste.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 large:grid-cols-4">
          {fiches.liste.map((l) => (
            <li key={l.id}>
              <CarteLieu lieu={l} />
            </li>
          ))}
        </ul>
      )}

      {/* La section reste en place même vide : « la page ne change pas de forme
          selon la base » (charte du dépôt). */}
      {!chargement && !erreur && fiches?.liste.length === 0 && (
        <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          Aucune fiche référencée dans cette catégorie pour l'instant.
        </p>
      )}
    </section>
  );
}
