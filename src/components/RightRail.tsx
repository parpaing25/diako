import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Heart, MessageCircle, Bookmark, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FEUILLE_DE_ROUTE } from "@/lib/nav";
import { choisirEnVogue } from "@/lib/tendance";
import { cn } from "@/lib/utils";

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

interface Vogue {
  id: string;
  body: string | null;
  place: string | null;
  dish: string | null;
  created_at: string;
  reactions_count: number;
  comments_count: number;
  saves_count: number;
  auteur_nom: string | null;
}

interface Stats {
  recits: number;
  etablissements: number;
  destinations: number;
  plats: number;
  membres: number;
  vues_7j: number;
}

/**
 * Le compteur qui monte.
 *
 * ⚠ Il part de la VRAIE valeur et y arrive : on n'affiche jamais un chiffre
 *   faux, même une demi-seconde. L'animation ne dure que 900 ms et
 *   `prefers-reduced-motion` la supprime — un compteur qui défile est
 *   exactement ce qui déclenche une gêne vestibulaire.
 */
function Compteur({ valeur }: { valeur: number }) {
  const [n, setN] = useState(valeur);
  const precedent = useRef(0);

  useEffect(() => {
    const doux = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!doux || valeur === precedent.current) {
      precedent.current = valeur;
      setN(valeur);
      return;
    }
    const depart = precedent.current;
    const t0 = performance.now();
    let brut = 0;
    const pas = (t: number) => {
      const p = Math.min((t - t0) / 900, 1);
      // Sortie en douceur : la fin est ce qu'on lit, elle ne doit pas sauter.
      setN(Math.round(depart + (valeur - depart) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) brut = requestAnimationFrame(pas);
      else precedent.current = valeur;
    };
    brut = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(brut);
  }, [valeur]);

  return <>{n.toLocaleString("fr-FR")}</>;
}

/**
 * Rail de droite (≥ 1280 px).
 *
 * ⚠ Il ne contient QUE du contenu réel. Sur la version précédente de Diako,
 * cette colonne affichait « Nosy Be 1.2k posts », « Hôtel Sakamanga 4.8
 * (245 avis) » et « Festival Donia 15 Déc 2024 » — entièrement inventés, et
 * périmés de deux ans. Un compteur qui ment une fois ne se rattrape jamais.
 *
 * ⚠ CE QUE LE MODÈLE DEMANDAIT ET QUI N'Y EST PAS. La maquette prévoit un bloc
 *   « plats les plus cherchés » avec des fourchettes de prix. `menu_items` est
 *   vide et il n'existe aucune mesure de recherche : le remplir voudrait dire
 *   inventer des prix en ariary. Le bloc viendra avec les cartes.
 *
 * Monté uniquement en desktop (le parent ne le rend pas en dessous) et non pas
 * masqué en CSS : un composant masqué fait quand même ses requêtes.
 */
