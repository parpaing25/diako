import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMediaQuery } from "@/hooks/use-mobile";
import { Flame, Heart, MessageCircle, Bookmark, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserData } from "@/contexts/UserDataContext";
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

/**
 * ⚠ CE BLOC NE DIT PLUS « OÙ IL FAIT BEAU », IL DIT CE QUI SE PASSE.
 *
 * 🔴 Il affichait la saisonnalité météo de cinq destinations — « Isalo · sec ».
 *    Vrai, mais sans conséquence : personne ne prend un vol parce qu'il fait
 *    sec. Ce qui décide d'un voyage, ce sont les baleines de juillet à octobre,
 *    la vanille verte de fin juillet, le Sômarôho début août.
 *
 * ⚠ CHAQUE LIGNE PORTE SA SOURCE ET SON DEGRÉ DE CERTITUDE. La plupart de ces
 *   rendez-vous n'ont pas de date fixe : le Sômarôho s'est tenu en juillet en
 *   2023 et en août depuis. On affiche la PÉRIODE telle qu'elle a été vérifiée,
 *   avec sa réserve — jamais un jour inventé pour faire propre.
 */
interface Evenement {
  slug: string;
  titre: string;
  genre: string;
  lieu: string | null;
  region: string | null;
  periode: string | null;
  description: string | null;
  source: string | null;
  confiance: string | null;
  recurrent: boolean;
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
 * Rail de droite.
 *
 * ⚠ 320 px fixes, à partir de 1024 (gabarit v4). Il entre AVANT le rail gauche,
 *   qui n'arrive qu'à 1280 : la première place gagnée sur un écran d'ordinateur
 *   sert à montrer la saison et les tendances, pas à étirer le fil. Sa largeur
 *   ne varie plus — c'est elle qui rend les largeurs de contenu calculables
 *   (664 / 640 / 800 / 1242 aux quatre seuils).
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
  const { profile } = useUserData();
  /**
   * La position du lecteur, DÉDUITE DE SA VILLE DÉCLARÉE.
   *
   * ⚠ On resout la ville une fois, en base, contre le referentiel des lieux.
   *   Pas de GPS : demander la geolocalisation pour classer un bloc de rail
   *   serait disproportionne, et une demande non sollicitee est refusee par
   *   reflexe — ce qui fermerait la porte la ou on en a vraiment besoin.
   */
  const [ici, setIci] = useState<{ lat: number; lng: number } | null>(null);
  const villeDeclaree = profile?.home_place ?? null;

  useEffect(() => {
    if (!villeDeclaree) {
      setIci(null);
      return;
    }
    let vivant = true;
    void supabase
      .rpc("chercher_lieux", { p_q: villeDeclaree, p_limite: 1 })
      .then(({ data }) => {
        const l = (data as { id: string }[] | null)?.[0];
        if (!vivant || !l) return;
        void supabase
          .from("places")
          .select("lat,lng")
          .eq("id", l.id)
          .maybeSingle()
          .then(({ data: d }) => {
            const c = d as { lat: number | null; lng: number | null } | null;
            if (vivant && c?.lat != null && c.lng != null) setIci({ lat: c.lat, lng: c.lng });
          });
      });
    return () => {
      vivant = false;
    };
  }, [villeDeclaree]);

