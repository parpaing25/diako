import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { PostCard } from "@/components/PostCard";
import { PostImmersif } from "@/components/PostImmersif";
import { Commentaires } from "@/components/Commentaires";
import { BandeauTheme } from "@/components/BandeauTheme";
import { EmptyState } from "@/components/Etats";
import { useEstMobile } from "@/hooks/useEstMobile";
import {
  PAR_PALIER,
  chargerFilFiltre,
  comptesThemes,
  modesFilDisponibles,
  type ComptesThemes,
  type ModeClassique,
  type ModeFil,
  type PostSitue,
} from "@/lib/api";
import { THEMES, estTheme, libelleFiches, theme as trouveTheme } from "@/lib/themesFil";
import { cn } from "@/lib/utils";
import { useReveal } from "@/hooks/useReveal";
import { reordonner } from "@/lib/affinites";

/**
 * ⚠ RENDU A `PAR_PALIER()`. Un `const PAR_PAGE = 6` fige ici rendait mort le
 *   calcul 8/12 d'api.ts, ecrit precisement pour ne pas faire pagayer un
 *   visiteur de bureau ni gaver un telephone en 3G. Deux sources de verite
 *   pour la meme decision, et c'est la mauvaise qui gagnait.
 */
const PAR_PAGE = PAR_PALIER;

/**
 * LES ENTRÉES CLASSIQUES DU FIL (maquette D1).
 *
 * ⚠ ON N'AFFICHE QUE CE QUI REPOND. « Abonnements » quand on ne suit personne :
 *   l'onglet ouvrirait sur un ecran vide, ce qui se lit comme une panne et non
 *   comme une absence de contenu. La barre se remplit d'elle-meme a mesure que
 *   le site vit.
 *
 * 🔴 « ASSIETTES » A QUITTE CETTE LISTE, et ce n'est pas une suppression : le
 *    theme « Plats » le REMPLACE en plus large. L'ancien onglet ne montrait que
 *    les publications portant un `dish_id` ; le theme montre les memes, plus
 *    les publications de type « assiette », plus les 95 plats de l'atlas.
 *    Garder les deux aurait donne deux onglets voisins dont l'un est un
 *    sous-ensemble strict de l'autre — et il n'apparaissait de toute facon
 *    jamais, aucune publication ne portant de `dish_id` (mesure du 01/09/2026).
 *    Le mode `assiettes` reste servi par `feed_filtre` : c'est l'ENTREE
 *    d'ecran qui disparait, pas la capacite.
 */
const MODES: { cle: ModeClassique; label: string }[] = [
  { cle: "tout", label: "Découvrir" },
  { cle: "abonnements", label: "Abonnements" },
  { cle: "pres_de_moi", label: "Près de moi" },
];

/**
 * LA BARRE DES FILTRES.
 *
 * 🔴 LES THEMES N'APPARAISSENT QUE SI LE SERVEUR LES CONNAIT (`comptes`). Ce
 *    n'est pas de la prudence decorative. Tant que la migration 0115 n'est pas
 *    passee, `feed_filtre` ignore les modes `th_*` et retombe sur son
 *    `else true` : demander « th_hotels » sert alors le fil ENTIER sous
 *    l'etiquette « Hotels ». Rien ne planterait, rien ne serait vide, et
 *    l'ecran montrerait des recits de Tulear comme des recits d'hotel. Le
 *    compteur `fil_themes_comptes` n'existe que dans 0115 : sa reponse PROUVE
 *    que le fil sait filtrer.
 *
 * ⚠ DEFILEMENT HORIZONTAL SUR TELEPHONE, retour a la ligne au-dela. Neuf
 *   pastilles qui s'enroulent sur un ecran de 390 px mangent quatre lignes
 *   avant la premiere publication.
 */
