import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { PostCard } from "@/components/PostCard";
import { PostImmersif } from "@/components/PostImmersif";
import { Commentaires } from "@/components/Commentaires";
import { useEstMobile } from "@/hooks/useEstMobile";
import { PAR_PALIER, chargerFeed, type Post } from "@/lib/api";
import { useReveal } from "@/hooks/useReveal";

/**
 * ⚠ RENDU A `PAR_PALIER()`. Un `const PAR_PAGE = 6` fige ici rendait mort le
 *   calcul 8/12 d'api.ts, ecrit precisement pour ne pas faire pagayer un
 *   visiteur de bureau ni gaver un telephone en 3G. Deux sources de verite
 *   pour la meme decision, et c'est la mauvaise qui gagnait.
 */
const PAR_PAGE = PAR_PALIER;

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
  const [posts, setPosts] = useState<Post[]>([]);
  // Les cartes se posent en arrivant a l'ecran ; relance a chaque page recue.
  useReveal(posts.length);
  const [chargement, setChargement] = useState(true);
  const [fini, setFini] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [commentaires, setCommentaires] = useState<Post | null>(null);
  const enVol = useRef(false);
  const sentinelle = useRef<HTMLDivElement>(null);

  const charger = useCallback(async (curseur?: string | null) => {
    if (enVol.current) return;
    enVol.current = true;
    try {
      // ⚠ LE PALIER EST RELU A CHAQUE APPEL, et la MEME valeur sert a demander
      //   et a conclure. Fige au chargement du module, il restait a 8 pour qui
      //   avait ouvert le site en fenetre etroite puis elargi — et surtout,
      //   demander 12 en comparant a 8 (ou l'inverse) fait declarer le fil
      //   « termine » alors qu'il reste des publications.
      const palier = PAR_PAGE();
      const page = await chargerFeed(curseur, palier);
      setErreur(false);
      if (page.length < palier) setFini(true);
      setPosts((avant) => {
        if (!curseur) return page;
        const vus = new Set(avant.map((p) => p.id));
        return [...avant, ...page.filter((p) => !vus.has(p.id))];
      });
    } catch {
      setErreur(true);
    } finally {
      enVol.current = false;
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger(null);
  }, [charger]);

  // Sentinelle ré-armée sur posts.length : sans cela, sur grand écran elle
  // reste visible et la page suivante n'est jamais demandée — le fil se fige.
  useEffect(() => {
    const el = sentinelle.current;
    if (!el || fini || chargement) return;
    const obs = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting && posts.length > 0) {
          void charger(posts[posts.length - 1].created_at);
        }
      },
      { threshold: 0.1, rootMargin: "600px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [posts, fini, chargement, charger]);

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
        <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          <p className="font-medium">Le fil est vide</p>
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
