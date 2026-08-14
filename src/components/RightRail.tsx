import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FEUILLE_DE_ROUTE } from "@/lib/nav";

const COULEURS: Record<string, string> = {
  ouvert: "bg-primary/10 text-primary",
  "en cours": "bg-accent/10 text-accent",
  "à venir": "bg-muted text-muted-foreground",
};

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

interface Saison {
  slug: string;
  nom: string;
  region: string | null;
  raison: string | null;
}

/**
 * Rail de droite (≥ 1280 px).
 *
 * ⚠ Il ne contient QUE du contenu réel. Sur la version précédente de Diako,
 * cette colonne affichait « Nosy Be 1.2k posts », « Hôtel Sakamanga 4.8
 * (245 avis) » et « Festival Donia 15 Déc 2024 » — entièrement inventés, et
 * périmés de deux ans. On ne rejoue pas ça.
 *
 * ⚠ CE QUE LE MODÈLE DEMANDAIT ET QUI N'Y EST PAS. La maquette prévoit un bloc
 *   « plats les plus cherchés » avec des fourchettes de prix. `menu_items` est
 *   vide et il n'existe aucune mesure de recherche : le remplir voudrait dire
 *   inventer des prix en ariary, exactement ce qu'on s'interdit. Le bloc
 *   apparaîtra le jour où les cartes seront saisies.
 *
 * En revanche « la saison en cours » est vraie : `place_seasons` porte, mois
 * par mois, si une destination est idéale et pourquoi.
 */
export function RightRail() {
  const [saison, setSaison] = useState<Saison[] | null>(null);
  const mois = MOIS[new Date().getMonth()];

  useEffect(() => {
    void supabase
      .rpc("saison_du_mois", { p_mois: null, p_limite: 5 })
      .then(({ data }) => setSaison((data as Saison[] | null) ?? []));
  }, []);

  return (
    <aside
      aria-label="À propos de Diako"
      className="sticky top-14 hidden h-fit w-72 shrink-0 space-y-4 py-4 xl:block 2xl:w-80"
    >
      {/* ── La saison ─────────────────────────────────────────────────── */}
      {saison !== null && saison.length > 0 && (
        <section className="dk-liseré-or rounded-2xl border border-border bg-card p-4">
          <h2 className="dk-etiquette flex items-center gap-1.5">
            <Sun className="h-3.5 w-3.5 text-or" aria-hidden="true" />
            La saison en cours
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Où il fait bon aller en {mois}.
          </p>
          <ul className="mt-3 space-y-2.5">
            {saison.map((s) => (
              <li key={s.slug}>
                <Link to={`/explorer?lieu=${s.slug}`} className="group block">
                  <span className="text-sm font-semibold group-hover:text-primary">
                    {s.nom}
                  </span>
                  {s.region && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{s.region}</span>
                  )}
                  {s.raison && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {s.raison}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── L'avancement réel ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="dk-etiquette">Ce qui arrive sur Diako</h2>
        <ul className="mt-3 space-y-2">
          {FEUILLE_DE_ROUTE.map(({ quoi, etat }) => (
            <li key={quoi} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${COULEURS[etat]}`}
              >
                {etat}
              </span>
              <span className="text-muted-foreground">{quoi}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── L'espace pro, en sombre : c'est l'appel qui doit ressortir ── */}
      <section className="rounded-2xl bg-foreground p-4 text-background">
        <h2 className="dk-etiquette !text-background/60">Espace pro</h2>
        <p className="dk-edito mt-1.5 text-lg leading-snug">
          Votre établissement, <em className="!text-background">tel que vous le décrivez.</em>
        </p>
        <p className="mt-2 text-sm text-background/70">
          Hôtel, restaurant, agence ou guide : publiez vos tarifs, votre carte
          et vos circuits, et répondez directement aux voyageurs.
        </p>
        <Link
          to="/pro"
          className="mt-3 inline-flex min-h-10 items-center rounded-full bg-background px-4 text-sm font-semibold text-foreground"
        >
          Créer ma page
        </Link>
      </section>

      {/* Le rappel qui vaut engagement : les tarifs vieillissent. */}
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Les tarifs affichés sont ceux relevés à la publication. Ils changent —
        signalez-nous une erreur depuis la fiche.
      </p>
    </aside>
  );
}
