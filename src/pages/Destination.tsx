import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bus, Compass, MapPin, Plane, Ship, Utensils } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRetour } from "@/hooks/useRetour";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EtatErreur, Squelettes } from "@/components/Etats";
import { ariary, recitsDuLieu } from "@/lib/etablissements";
import { ImageProgressive } from "@/components/ImageProgressive";
import { jeuDeTailles } from "@/lib/imageThumb";
import { cn } from "@/lib/utils";

/**
 * LA FICHE D'UNE DESTINATION — /lieu/:slug (écran C1 de la maquette).
 *
 * ⚠ POURQUOI CET ÉCRAN COMPTE PLUS QUE LES AUTRES. Le référentiel des lieux
 *   — leur saisonnalité mois par mois, leurs accès avec des temps de route
 *   RÉELS — est le fossé défensif du produit (TDR §1.5) : personne d'autre ne
 *   l'a et personne ne le copie en une semaine. Il existait en base depuis le
 *   lot 1 et n'était affiché NULLE PART. On construisait l'avantage sans le
 *   montrer.
 *
 * ⚠ CE QUI EST HONNÊTE ICI. Sur 508 destinations, 5 seulement ont leur
 *   saisonnalité saisie et 41 leurs accès. Le calendrier ne s'affiche donc que
 *   là où il est renseigné, et là où il manque l'écran le dit et invite à
 *   compléter — plutôt que de montrer douze cases grises qui ressembleraient à
 *   « déconseillé toute l'année ».
 */

const MOIS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MOIS_LONG = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const NOTE = {
  ideale: { classe: "bg-primary text-primary-foreground", mot: "idéal" },
  correcte: { classe: "bg-primary/20 text-primary", mot: "correct" },
  deconseillee: { classe: "bg-accent/20 text-accent-strong", mot: "déconseillé" },
} as const;

const ICONE_MODE: Record<string, typeof Bus> = {
  goudron: Bus, piste: Bus, "4x4": Bus, avion: Plane, bateau: Ship, pirogue: Ship, train: Bus,
};

interface Fiche {
  lieu: {
    slug: string; name_fr: string; name_mg: string | null; kind: string;
    region: string | null; summary: string | null; why_go: string[] | null;
    lat: number | null; lng: number | null;
    /* ⚠ Aucune migration n'a été nécessaire pour les faire remonter :
       `fiche_destination` rend `to_jsonb(p) - 'norm'`, donc TOUTE colonne
       ajoutée à `places` arrive ici d'office. Bon à savoir dans les deux sens
       — une colonne sensible ajoutée demain sortirait aussi. */
    cover_url: string | null; cover_credit: string | null;
  };
  saisons: { mois: number; note: keyof typeof NOTE | null; raison: string | null }[];
  acces: {
    depuis: string; mode: string; km: number | null; heures: number | null;
    etat_route: string | null; toute_annee: boolean | null; depart: string | null;
    operateurs: string[] | null; prix_ar: number | null;
  }[];
  nb_ou_dormir: number;
  nb_ou_manger: number;
  nb_pages: number;
  nb_recits: number;
  prix_des: number | null;
  enfants: { slug: string; nom: string }[];
}

