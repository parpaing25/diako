import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { PostCard } from "@/components/PostCard";
import { PostImmersif } from "@/components/PostImmersif";
import { Commentaires } from "@/components/Commentaires";
import { useEstMobile } from "@/hooks/useEstMobile";
import {
  PAR_PALIER,
  chargerFilFiltre,
  modesFilDisponibles,
  type ModeFil,
  type PostSitue,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useReveal } from "@/hooks/useReveal";

/**
 * ⚠ RENDU A `PAR_PALIER()`. Un `const PAR_PAGE = 6` fige ici rendait mort le
 *   calcul 8/12 d'api.ts, ecrit precisement pour ne pas faire pagayer un
 *   visiteur de bureau ni gaver un telephone en 3G. Deux sources de verite
 *   pour la meme decision, et c'est la mauvaise qui gagnait.
 */
const PAR_PAGE = PAR_PALIER;

/**
 * LES QUATRE ENTREES DU FIL (maquette D1).
 *
 * ⚠ ON N'AFFICHE QUE CE QUI REPOND. « Abonnements » quand on ne suit personne,
 *   « Assiettes » quand aucun plat n'est tague : l'onglet ouvrirait sur un
 *   ecran vide, ce qui se lit comme une panne et non comme une absence de
 *   contenu. La barre se remplit d'elle-meme a mesure que le site vit.
 */
const MODES: { cle: ModeFil; label: string }[] = [
  { cle: "tout", label: "Découvrir" },
  { cle: "abonnements", label: "Abonnements" },
  { cle: "pres_de_moi", label: "Près de moi" },
  { cle: "assiettes", label: "Assiettes" },
];

function BarreFil({
  mode,
  dispo,
  onChoisir,
}: {
  mode: ModeFil;
  dispo: { abonnements: boolean; assiettes: boolean };
  onChoisir: (m: ModeFil) => void;
}) {
  const visibles = MODES.filter((m) => {
    if (m.cle === "abonnements") return dispo.abonnements;
    if (m.cle === "assiettes") return dispo.assiettes;
    if (m.cle === "pres_de_moi")
      return typeof navigator !== "undefined" && "geolocation" in navigator;
    return true;
  });
  // Un seul onglet n'est pas un filtre, c'est du décor.
  if (visibles.length < 2) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-1.5 px-4 md:px-0">
      {visibles.map((m) => (
        <button
          key={m.cle}
          onClick={() => onChoisir(m.cle)}
          aria-pressed={mode === m.cle}
          className={cn(
            "min-h-9 rounded-full border px-4 text-sm font-semibold transition",
            mode === m.cle
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card hover:border-primary hover:text-primary"
          )}
        >
          {m.label}
        </button>
      ))}
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
 * Pagination par CURSEUR dans les deux cas. L'offset décale tout dès qu'une
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

  const [mode, setMode] = useState<ModeFil>("tout");
  const [dispo, setDispo] = useState({ abonnements: false, assiettes: false });
  const [ici, setIci] = useState<{ lat: number; lng: number } | null>(null);
  // ⚠ Garde-fou de concurrence : changer d'onglet pendant un chargement
  //   affichait la reponse de l'ANCIEN mode par-dessus le nouveau.
  const version = useRef(0);

  useEffect(() => {
    modesFilDisponibles().then(setDispo).catch(() => undefined);
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
        setPosts((avant) => {
          if (!curseur && apresKm == null) return page;
          const vus = new Set(avant.map((p) => p.id));
          return [...avant, ...page.filter((p) => !vus.has(p.id))];
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
          const dernier = posts[posts.length - 1];
          // ⚠ Le curseur CHANGE DE NATURE selon le mode : « pres de moi » trie
          //   par distance, reprendre a une date y saute des recits.
          if (mode === "pres_de_moi") void charger(null, dernier.distance_km ?? null);
          else void charger(dernier.created_at, null);
        }
      },
      { threshold: 0.1, rootMargin: "600px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [posts, fini, chargement, charger, mode]);

  if (chargement) {
    return mobile ? (
      <div className="dk-skeleton fixed inset-x-0 bottom-0 top-14 w-full rounded-none" />
    ) : (
      <div className="space-y-4 px-4 md:px-0">
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
  }

  if (erreur && posts.length === 0) {
    return (
      <div className="mx-4 rounded-2xl border border-border p-6 text-center md:mx-0">
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
  }

  if (posts.length === 0) {
    return (
      <div className="px-4 md:px-0">
        <BarreFil mode={mode} dispo={dispo} onChoisir={choisirMode} />
        <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          {/* ⚠ ON DIT QUEL FIL EST VIDE. « Le fil est vide » sous l'onglet
              « Près de moi » laisse croire que le site entier l'est. */}
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
            Soyez le premier à raconter un voyage, partager une adresse ou
            signaler un bon plan.
          </p>
          <Link
            to="/publier"
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
          >
            Publier
          </Link>
        </div>
      </div>
    );
  }

  // ── TÉLÉPHONE : plein écran, glissement vertical ────────────────────────
  if (mobile) {
    return (
      <>
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
      <BarreFil mode={mode} dispo={dispo} onChoisir={choisirMode} />
      <div className="grid gap-4 lg:grid-cols-2 large:grid-cols-3">
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            onSupprime={(id) => setPosts((l) => l.filter((x) => x.id !== id))}
          />
        ))}
      </div>
      <div ref={sentinelle} className="h-10" aria-hidden="true" />
      {fini && (
        <p className="py-4 text-center text-sm text-muted-foreground">Vous avez tout vu.</p>
      )}
    </div>
  );
}