export function RightRail() {
  const [saison, setSaison] = useState<Saison[] | null>(null);
  const [vogue, setVogue] = useState<Vogue[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const mois = MOIS[new Date().getMonth()];

  useEffect(() => {
    // Trois appels, une seule fois, en parallèle. Aucun canal temps réel : la
    // règle d'egress du projet le réserve au chat et aux notifications.
    void supabase
      .rpc("saison_du_mois", { p_mois: null, p_limite: 5 })
      .then(({ data }) => setSaison((data as Saison[] | null) ?? []));
    void supabase.rpc("stats_diako").then(({ data }) => setStats(data as Stats | null));
    void supabase.rpc("recits_en_vogue", { p_limite: 12 }).then(({ data }) => {
      // Le tirage pondéré se fait CÔTÉ CLIENT : la base rend les meilleurs,
      // le rail en montre quatre différents à chaque visite.
      const tous = (data as Vogue[] | null) ?? [];
      setVogue(choisirEnVogue(tous, 4));
    });
  }, []);

  const total = vogue?.reduce(
    (t, v) => Math.max(t, v.reactions_count + v.comments_count + v.saves_count),
    0
  );

  return (
    <aside
      aria-label="À propos de Diako"
      /* ⚠ `h-fit` seul rendait le BAS DU RAIL INATTEIGNABLE : collé en haut,
         plus haut que l'écran, il ne défilait ni avec la page ni pour
         lui-même. On borne sa hauteur à celle de la fenêtre et on lui donne
         son propre défilement — `overscroll-contain` évite d'entraîner la
         page quand on arrive au bout. */
      className="dk-rail sticky top-14 hidden max-h-[calc(100dvh-3.5rem)] w-72 shrink-0 space-y-4 overflow-y-auto overscroll-contain py-4 [scrollbar-width:thin] xl:block 2xl:w-80"
    >
      {/* ── Les chiffres, vrais ────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="dk-etiquette flex items-center gap-1.5">
          <span className="dk-direct" aria-hidden="true" />
          Diako en ce moment
        </h2>
        {stats === null ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="dk-skeleton h-12 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3.5">
            {[
              { n: stats.recits, quoi: "récits", ou: "/" },
              { n: stats.etablissements, quoi: "adresses", ou: "/carte" },
              { n: stats.destinations, quoi: "destinations", ou: "/explorer" },
              { n: stats.plats, quoi: "plats référencés", ou: "/recherche" },
            ].map((c) => (
              <Link key={c.quoi} to={c.ou} className="group block">
                <span className="dk-edito block text-2xl leading-none text-primary">
                  <Compteur valeur={c.n} />
                </span>
                <span className="mt-1 block text-xs text-muted-foreground group-hover:text-foreground">
                  {c.quoi}
                </span>
              </Link>
            ))}
          </div>
        )}
        {stats !== null && stats.vues_7j > 0 && (
          <p className="mt-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              <Compteur valeur={stats.vues_7j} />
            </span>{" "}
            pages vues ces 7 derniers jours
          </p>
        )}
      </section>

      {/* ── En vogue ───────────────────────────────────────────────────── */}
      {vogue !== null && vogue.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="dk-etiquette flex items-center gap-1.5">
            <Flame className="dk-flamme h-3.5 w-3.5 text-accent" aria-hidden="true" />
            En vogue cette semaine
          </h2>
          <ol className="mt-3 space-y-3">
            {vogue.map((v, i) => {
              const n = v.reactions_count + v.comments_count + v.saves_count;
              return (
                <li key={v.id}>
                  <Link to={`/post/${v.id}`} className="dk-ligne-tendance group block">
                    <span className="flex items-baseline gap-2">
                      <span className="dk-edito text-lg leading-none text-or">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold group-hover:text-primary">
                          {v.place ?? v.dish ?? v.auteur_nom ?? "Un récit"}
                        </span>
                        {v.body && (
                          <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {v.body}
                          </span>
                        )}
                      </span>
                    </span>
                    {/* La jauge dit la part d'attention par rapport au premier :
                        un nombre seul ne se compare pas d'un coup d'œil. */}
                    <span className="mt-1.5 flex items-center gap-2 pl-6">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="dk-jauge block h-full rounded-full bg-accent/70"
                          style={{ width: `${total ? Math.round((n / total) * 100) : 0}%` }}
                        />
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                        {v.reactions_count > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Heart className="h-3 w-3" aria-hidden="true" />
                            {v.reactions_count}
                          </span>
                        )}
                        {v.comments_count > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <MessageCircle className="h-3 w-3" aria-hidden="true" />
                            {v.comments_count}
                          </span>
                        )}
                        {v.saves_count > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Bookmark className="h-3 w-3" aria-hidden="true" />
                            {v.saves_count}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
            Classé sur l'attention reçue <em>par jour</em>, pas sur un total —
            un récit d'hier peut passer devant un récit du mois dernier.
          </p>
        </section>
      )}

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
                <Link to={`/lieu/${s.slug}`} className="dk-ligne-tendance group block">
                  <span className="text-sm font-semibold group-hover:text-primary">{s.nom}</span>
                  {s.region && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{s.region}</span>
                  )}
                  {s.raison && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{s.raison}</span>
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
                className={cn(
                  "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  COULEURS[etat]
                )}
              >
                {etat}
              </span>
              <span className="text-muted-foreground">{quoi}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── L'espace pro, en sombre : c'est l'appel qui doit ressortir ── */}
      <section className="dk-brillance rounded-2xl bg-foreground p-4 text-background">
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
          className="mt-3 inline-flex min-h-10 items-center rounded-full bg-background px-4 text-sm font-semibold text-foreground transition hover:scale-[1.03]"
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
