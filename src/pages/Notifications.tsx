import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, Heart, MessageCircle, UserPlus } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import { chargerNotifications, toutMarquerLu } from "@/lib/api";
import type { Tables } from "@/integrations/supabase/types";

type Notif = Pick<Tables<"notifications">, "id" | "type" | "title" | "message" | "data" | "read" | "created_at">;

const ICONES: Record<string, typeof Bell> = {
  reaction: Heart,
  commentaire: MessageCircle,
  abonnement: UserPlus,
  message: MessageCircle,
};

function ilYA(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/** Vers où mène chaque type de notification. */
function destination(n: Notif): string {
  const d = (n.data ?? {}) as Record<string, unknown>;
  if (n.type === "message" && d.conv_id) return `/messages?c=${d.conv_id}`;
  if (d.post_id) return `/post/${d.post_id}`;
  if (d.from) return `/user/${d.from}`;
  return "/";
}

export default function Notifications() {
  useDocumentTitle("Notifications");
  const { user, loading: authLoading } = useAuth();
  const [liste, setListe] = useState<Notif[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setChargement(false);
      return;
    }
    (async () => {
      try {
        setListe((await chargerNotifications()) as Notif[]);
        await toutMarquerLu();
        window.dispatchEvent(new CustomEvent("dk:notifs-lues"));
      } catch {
        /* silencieux : une notification manquante ne casse pas la page */
      } finally {
        setChargement(false);
      }
    })();
  }, [user, authLoading]);

  if (!authLoading && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
          <Bell className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Vos notifications</h1>
        <p className="mt-2 text-muted-foreground">
          Connectez-vous pour voir les réactions, les commentaires et les
          messages qui vous concernent.
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
    <div className="px-4 py-5">
      <h1 className="text-2xl font-semibold">Notifications</h1>

      {chargement ? (
        <div className="mt-5 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="dk-skeleton h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : liste.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
            <Bell className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-4 font-medium">Aucune notification</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Vous serez prévenu quand quelqu'un réagit à vos publications, vous
            commente, vous suit ou vous écrit.
          </p>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {liste.map((n) => {
            const Icone = ICONES[n.type] ?? Bell;
            return (
              <li key={n.id}>
                <Link
                  to={destination(n)}
                  className={`flex items-start gap-3 px-4 py-3.5 transition hover:bg-muted ${
                    n.read ? "" : "bg-primary/[0.04]"
                  }`}
                >
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary">
                    <Icone className="h-4 w-4 text-primary" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{n.title}</span>
                    {n.message && (
                      <span className="block truncate text-sm text-muted-foreground">
                        {n.message}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {ilYA(n.created_at)}
                    </span>
                  </span>
                  {!n.read && (
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="non lue" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {liste.length > 0 && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Toutes marquées comme lues
        </p>
      )}
    </div>
  );
}
