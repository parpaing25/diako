import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import { PostCard } from "@/components/PostCard";
import { mesFavoris, type Post } from "@/lib/api";

export default function Favoris() {
  useDocumentTitle("Favoris");
  const { user, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setChargement(false);
      return;
    }
    (async () => {
      try {
        setPosts(await mesFavoris());
      } catch {
        /* liste vide */
      } finally {
        setChargement(false);
      }
    })();
  }, [user, authLoading]);

  if (!authLoading && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
          <Bookmark className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Vos favoris</h1>
        <p className="mt-2 text-muted-foreground">
          Connectez-vous pour enregistrer les publications, les adresses et les
          bons plans qui vous intéressent.
        </p>
        <Link
          to="/auth"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="py-5">
      <h1 className="px-4 text-2xl font-semibold">Favoris</h1>

      {chargement ? (
        <div className="mt-5 space-y-3 px-4">
          {[0, 1].map((i) => (
            <div key={i} className="dk-skeleton h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="mx-4 mt-6 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
            <Bookmark className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-4 font-medium">Aucun favori</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Appuyez sur « Enregistrer » sous une publication pour la retrouver
            ici, même hors ligne.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
          >
            Parcourir le fil
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-0 md:space-y-4 md:px-4">
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
  );
}
