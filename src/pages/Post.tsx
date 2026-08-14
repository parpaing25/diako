import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PostCard } from "@/components/PostCard";
import { Commentaires } from "@/components/Commentaires";
import { chargerPost, type Post as TypePost } from "@/lib/api";
import { useReveal } from "@/hooks/useReveal";

/**
 * Une publication seule, à son adresse propre.
 *
 * ⚠ POURQUOI CET ÉCRAN EXISTE. Le bouton « Partager » copiait l'URL
 *   `/?post=<id>` et toutes les notifications de réaction et de commentaire
 *   pointaient au même endroit — mais aucun écran ne lisait ce paramètre.
 *   Résultat : un récit envoyé à un ami ouvrait l'accueil, et cliquer sur
 *   « Untel a commenté votre publication » ne montrait pas la publication.
 *
 *   Un récit qu'on ne peut pas envoyer par lien ne circule pas, et c'est
 *   pourtant exactement ce qu'on fait au retour d'un voyage.
 *
 * On affiche la carte façon ordinateur sur les deux supports : ici on vient
 * pour LIRE un récit précis, pas pour faire défiler un fil.
 */
export default function Post() {
  useReveal();
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<TypePost | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absent" | "erreur">("chargement");

  useDocumentTitle(
    post?.place ? `${post.place} — Diako` : post?.body?.slice(0, 60) || "Publication"
  );

  const charger = useCallback(async () => {
    if (!id) return;
    setEtat("chargement");
    try {
      const p = await chargerPost(id);
      if (!p) {
        setEtat("absent");
        return;
      }
      setPost(p);
      setEtat("ok");
    } catch {
      setEtat("erreur");
    }
  }, [id]);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (etat === "chargement") {
    return (
      <div className="dk-colonne px-4 py-5">
        <div className="rounded-2xl border border-border p-4">
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
      </div>
    );
  }

  if (etat === "absent" || !post) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Cette publication n'existe plus</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Elle a peut-être été retirée par son auteur.
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Revenir au fil
        </Link>
      </div>
    );
  }

  if (etat === "erreur") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="font-medium">La publication n'a pas pu être chargée</p>
        <button
          onClick={() => void charger()}
          className="mt-4 min-h-10 rounded-full border border-input px-5 text-sm font-medium"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="dk-colonne px-4 py-5">
      <PostCard post={post} onSupprime={() => setEtat("absent")} />

      <section aria-labelledby="titre-commentaires" className="mt-4 rounded-2xl border border-border p-4">
        <h2 id="titre-commentaires" className="text-sm font-semibold">
          Commentaires
        </h2>
        <div className="mt-3">
          <Commentaires postId={post.id} />
        </div>
      </section>
    </div>
  );
}