function BarreFil({
  mode,
  dispo,
  comptes,
  onChoisir,
  flottante,
}: {
  mode: ModeFil;
  dispo: { abonnements: boolean; assiettes: boolean };
  comptes: ComptesThemes | null;
  onChoisir: (m: ModeFil) => void;
  /** Posée par-dessus le fil plein écran du téléphone. */
  flottante?: boolean;
}) {
  const visibles = MODES.filter((m) => {
    if (m.cle === "abonnements") return dispo.abonnements;
    if (m.cle === "pres_de_moi")
      return typeof navigator !== "undefined" && "geolocation" in navigator;
    return true;
  });
  const themes = comptes ? THEMES : [];

  // Un seul onglet n'est pas un filtre, c'est du décor.
  if (visibles.length + themes.length < 2) return null;

  const pastille = (actif: boolean) =>
    cn(
      "min-h-9 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition",
      actif
        ? "border-primary bg-primary text-primary-foreground"
        : flottante
          ? "border-white/25 bg-black/45 text-white backdrop-blur hover:border-white/60"
          : "border-border bg-card hover:border-primary hover:text-primary"
    );

  return (
    <div
      className={cn(
        "flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        flottante
          ? "fixed inset-x-0 top-14 z-30 bg-gradient-to-b from-black/60 to-transparent px-3 py-2"
          : "mb-4 px-4 pb-1 md:flex-wrap md:overflow-visible md:px-0"
      )}
      role="group"
      aria-label="Filtrer le fil"
    >
      {visibles.map((m) => (
        <button
          key={m.cle}
          onClick={() => onChoisir(m.cle)}
          aria-pressed={mode === m.cle}
          className={pastille(mode === m.cle)}
        >
          {m.label}
        </button>
      ))}

      {/* ⚠ UN SÉPARATEUR, PAS UN SAUT DE LIGNE. Les trois premières entrées
          disent COMMENT on lit le fil (tout, ceux que je suis, autour de moi) ;
          les six suivantes disent DE QUOI il parle. Ce sont deux natures de
          filtre, et rien ne le distinguait. */}
      {visibles.length > 0 && themes.length > 0 && (
        <span
          aria-hidden="true"
          className={cn("my-1 w-px shrink-0", flottante ? "bg-white/25" : "bg-border")}
        />
      )}

      {themes.map((t) => (
        <button
          key={t.cle}
          onClick={() => onChoisir(t.cle)}
          aria-pressed={mode === t.cle}
          className={pastille(mode === t.cle)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/**
 * ⚠ ON DIT QUEL FIL EST VIDE. « Le fil est vide » sous l'onglet « Près de moi »
 *   laisse croire que le site entier l'est.
 */
function FilVide({ mode }: { mode: ModeFil }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
      <p className="font-medium">
        {mode === "pres_de_moi"
          ? "Aucun récit près de vous"
          : mode === "abonnements"
            ? "Rien de neuf chez ceux que vous suivez"
            : mode === "assiettes"
              ? "Aucune assiette publiée pour l'instant"
              : "Le fil est vide"}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Soyez le premier à raconter un voyage, partager une adresse ou signaler
        un bon plan.
      </p>
      <Link
        to="/publier"
        className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
      >
        Publier
      </Link>
    </div>
  );
}

/**
 * Le fil — deux présentations, une seule logique.
 *
 *  · ORDINATEUR : cartes façon Facebook — en-tête, texte lisible, photo,
 *    actions. On lit autant qu'on regarde.
 *  · TÉLÉPHONE : plein écran façon Instagram, une publication par écran, on
 *    glisse vers le haut. Accroche verticale obligatoire (snap-mandatory),
 *    sinon on s'arrête entre deux publications.
 *
 * ⚠ …SAUF SOUS UN THÈME. Un onglet thématique montre d'abord les FICHES du
 *   thème (hôtels, plats, destinations), et une grille de fiches n'a aucun sens
 *   en plein écran défilant photo par photo. Le plein écran est donc réservé
 *   aux trois entrées classiques ; les six thèmes s'affichent en page normale,
 *   sur téléphone comme sur ordinateur.
 *
 * Pagination par CURSEUR dans tous les cas. L'offset décale tout dès qu'une
 * publication arrive pendant le défilement : doublons et lignes sautées.
 */
export function Feed() {
  const mobile = useEstMobile();
  const [posts, setPosts] = useState<PostSitue[]>([]);
  // Les cartes se posent en arrivant a l'ecran ; relance a chaque page recue.
  useReveal(posts);
  const [chargement, setChargement] = useState(true);
  const [fini, setFini] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [commentaires, setCommentaires] = useState<PostSitue | null>(null);
  const enVol = useRef(false);
  const sentinelle = useRef<HTMLDivElement>(null);
  /* ⭐ LE CURSEUR EST LA DATE DU DERNIER REÇU, PAS DU DERNIER AFFICHÉ. Le fil
     est réordonné à l'écran selon les lieux que le visiteur regarde
     (`reordonner`) : lire le curseur sur la dernière carte affichée sauterait
     ou répéterait des publications. */
  const curseurRef = useRef<{ date: string | null; km: number | null }>({ date: null, km: null });

  const [mode, setMode] = useState<ModeFil>("tout");
  const [dispo, setDispo] = useState({ abonnements: false, assiettes: false });
  const [comptes, setComptes] = useState<ComptesThemes | null>(null);
  const [ici, setIci] = useState<{ lat: number; lng: number } | null>(null);
  // ⚠ Garde-fou de concurrence : changer d'onglet pendant un chargement
  //   affichait la reponse de l'ANCIEN mode par-dessus le nouveau.
  const version = useRef(0);

  useEffect(() => {
    modesFilDisponibles().then(setDispo).catch(() => undefined);
    // ⚠ `comptesThemes` avale ses propres erreurs et rend `null` : un serveur
    //   sans la migration 0115 laisse simplement le fil tel qu'il etait.
    void comptesThemes().then(setComptes);
  }, []);

  const charger = useCallback(
    async (curseur?: string | null, apresKm?: number | null) => {
      if (enVol.current) return;
      enVol.current = true;
      const mien = ++version.current;
      try {
        // ⚠ LE PALIER EST RELU A CHAQUE APPEL, et la MEME valeur sert a demander
        //   et a conclure. Fige au chargement du module, il restait a 8 pour qui
        //   avait ouvert le site en fenetre etroite puis elargi — et surtout,
        //   demander 12 en comparant a 8 (ou l'inverse) fait declarer le fil
        //   « termine » alors qu'il reste des publications.
        const palier = PAR_PAGE();
        const page = await chargerFilFiltre({
          mode,
          curseur,
          apresKm,
          lat: ici?.lat,
          lng: ici?.lng,
          limite: palier,
        });
        if (mien !== version.current) return;
        setErreur(false);
        if (page.length < palier) setFini(true);
        const dernier = page[page.length - 1];
        if (dernier) {
          curseurRef.current = { date: dernier.created_at, km: dernier.distance_km ?? null };
        }
        // ⭐ « CE QU'IL REGARDE D'ABORD ». Chaque page arrivée est réordonnée
        //   selon la mémoire du visiteur : lieux consultés en tête, déjà vu en
        //   queue. Jamais en « près de moi » (l'ordre y EST l'information) ni
        //   sous un thème (les fiches font l'ordre).
        const personnaliser = mode === "tout" || mode === "abonnements";
        const arrivee = personnaliser ? reordonner(page) : page;
        setPosts((avant) => {
          if (!curseur && apresKm == null) return arrivee;
          const vus = new Set(avant.map((p) => p.id));
          return [...avant, ...arrivee.filter((p) => !vus.has(p.id))];
        });
      } catch {
        if (mien === version.current) setErreur(true);
      } finally {
        enVol.current = false;
        if (mien === version.current) setChargement(false);
      }
    },
    [mode, ici]
  );

  useEffect(() => {
    setChargement(true);
    setFini(false);
    curseurRef.current = { date: null, km: null };
    void charger(null, null);
  }, [charger]);

  /**
   * ⚠ « PRES DE MOI » DEMANDE LA POSITION AU MOMENT DU CLIC, jamais au
   *   chargement de la page. Une demande de geolocalisation non sollicitee est
   *   refusee par reflexe, et le navigateur ne la repropose plus ensuite.
   */
  function choisirMode(m: ModeFil) {
    if (m === "pres_de_moi" && !ici) {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          setIci({ lat: coords.latitude, lng: coords.longitude });
          setMode("pres_de_moi");
        },
        () => setMode("tout"),
        { enableHighAccuracy: false, timeout: 8000 }
      );
      return;
    }
    setMode(m);
  }

  // Sentinelle ré-armée sur posts.length : sans cela, sur grand écran elle
  // reste visible et la page suivante n'est jamais demandée — le fil se fige.
  useEffect(() => {
    const el = sentinelle.current;
    if (!el || fini || chargement) return;
    const obs = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting && posts.length > 0) {
          // ⚠ Le curseur CHANGE DE NATURE selon le mode : « pres de moi » trie
          //   par distance, reprendre a une date y saute des recits.
          if (mode === "pres_de_moi") void charger(null, curseurRef.current.km);
          else void charger(curseurRef.current.date, null);
        }
      },
      { threshold: 0.1, rootMargin: "600px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [posts, fini, chargement, charger, mode]);

  const themeActif = estTheme(mode) ? trouveTheme(mode) : undefined;

  /* ⚠ LA BARRE EST RENDUE DANS TOUS LES ETATS, squelette compris. Avant, l'etat
     de chargement retournait tot, SANS la barre : changer d'onglet la faisait
     disparaitre puis revenir a chaque clic. Avec trois entrees c'etait un
     clignotement ; avec neuf, l'ecran saute. */
  const barre = (flottante?: boolean) => (
    <BarreFil
      mode={mode}
      dispo={dispo}
      comptes={comptes}
      onChoisir={choisirMode}
      flottante={flottante}
    />
  );

  const squelette = (
    <div className="space-y-4">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-2xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="dk-skeleton h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="dk-skeleton h-3 w-32" />
              <div className="dk-skeleton h-2.5 w-20" />
            </div>
          </div>
          <div className="dk-skeleton mt-3 h-4 w-3/4" />
          <div className="dk-skeleton mt-3 aspect-video w-full rounded-xl" />
        </div>
      ))}
    </div>
  );

  const blocErreur = (
    <div className="rounded-2xl border border-border p-6 text-center">
      <p className="font-medium">Le fil n'a pas pu être chargé</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Votre connexion est peut-être instable.
      </p>
      <button
        onClick={() => void charger(null)}
        className="mt-4 min-h-10 rounded-full border border-input px-5 text-sm font-medium"
      >
        Réessayer
      </button>
    </div>
  );

  // ── UN THÈME : les fiches d'abord, les récits ensuite ───────────────────
  //
  // 🔴 CE N'EST PAS UN FILTRE DU FIL, C'EST UN THEME A DEUX SOURCES. Mesure du
  //    01/09/2026 : les recits seuls donnent 1 publication pour
  //    « Restaurants », 3 pour « Plats », 0 pour « Location » et 0 pour
  //    « Voyages organises ». Six onglets branches sur les seules publications
  //    auraient donc ouvert sur du vide — ce que la charte du depot interdit.
  //    Le bloc de fiches n'est pas un ornement : c'est ce qui rend ces onglets
  //    legitimes, avec 1 428 hotels, 1 872 restaurants, 95 plats et
  //    508 destinations a montrer.
  if (themeActif) {
    const compte = comptes?.[themeActif.cle];
    return (
      <div className="px-4 pt-3 md:px-0">
        {barre()}
        <BandeauTheme theme={themeActif} compte={compte} />

        <section aria-labelledby="titre-recits-theme" className="border-t border-border pt-5">
          <div className="flex items-end justify-between gap-3">
            <h2 id="titre-recits-theme" className="text-lg font-semibold">
              Ce qu'on en raconte
            </h2>
            {/* ⚠ LE CHIFFRE VIENT DU SERVEUR, et il est compte par la MEME
                fonction que celle qui filtre le fil (`post_du_theme`). C'est ce
                qui interdit d'annoncer « 45 recits » puis d'en montrer 12. */}
            {compte != null && (
              <p className="shrink-0 text-sm text-muted-foreground">
                {compte.recits.toLocaleString("fr-FR")}{" "}
                {compte.recits <= 1 ? "publication" : "publications"}
              </p>
            )}
          </div>

          <div className="mt-3">
            {chargement ? (
              squelette
            ) : erreur && posts.length === 0 ? (
              blocErreur
            ) : posts.length === 0 ? (
              /* ⚠ LES TROIS OBLIGATIONS DE L'ETAT VIDE, jamais deux sur trois :
                 dire ce qui manque, offrir une action, proposer du contenu reel
                 a parcourir. Le contenu reel est juste au-dessus — les fiches du
                 theme — et on le NOMME avec son vrai compte. */
              <EmptyState
                icone={themeActif.icone}
                manque={themeActif.videManque}
                action={themeActif.videAction}
                contenuReel={
                  <p className="text-sm text-muted-foreground">
                    En attendant,{" "}
                    {compte != null
                      ? libelleFiches(themeActif, compte.fiches)
                      : "les fiches de ce thème"}{" "}
                    {compte != null && compte.fiches <= 1 ? "est" : "sont"} juste
                    au-dessus.{" "}
                    <Link
                      to={themeActif.vers}
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      Tout parcourir
                    </Link>
                  </p>
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 large:grid-cols-3">
                {posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    onSupprime={(id) => setPosts((l) => l.filter((x) => x.id !== id))}
                  />
                ))}
              </div>
            )}
          </div>

          <div ref={sentinelle} className="h-10" aria-hidden="true" />
          {fini && posts.length > 0 && (
            <p className="pb-4 text-center text-sm text-muted-foreground">
              Vous avez tout vu.
            </p>
          )}
        </section>
      </div>
    );
  }

  // ── TÉLÉPHONE : plein écran, glissement vertical ────────────────────────
  if (mobile) {
    if (chargement) {
      return (
        <>
          {barre(true)}
          <div className="dk-skeleton fixed inset-x-0 bottom-0 top-14 w-full rounded-none" />
        </>
      );
    }
    if (erreur && posts.length === 0) {
      return (
        <>
          {barre(true)}
          <div className="mx-4 mt-16">{blocErreur}</div>
        </>
      );
    }
    if (posts.length === 0) {
      return (
        <>
          {barre(true)}
          <div className="mx-4 mt-16">
            <FilVide mode={mode} />
          </div>
        </>
      );
    }
    return (
      <>
        {/* ⚠ LA BARRE FLOTTE PAR-DESSUS LA PHOTO, elle ne pousse rien : le fil
            du téléphone est un conteneur `fixed` plein écran, il n'y a pas de
            flux au-dessus de lui où poser quoi que ce soit. */}
        {barre(true)}
        <div className="fixed inset-x-0 bottom-0 top-14 snap-y snap-mandatory overflow-y-auto overscroll-y-contain bg-black">
          {posts.map((p, i) => (
            <PostImmersif
              key={p.id}
              post={p}
              prioritaire={i === 0}
              onCommenter={setCommentaires}
            />
          ))}
          <div ref={sentinelle} className="h-1" aria-hidden="true" />
          {fini && (
            <div className="grid h-full w-full snap-start place-items-center bg-background px-6 text-center">
              <div>
                <p className="font-medium">Vous avez tout vu.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  De nouvelles destinations arrivent régulièrement.
                </p>
                <Link
                  to="/publier"
                  className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
                >
                  Publier à mon tour
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Commentaires en panneau bas — on ne quitte pas la photo */}
        {commentaires && (
          <div className="fixed inset-0 z-50">
            <button
              aria-label="Fermer les commentaires"
              onClick={() => setCommentaires(null)}
              className="absolute inset-0 bg-black/50"
            />
            <div className="absolute inset-x-0 bottom-0 flex max-h-[75dvh] flex-col rounded-t-2xl bg-background">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="font-semibold">Commentaires</p>
                <button
                  onClick={() => setCommentaires(null)}
                  aria-label="Fermer"
                  className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <Commentaires postId={commentaires.id} />
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── ORDINATEUR : le fil en GRILLE (gabarit G1) ──────────────────────────
  //
  // ⚠ LA CARTE NE GROSSIT PAS, ELLE SE MULTIPLIE. C'est toute la correction :
  //   le fil était une colonne unique de 620 px au milieu d'un écran de 1920,
  //   et l'élargir aurait cassé la longueur de ligne lisible. Deux colonnes
  //   dès 1024, trois à 1920 — les largeurs de carte tombent alors à 324, 312,
  //   392 puis 403 px, toutes dans la plage où une carte garde sa hiérarchie.
  //
  // ⚠ PAS DE QUATRIÈME COLONNE À 1920. Elle donnerait des cartes de 298 px :
  //   la photo s'écrase et le bloc de prix se casse. Les grilles à quatre
  //   colonnes sont réservées aux destinations et aux plats, qui n'ont ni
  //   extrait ni prix.
  //
  // ⚠ PAS DE GRILLE EN DESSOUS DE 1024, contrairement à Fonenako qui y passe
  //   dès 640. Les cartes de Diako portent plus de choses qu'une annonce
  //   immobilière — lieu, plat et établissement tagués, prix avec son unité et
  //   sa base — et perdent leur hiérarchie en dessous de ~320 px.
  //
  // La sentinelle de défilement infini reste HORS de la grille : dedans, elle
  // occuperait une cellule et créerait un trou en fin de rangée.
  return (
    <div>
      {barre()}
      {chargement ? (
        squelette
      ) : erreur && posts.length === 0 ? (
        blocErreur
      ) : posts.length === 0 ? (
        <FilVide mode={mode} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 large:grid-cols-3">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onSupprime={(id) => setPosts((l) => l.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
      <div ref={sentinelle} className="h-10" aria-hidden="true" />
      {fini && posts.length > 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">Vous avez tout vu.</p>
      )}
    </div>
  );
}