  const [saison, setSaison] = useState<Evenement[] | null>(null);
  const [vogue, setVogue] = useState<Vogue[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const mois = MOIS[new Date().getMonth()];
  const { pathname } = useLocation();
  /**
   * 🔴 DEFAUT CORRIGE. Ce rail est masque en CSS (`hidden … lg:block`), mais il
   *    etait MONTE quand meme : ses trois requetes partaient sur un telephone
   *    de 390 px, dont `recits_en_vogue(12)` qui ramene le corps ET les medias
   *    de douze publications. Le commentaire du fichier affirmait exactement le
   *    contraire (« monte uniquement en desktop »).
   *    ⚠ Un composant masque en CSS est monte, ses effets s'executent, ses
   *      requetes partent. Seul un test en JavaScript l'evite — et sur la 3G
   *      visee, c'est la difference entre un fil qui s'affiche et un fil qui
   *      attend derriere trois requetes invisibles.
   */
  const assezLarge = useMediaQuery("(min-width: 1024px)");

  // ⚠ TROIS ÉCRANS ONT DÉJÀ LEUR COLONNE DE DROITE et elle vaut mieux que ce
  //   rail : le panneau de demande sur une fiche, la carte à côté des
  //   résultats, la carte plein écran. Deux colonnes de droite côte à côte ne
  //   tiennent pas en 1560 px, et surtout : quelqu'un qui lit une fiche décide
  //   d'y aller — lui proposer d'autres récits à cet instant lui fait quitter
  //   la page qu'il était en train de choisir.
  const aSaPropreColonne =
    pathname.startsWith("/p/") ||
    pathname.startsWith("/recherche") ||
    pathname.startsWith("/carte");

  const inutile = aSaPropreColonne || !assezLarge;

  useEffect(() => {
    if (inutile) return;
    // Trois appels, une seule fois, en parallèle. Aucun canal temps réel : la
    // règle d'egress du projet le réserve au chat et aux notifications.
    void supabase
      .rpc("saison_en_cours", { p_mois: null })
      .then(({ data }) => setSaison((data as unknown as Evenement[] | null) ?? []));
    void supabase.rpc("stats_diako").then(({ data }) => setStats(data as Stats | null));
    // ⚠ LA POSITION VIENT DE LA VILLE DÉCLARÉE, jamais du GPS. Demander la
    //   géolocalisation pour classer un bloc de rail serait disproportionné —
    //   et une demande non sollicitée est refusée par réflexe, ce qui ferme la
    //   porte pour les cas où on en a vraiment besoin (« près de moi »).
    //   Sans ville déclarée, le terme de proximité vaut zéro et le classement
    //   reste celui de l'attention : on ne devine pas une position.
    void supabase
      .rpc("recits_en_vogue", { p_limite: 12, p_lat: ici?.lat ?? null, p_lng: ici?.lng ?? null })
      .then(({ data }) => {
      // Le tirage pondéré se fait CÔTÉ CLIENT : la base rend les meilleurs,
      // le rail en montre quatre différents à chaque visite.
      const tous = (data as Vogue[] | null) ?? [];
      setVogue(choisirEnVogue(tous, 4));
    });
  }, [inutile, ici]);

  const total = vogue?.reduce(
    (t, v) => Math.max(t, v.reactions_count + v.comments_count + v.saves_count),
    0
  );

  if (inutile) return null;

  return (
    <aside
      aria-label="À propos de Diako"
      /* ⚠ `h-fit` seul rendait le BAS DU RAIL INATTEIGNABLE : collé en haut,
         plus haut que l'écran, il ne défilait ni avec la page ni pour
         lui-même. On borne sa hauteur à celle de la fenêtre et on lui donne
         son propre défilement — `overscroll-contain` évite d'entraîner la
         page quand on arrive au bout. */
      className="dk-rail sticky top-14 hidden w-80 max-h-[calc(100dvh-3.5rem)] shrink-0 space-y-4 overflow-y-auto overscroll-contain py-4 [scrollbar-width:thin] lg:block"
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
              /* 🔴 Menait a « /recherche » sans terme, donc a un champ VIDE. La page
                 qui repond exactement a ce clic existe et est citee deux blocs
                 plus bas dans ce meme composant. */
              { n: stats.plats, quoi: "plats référencés", ou: "/plats" },
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
            Ce qui se passe en {mois}.
          </p>
          <ul className="mt-3 space-y-3">
            {saison.slice(0, 6).map((s) => (
              <li key={s.slug} className="dk-ligne-tendance">
                <p className="text-sm font-semibold">{s.titre}</p>
                {(s.lieu || s.region) && (
                  <p className="dk-secondaire">
                    {[s.lieu, s.region].filter(Boolean).join(" · ")}
                  </p>
                )}
                {/* ⚠ LA PÉRIODE TELLE QU'ELLE A ÉTÉ VÉRIFIÉE, avec sa réserve.
                    « Début août, jour variable selon les années » est une
                    information utile ; un faux « 8 août » fait rater un vol. */}
                {s.periode && (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {s.periode}
                  </p>
                )}
                {/* ⚠ ON DIT CE QU'ON NE SAIT PAS. Un rendez-vous non confirmé
                    ou non annuel doit le porter à l'écran : c'est la
                    différence entre informer et faire déplacer quelqu'un pour
                    rien. */}
                {(s.confiance === "incertaine" || !s.recurrent) && (
                  <p className="mt-0.5 text-xs font-medium text-warn">
                    {!s.recurrent
                      ? "Ne se répète pas chaque année — à vérifier."
                      : "Dates non confirmées pour cette année."}
                  </p>
                )}
                {s.source && (
                  <a
                    href={s.source}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-0.5 inline-block text-[11px] text-muted-foreground underline"
                  >
                    source
                  </a>
                )}
              </li>
            ))}
          </ul>
          <Link
            to="/evenements"
            className="dk-secondaire mt-3 inline-block text-primary"
          >
            Tous les événements
          </Link>
        </section>
      )}

      {/* ── L'AVENTURE CULINAIRE (écran D1) ──────────────────────────────
          ⚠ C'EST LE SEUL BLOC DU RAIL DONT LA MATIÈRE EST ABONDANTE. Partout
            ailleurs Diako compte des zéros — 0 avis, 0 carte, 1 membre. Ici il
            a 95 plats et 254 orthographes, et il peut le dire sans rien
            embellir. C'est pour ça qu'il passe AVANT la feuille de route. */}
      <section className="rounded-2xl border border-accent-strong/25 bg-accent/[0.07] p-4">
        <h2 className="dk-etiquette text-accent-strong">Aventure culinaire</h2>
        <p className="mt-2 text-[15px] font-bold leading-tight">
          {/* Meme regle : `stats` est deja charge quelques lignes plus haut. */}
          {stats
            ? `${stats.plats} plats à goûter, et autant de façons de les écrire`
            : "Les plats malgaches, et où les trouver"}
        </p>
        <p className="dk-secondaire mt-2 leading-relaxed">
          Cherchez un plat, ouvrez sa fiche, marquez-le goûté. Les adresses
          viendront des cartes publiées par les restaurants.
        </p>
        <Link
          to="/plats"
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent-strong text-sm font-semibold text-accent-foreground"
        >
          Ouvrir l'atlas
        </Link>
      </section>

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