export default function Destination() {
  const { slug } = useParams<{ slug: string }>();
  const [f, setF] = useState<Fiche | null>(null);
  const [recits, setRecits] = useState<Awaited<ReturnType<typeof recitsDuLieu>>>([]);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absente" | "erreur">("chargement");
  useReveal(f);

  /**
   * 🔴 LE MÊME LIEU AVAIT DEUX ÉCRANS, ET UN SEUL SAVAIT SORTIR. La variante
   *    allégée (/explorer?lieu=…) porte « Toutes les destinations » depuis
   *    toujours ; ce dossier complet, lui, n'offrait rien — et c'est celui vers
   *    lequel pointent les liens partagés. L'écart se voit d'un écran à
   *    l'autre.
   * ⚠ Repli sur l'annuaire des destinations, comme la variante allégée : c'est
   *   de là qu'on arrive presque toujours, et l'accueil ne veut rien dire
   *   depuis une fiche de lieu.
   */
  const retour = useRetour("/explorer");

  const charger = useCallback(async () => {
    if (!slug) return;
    setEtat("chargement");
    const { data, error } = await supabase.rpc("fiche_destination", { p_slug: slug });
    if (error) return setEtat("erreur");
    if (!data) return setEtat("absente");
    setF(data as unknown as Fiche);
    setEtat("ok");
  }, [slug]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // ⚠ Chargement SÉPARÉ de la fiche : les récits ne doivent pas retarder
  //   l'affichage du reste, et leur absence ne casse rien.
  useEffect(() => {
    if (!f?.lieu?.slug) return;
    void recitsDuLieu(f.lieu.slug, 6).then(setRecits).catch(() => undefined);
  }, [f?.lieu?.slug]);

  useSEO({
    titre: f ? `${f.lieu.name_fr} — où dormir et où manger` : "Destination",
    description: f
      ? f.lieu.summary ??
        `${f.lieu.name_fr}${f.lieu.region ? ` (${f.lieu.region})` : ""} : ${f.nb_ou_dormir} hébergements, ${f.nb_ou_manger} tables${f.prix_des ? `, à partir de ${ariary(f.prix_des)}` : ""}.`
      : undefined,
    url: slug ? `/lieu/${slug}` : undefined,
  });

  if (etat === "chargement")
    return (
      <div className="space-y-4 px-4 py-5">
        <div className="dk-skeleton h-40 rounded-2xl" />
        <div className="dk-skeleton h-8 w-1/2" />
        <Squelettes nombre={2} />
      </div>
    );

  if (etat === "erreur") return <div className="px-4 py-8"><EtatErreur onReessayer={() => void charger()} /></div>;

  if (etat === "absente" || !f)
    return (
      <div className="px-4 py-16 text-center">
        <h1 className="dk-titre">Destination inconnue</h1>
        <p className="mt-2 text-muted-foreground">Cette destination n'existe pas dans le référentiel.</p>
        <Link to="/explorer" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground">
          Explorer Madagascar
        </Link>
      </div>
    );

  const saisonsRenseignees = f.saisons.filter((s) => s.note);
  const moisCourant = f.saisons[new Date().getMonth()];

  return (
    /* ═══ GABARIT G3 — DOSSIER EDITORIAL ══════════════════════════════════
       620 sections + 340 reperes + 250 « autour » a 1920.

       ⚠ POURQUOI CET ECRAN GAGNE LE PLUS A L'ELARGISSEMENT. Sur telephone,
         une destination cache ses saisons, ses acces, ses adresses et ses
         recits derriere des rubriques qu'on fait defiler l'une apres l'autre.
         Ici tout est visible en meme temps, et la troisieme colonne accueille
         ce que le referentiel sait deja du VOISINAGE — c'est-a-dire la seule
         matiere abondante du produit. */
    <div className="px-4 py-5 xl:flex xl:items-start xl:gap-5">
      <div className="min-w-0 flex-1 xl:max-w-[620px]">
      {/* ⚠ AVANT LA PHOTO, et non posé dessus : la couverture est absente sur
          la plupart des destinations, un bouton flottant se retrouverait alors
          sur le titre. Ici il est au même endroit dans les deux cas.
          ⚠ `min-h-11` = 44 px de haut : c'est le premier geste de l'écran. */}
      <button
        onClick={retour}
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Retour
      </button>

      {/* ── La photo, quand la destination en a une ───────────────────── */}
      {f.lieu.cover_url && (
        <figure className="relative -mx-4 mb-4 h-44 overflow-hidden sm:mx-0 sm:h-56 sm:rounded-2xl">
          <img
            src={f.lieu.cover_url}
            srcSet={jeuDeTailles(f.lieu.cover_url) ?? undefined}
            sizes="(min-width: 1280px) 620px, 100vw"
            alt={`${f.lieu.name_fr} — ${f.lieu.region ?? "Madagascar"}`}
            className="h-full w-full object-cover"
            /* Premier élément de la page : c'est lui le LCP, il ne doit ni
               être différé ni attendre son tour. */
            loading="eager"
            fetchPriority="high"
          />
          {f.lieu.cover_credit && (
            <figcaption className="absolute bottom-0 right-0 rounded-tl bg-black/45 px-1.5 py-0.5 text-[10px] text-white/85">
              {f.lieu.cover_credit}
            </figcaption>
          )}
        </figure>
      )}

      {/* ── Identité ─────────────────────────────────────────────────── */}
      <p className="dk-etiquette">
        {f.lieu.region ?? f.lieu.kind}
        {f.acces[0]?.km ? ` · à ${f.acces[0].km} km de ${f.acces[0].depuis}` : ""}
      </p>
      <h1 className="dk-titre mt-1">{f.lieu.name_fr}</h1>
      {f.lieu.name_mg && f.lieu.name_mg !== f.lieu.name_fr && (
        <p className="dk-secondaire mt-0.5">{f.lieu.name_mg}</p>
      )}
      {f.lieu.summary && <p className="dk-corps mt-3 max-w-prose">{f.lieu.summary}</p>}

      {/* ── Les chiffres, calculés, jamais lus dans un compteur dérivé ── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* 🔴 « 1 récit » N'ÉTAIT PAS CLIQUABLE. Un compteur qui ne mène nulle
            part est une frustration : on apprend qu'un témoignage existe sur
            Isalo, sans aucun moyen de le lire. C'était pourtant le seul
            contenu VIVANT de la fiche. */}
        {f.nb_recits > 0 && (
          <a
            href="#recits"
            className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
          >
            {f.nb_recits} récit{f.nb_recits > 1 ? "s" : ""} — les lire
          </a>
        )}
        {[
          f.nb_pages > 0 && `${f.nb_pages} adresse${f.nb_pages > 1 ? "s" : ""}`,
          // ⚠ Ce badge-la est CLIQUABLE : voir plus bas. Les autres sont des
          // faits, celui-ci mene a du contenu.
          null,
          f.prix_des != null && `dès ${ariary(f.prix_des)}/nuit`,
        ]
          .filter(Boolean)
          .map((t) => (
            <span key={t as string} className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
              {t}
            </span>
          ))}
      </div>

      {/* ── Quand y aller ────────────────────────────────────────────── */}
      <section className="dk-reveal mt-6">
        <h2 className="dk-etiquette">Quand y aller</h2>
        {saisonsRenseignees.length > 0 ? (
          <>
            <ul className="mt-2 flex gap-1" role="list">
              {f.saisons.map((s, i) => (
                <li key={i} className="flex-1">
                  <span
                    title={`${MOIS_LONG[i]}${s.note ? ` — ${NOTE[s.note].mot}` : " — non renseigné"}${s.raison ? ` (${s.raison})` : ""}`}
                    className={cn(
                      "grid h-9 w-full place-items-center rounded-lg text-xs font-bold",
                      s.note ? NOTE[s.note].classe : "bg-muted text-muted-foreground/50"
                    )}
                  >
                    {MOIS[i]}
                  </span>
                </li>
              ))}
            </ul>
            {moisCourant?.note && (
              <p className="mt-2 text-sm">
                <span className="font-semibold">En {MOIS_LONG[new Date().getMonth()]} : </span>
                {NOTE[moisCourant.note].mot}
                {moisCourant.raison && ` — ${moisCourant.raison.toLowerCase()}`}
              </p>
            )}
          </>
        ) : (
          // ⚠ Douze cases grises se liraient « déconseillé toute l'année ».
          //   On dit franchement que ce n'est pas encore renseigné.
          <p className="mt-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            La saisonnalité de cette destination n'est pas encore renseignée.
            Vous la connaissez ?{" "}
            <Link
              /* ⭐ LE LIEU PART AVEC LE LIEN. Sans lui, on arrivait sur un
                   formulaire vierge et il fallait retrouver dans une liste de
                   508 la destination qu'on venait de quitter. */
              to={`/publier?lieu=${encodeURIComponent(f.lieu.slug)}`}
              className="font-medium text-primary"
            >
              Racontez-y un voyage
            </Link>{" "}
            — c'est comme ça qu'on la construit.
          </p>
        )}
      </section>

      {/* ── Y aller ──────────────────────────────────────────────────── */}
      {f.acces.length > 0 && (
        <section className="dk-reveal mt-6">
          <h2 className="dk-etiquette">Y aller</h2>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {f.acces.map((a, i) => {
              const Icone = ICONE_MODE[a.mode] ?? Bus;
              return (
                <li key={i} className="flex items-start gap-3 p-3">
                  <Icone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      Depuis {a.depuis} · {a.mode}
                    </p>
                    <p className="dk-secondaire">
                      {[
                        a.km && `${a.km} km`,
                        // ⚠ Temps de route RÉEL, pas la distance divisée par
                        //   une vitesse théorique : 250 km font 6 h ici.
                        a.heures && `${a.heures} h réelles`,
                        a.etat_route,
                        a.toute_annee === false && "pas toute l'année",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {(a.depart || a.operateurs?.length) && (
                      <p className="dk-secondaire">
                        {[a.depart, a.operateurs?.join(", ")].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {a.prix_ar != null && (
                    <span className="shrink-0 text-sm font-bold tabular-nums">{ariary(a.prix_ar)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      </div>

      {/* ── COLONNE « REPERES » : ce qu'on fait de cette page ──────────────
          ⚠ Les deux actions montent ICI a partir de `xl`. Sur telephone elles
            sont sous le calendrier, c'est-a-dire a deux ecrans de defilement
            du titre : celui qui a decide d'y aller devait remonter pour agir.
            Collees, elles restent sous la main pendant toute la lecture. */}
      <aside className="mt-6 shrink-0 space-y-3 xl:sticky xl:top-20 xl:mt-0 xl:w-[340px]">
      <div className="grid grid-cols-2 gap-2">
        <Link
          to={`/recherche?q=${encodeURIComponent(f.lieu.name_fr)}&cat=hotel`}
          className={cn(
            "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-4 font-semibold",
            f.nb_ou_dormir > 0
              ? "bg-primary text-primary-foreground"
              : "border border-input text-muted-foreground"
          )}
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Où dormir ({f.nb_ou_dormir})
        </Link>
        <Link
          to={`/recherche?q=${encodeURIComponent(f.lieu.name_fr)}&cat=restaurant`}
          className={cn(
            "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-4 font-semibold",
            f.nb_ou_manger > 0 ? "border border-primary text-primary" : "border border-input text-muted-foreground"
          )}
        >
          <Utensils className="h-4 w-4" aria-hidden="true" />
          Où manger ({f.nb_ou_manger})
        </Link>
      </div>

      {f.lieu.lat != null && (
        <Link
          to={`/carte?lieu=${f.lieu.slug}`}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-input text-sm font-semibold"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Voir sur la carte
        </Link>
      )}

      {/* ⚠ CE BLOC EST LE PLUS UTILE DE LA PAGE AUJOURD'HUI. 503 destinations
          sur 508 n'ont pas de saisonnalite et 466 pas d'acces : sans lui, la
          plupart des fiches n'auraient presque rien a montrer. Le referentiel
          des plats, lui, est complet — il donne toujours quelque chose a
          lire. */}
      <div className="rounded-2xl border border-accent-strong/25 bg-accent/[0.07] p-4">
        <p className="dk-etiquette text-accent-strong">Manger ici</p>
        <p className="dk-secondaire mt-2 leading-relaxed">
          95 plats malgaches sont referencies, avec leurs 254 orthographes.
          Cherchez celui que vous voulez gouter, la fiche dit ou en trouver.
        </p>
        <Link
          to="/plats"
          className="mt-3 inline-flex min-h-10 items-center rounded-full bg-accent-strong px-4 text-sm font-semibold text-accent-foreground"
        >
          Ouvrir l'atlas des plats
        </Link>
      </div>
      </aside>

      {/* ── COLONNE « AUTOUR » — n'apparait qu'a 1920 ──────────────────── */}
      <aside className="mt-6 hidden shrink-0 space-y-3 large:sticky large:top-20 large:mt-0 large:block large:w-[250px]">
      {f.enfants.length > 0 && (
        <section className="dk-reveal">
          <h2 className="dk-etiquette">Aux alentours</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {f.enfants.map((e) => (
              <li key={e.slug}>
                <Link
                  to={`/lieu/${e.slug}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
                >
                  <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                  {e.nom}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── ILS Y SONT ALLÉS ──────────────────────────────────────────────
          ⚠ CE BLOC EST LA RAISON D'ÊTRE DU SITE. Tout le reste de la fiche
            vient de nous — un import OSM, une saisonnalité saisie à la main.
            Ceci vient de quelqu'un qui y est allé, et c'est ce qu'un voyageur
            cherche en premier. Le mettre en bas de colonne serait le cacher.
          ⚠ La photo d'un récit devient de fait la photo du lieu : quand un
            visiteur partage, on lui demande le lieu (champ obligatoire de
            /publier), et sa photo remonte ici pour les suivants. */}
      {recits.length > 0 && (
        <section id="recits" className="rounded-2xl border border-border bg-card p-4">
          <p className="dk-etiquette">Ils y sont allés</p>
          <ul className="mt-3 space-y-3">
            {recits.map((r) => (
              <li key={r.id}>
                <Link to={`/post/${r.id}`} className="dk-carte group block">
                  {r.media[0]?.url && (
                    <span className="mb-2 block aspect-[16/10] overflow-hidden rounded-xl bg-muted">
                      <ImageProgressive
                        src={r.media[0].url}
                        alt=""
                        ajustement="cover"
                        largeurAffichee="(min-width:1280px) 300px, 92vw"
                      />
                    </span>
                  )}
                  <span className="dk-secondaire block">
                    {r.auteur || "Un voyageur"} ·{" "}
                    {new Date(r.created_at).toLocaleDateString("fr-FR")}
                  </span>
                  <span className="mt-0.5 line-clamp-3 block text-sm group-hover:text-primary">
                    {r.body?.trim() || "(photo)"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="dk-etiquette">Raconter</p>
        <p className="dk-secondaire mt-2 leading-relaxed">
          Vous connaissez {f.lieu.name_fr} ? Un recit, un tarif releve, une
          route praticable : c'est ce qui construit la fiche.
        </p>
        {/* ⭐ C'EST LE BOUTON QUE LE PROPRIETAIRE A POINTE. On arrive ici en
               lisant la fiche d'un lieu : c'est de CE lieu qu'on va parler. Le
               slug part donc avec le lien et le champ est deja rempli.
            ⚠ L'ENJEU N'EST PAS LE CONFORT. Un recit publie sans `place_id`
              n'est atteignable ni depuis la fiche du lieu, ni par la carte, ni
              par « pres de moi » — les trois interrogent cette colonne. Le
              formulaire vierge faisait donc perdre des recits ET empechait la
              fiche de se remplir. */}
        <Link
          to={`/publier?lieu=${encodeURIComponent(f.lieu.slug)}`}
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-input text-sm font-semibold"
        >
          Publier un recit
        </Link>
      </div>
      </aside>
    </div>
  );
}
