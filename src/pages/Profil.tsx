import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { MapPin, MessageCircle, UserMinus, UserPlus } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getAvatarUrl } from "@/lib/supabaseImage";
import { basculerAbonnement, ouvrirConversation } from "@/lib/api";
import { PostCard } from "@/components/PostCard";
import type { Post } from "@/lib/api";
import { useReveal } from "@/hooks/useReveal";

interface ProfilPublic {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  home_place: string | null;
  account_type: string;
  verification: string;
  followers_count: number;
  following_count: number;
  posts_count: number;
}

// ⚠ Colonnes énumérées : depuis la fermeture des données personnelles, un
// select('*') anonyme renvoie 401 (email et phone sont révoqués).
const COLONNES =
  "id,display_name,avatar_url,bio,home_place,account_type,verification,followers_count,following_count,posts_count";

export default function Profil() {
  useReveal();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profil, setProfil] = useState<ProfilPublic | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [suivi, setSuivi] = useState(false);
  const [chargement, setChargement] = useState(true);
  useDocumentTitle(profil?.display_name ?? "Profil");

  useEffect(() => {
    if (!id) return;
    (async () => {
      setChargement(true);
      const { data } = await supabase.from("profiles").select(COLONNES).eq("id", id).maybeSingle();
      setProfil((data as ProfilPublic) ?? null);

      if (user && user.id !== id) {
        const { data: f } = await supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", user.id)
          .eq("target_id", id)
          .maybeSingle();
        setSuivi(!!f);
      }

      const { data: ps } = await supabase
        .from("posts")
        .select("id,kind,body,media,place,dish,page_name,created_at,reactions_count,comments_count,saves_count")
        .eq("author_id", id)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(20);

      type L = {
        id: string; kind: string; body: string | null; media: unknown;
        place: string | null; dish: string | null; page_name: string | null;
        created_at: string; reactions_count: number; comments_count: number; saves_count: number;
      };
      setPosts(
        ((ps ?? []) as unknown as L[]).map((p) => ({
          ...p,
          media: (p.media as Post["media"]) ?? [],
          author: {
            id: id!,
            name: (data as ProfilPublic)?.display_name ?? null,
            avatar: (data as ProfilPublic)?.avatar_url ?? null,
            verification: (data as ProfilPublic)?.verification ?? "none",
            account_type: (data as ProfilPublic)?.account_type ?? "voyageur",
          },
          ma_reaction: null,
          enregistre: false,
        }))
      );
      setChargement(false);
    })();
  }, [id, user]);

  async function suivre() {
    if (!user) {
      toast("Connexion requise", { description: "Créez un compte pour suivre ce membre." });
      return;
    }
    const avant = suivi;
    setSuivi(!avant);
    try {
      setSuivi(await basculerAbonnement(id!, avant));
    } catch {
      setSuivi(avant);
      toast.error("L'abonnement n'a pas pu être enregistré.");
    }
  }

  async function ecrire() {
    if (!user) {
      toast("Connexion requise", { description: "Créez un compte pour envoyer un message." });
      return;
    }
    try {
      const conv = await ouvrirConversation(id!);
      navigate(`/messages?c=${conv}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'ouvrir la conversation.");
    }
  }

  if (chargement) {
    return (
      <div className="space-y-3 px-4 py-6">
        <div className="dk-skeleton h-24 w-24 rounded-full" />
        <div className="dk-skeleton h-6 w-48" />
        <div className="dk-skeleton h-4 w-64" />
      </div>
    );
  }

  if (!profil) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Profil introuvable</h1>
        <p className="mt-2 text-muted-foreground">Ce membre n'existe pas ou a supprimé son compte.</p>
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground">
          Retour à l'accueil
        </Link>
      </div>
    );
  }

  const moi = user?.id === profil.id;

  return (
    <div className="pb-6">
      <div className="h-28 bg-gradient-to-br from-primary to-primary-soft md:h-36 md:rounded-2xl" />

      <div className="px-4">
        <div className="-mt-12 flex items-end gap-4">
          <span className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-2xl font-bold ring-4 ring-background">
            {profil.avatar_url ? (
              <img src={getAvatarUrl(profil.avatar_url, 96)} alt="" width={96} height={96} className="h-24 w-24 object-cover" />
            ) : (
              (profil.display_name || "?").slice(0, 1).toUpperCase()
            )}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
              {profil.display_name || "Membre Diako"}
              {profil.verification !== "none" && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  ✓ vérifié
                </span>
              )}
              {profil.account_type === "pro" && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Professionnel
                </span>
              )}
            </h1>
            {profil.home_place && (
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {profil.home_place}
              </p>
            )}
          </div>

          {!moi && (
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => void suivre()}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium ${
                  suivi ? "border border-border" : "bg-primary text-primary-foreground"
                }`}
              >
                {suivi ? (
                  <>
                    <UserMinus className="h-4 w-4" aria-hidden="true" /> Abonné
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" aria-hidden="true" /> Suivre
                  </>
                )}
              </button>
              <button
                onClick={() => void ecrire()}
                aria-label="Envoyer un message"
                className="grid h-10 w-10 place-items-center rounded-full border border-border"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {profil.bio && <p className="mt-3 max-w-prose text-sm">{profil.bio}</p>}

        <div className="mt-4 flex gap-5 text-sm">
          <span><strong>{profil.posts_count}</strong> <span className="text-muted-foreground">publications</span></span>
          <span><strong>{profil.followers_count}</strong> <span className="text-muted-foreground">abonnés</span></span>
          <span><strong>{profil.following_count}</strong> <span className="text-muted-foreground">abonnements</span></span>
        </div>
      </div>

      <div className="mt-6 space-y-0 md:space-y-4 md:px-4">
        {posts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground md:px-0">
            {moi ? "Vous n'avez rien publié pour le moment." : "Ce membre n'a rien publié."}
          </p>
        ) : (
          posts.map((p) => (
            <PostCard key={p.id} post={p} onSupprime={(pid) => setPosts((l) => l.filter((x) => x.id !== pid))} />
          ))
        )}
      </div>
    </div>
  );
}
