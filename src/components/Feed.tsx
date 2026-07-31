import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PostCard } from "@/components/PostCard";
import { BandeauApercu } from "@/components/BandeauApercu";
import { chargerFeed, type Post } from "@/lib/api";

const PAR_PAGE = 8;

/**
 * Le fil — pagination par CURSEUR.
 *
 * L'offset décale tout dès qu'une publication arrive pendant le défilement :
 * doublons et lignes sautées. Fonenako a colmaté avec ~150 lignes de garde-fous
 * (verrou d'append, compteur de reset, rollback silencieux) ; le curseur
 * supprime le problème à la racine. Il en reste deux, indispensables :
 *   · `enVol` — une seule page demandée à la fois ;
 *   · déduplication par identifiant à chaque ajout.
 */
export function Feed({ recharger }: { recharger?: number }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [chargement, setChargement] = useState(true);
  const [fini, setFini] = useState(false);
  const [erreur, setErreur] = useState(false);
  const enVol = useRef(false);
  const sentinelle = useRef<HTMLDivElement>(null);

  const charger = useCallback(async (curseur?: string | null) => {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const page = await chargerFeed(curseur, PAR_PAGE);
      setErreur(false);
      if (page.length < PAR_PAGE) setFini(true);
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
    setChargement(true);
    setFini(false);
    void charger(null);
  }, [charger, recharger]);

  // Sentinelle ré-armée sur posts.length : sans cela, sur un grand écran elle
  // reste visible et la page suivante n'est jamais demandée — le fil se fige.
  useEffect(() => {
    const el = sentinelle.current;
    if (!el || fini || chargement) return;
    const obs = new IntersectionObserver(
      (entrees) => {
        if (entrees[0]?.isIntersecting && posts.length > 0) {
          void charger(posts[posts.length - 1].created_at);
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [posts, fini, chargement, charger]);

  if (chargement) {
    return (
      <div className="space-y-4 px-4 md:px-0">
        {[0, 1, 2].map((i) => (
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
        <BandeauApercu quoi="Personne n'a encore publié. Voici à quoi ressemblera le fil." />
        <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          <p className="font-medium">Le fil est vide</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Soyez le premier à raconter un voyage, partager une adresse ou
            signaler un bon plan. Vous pourrez y taguer un lieu et un plat — c'est
            ce qui fera remonter les bonnes adresses.
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

  return (
    <div className="space-y-0 md:space-y-4">
      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          onSupprime={(id) => setPosts((l) => l.filter((x) => x.id !== id))}
        />
      ))}

      <div ref={sentinelle} className="h-10" aria-hidden="true" />

      {fini && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Vous avez tout vu.
        </p>
      )}
    </div>
  );
}
