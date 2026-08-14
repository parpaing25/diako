import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Check, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getThumbUrl } from "@/lib/imageThumb";
import {
  chargerNotifications,
  mesConversations,
  toutMarquerLu,
  type Conversation,
} from "@/lib/api";
import { cn } from "@/lib/utils";

/** Le type REEL rendu par chargerNotifications — colonnes enumerees, pas la
 *  ligne entiere : user_id n'est pas selectionne, et n'a rien a faire ici. */
type NotifAffichee = Awaited<ReturnType<typeof chargerNotifications>>[number];

/**
 * Les panneaux de l'en-tête — messages et notifications.
 *
 * Le geste attendu, celui de Facebook : on clique l'icône, un aperçu s'ouvre
 * SUR PLACE, on lit, et on décide seulement ensuite d'entrer dans la page
 * complète. Sans ça, chaque coup d'œil coûtait un changement de page et un
 * retour — sur une 3G, deux chargements pour vérifier qu'il n'y avait rien.
 *
 * ⚠ Le contenu n'est chargé QU'À L'OUVERTURE. Un panneau qui interroge la base
 *   au montage de l'en-tête ferait une requête sur chaque page du site, pour
 *   un panneau que personne n'a ouvert.
 */

/* ══ La coquille ════════════════════════════════════════════════════════ */

function Panneau({
  ouvert,
  onFermer,
  titre,
  action,
  lienTout,
  libelleTout,
  children,
}: {
  ouvert: boolean;
  onFermer: () => void;
  titre: string;
  action?: React.ReactNode;
  lienTout: string;
  libelleTout: string;
  children: React.ReactNode;
}) {
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const auClic = (e: MouseEvent) => {
      if (!boite.current?.contains(e.target as Node)) onFermer();
    };
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    document.addEventListener("mousedown", auClic);
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("mousedown", auClic);
      document.removeEventListener("keydown", auClavier);
    };
  }, [ouvert, onFermer]);

  if (!ouvert) return null;

  return (
    <>
      {/* Sur téléphone, un voile : le panneau devient une feuille et on ne
          clique pas dans le contenu par mégarde. */}
      <div className="fixed inset-0 z-40 bg-black/20 sm:hidden" aria-hidden="true" />
      <div
        ref={boite}
        role="dialog"
        aria-label={titre}
        className={cn(
          "dk-scale-in z-50 overflow-hidden rounded-2xl border border-border bg-popover shadow-xl",
          "fixed inset-x-2 top-16 max-h-[75dvh]",
          "sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[380px]"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="font-semibold">{titre}</p>
          {action}
        </div>

        <div className="max-h-[55dvh] overflow-y-auto overscroll-contain">{children}</div>

        <Link
          to={lienTout}
          onClick={onFermer}
          className="block border-t border-border py-3 text-center text-sm font-medium text-primary hover:bg-muted"
        >
          {libelleTout}
        </Link>
      </div>
    </>
  );
}

/* ══ Messages ═══════════════════════════════════════════════════════════ */

export function PanneauMessages({ ouvert, onFermer }: { ouvert: boolean; onFermer: () => void }) {
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!ouvert || convs) return;
    void mesConversations()
      .then((l) => setConvs(l.slice(0, 6)))
      .catch(() => setConvs([]));
  }, [ouvert, convs]);

  return (
    <Panneau
      ouvert={ouvert}
      onFermer={onFermer}
      titre="Messages"
      lienTout="/messages"
      libelleTout="Voir tous les messages"
    >
      {convs === null ? (
        <div className="space-y-2 p-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="dk-skeleton h-14 rounded-xl" />
          ))}
        </div>
      ) : convs.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">Aucune conversation</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Écrivez à un hôtel ou à une agence depuis sa fiche.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {convs.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => {
                  onFermer();
                  navigate(`/messages?c=${c.id}`);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-sm font-semibold">
                  {c.autre.avatar ? (
                    <img
                      src={getThumbUrl(c.autre.avatar)}
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 object-cover"
                    />
                  ) : (
                    (c.autre.name || "?").slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {c.autre.name || "Membre"}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {c.dernier || "Nouvelle conversation"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panneau>
  );
}

/* ══ Notifications ══════════════════════════════════════════════════════ */

const quand = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};

/** L'adresse visée par une notification. */
function cible(n: NotifAffichee): string {
  const d = n.data as { url?: string; post_id?: string } | null;
  if (d?.url) return d.url;
  if (d?.post_id) return `/post/${d.post_id}`;
  return "/notifications";
}

export function PanneauNotifications({
  ouvert,
  onFermer,
  onLues,
}: {
  ouvert: boolean;
  onFermer: () => void;
  onLues: () => void;
}) {
  const [notifs, setNotifs] = useState<NotifAffichee[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!ouvert || notifs) return;
    void chargerNotifications(10)
      .then(setNotifs)
      .catch(() => setNotifs([]));
  }, [ouvert, notifs]);

  const toutLire = useCallback(async () => {
    await toutMarquerLu().catch(() => undefined);
    setNotifs((l) => l?.map((n) => ({ ...n, read: true })) ?? null);
    onLues();
  }, [onLues]);

  const nonLues = notifs?.filter((n) => !n.read).length ?? 0;

  return (
    <Panneau
      ouvert={ouvert}
      onFermer={onFermer}
      titre="Notifications"
      lienTout="/notifications"
      libelleTout="Voir toutes les notifications"
      action={
        nonLues > 0 ? (
          <button
            onClick={() => void toutLire()}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Tout marquer lu
          </button>
        ) : undefined
      }
    >
      {notifs === null ? (
        <div className="space-y-2 p-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="dk-skeleton h-14 rounded-xl" />
          ))}
        </div>
      ) : notifs.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">Rien de neuf</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Les réactions, les commentaires et les réponses arriveront ici.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {notifs.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => {
                  onFermer();
                  navigate(cible(n));
                }}
                className={cn(
                  "flex w-full gap-3 px-4 py-3 text-left hover:bg-muted",
                  !n.read && "bg-secondary/50"
                )}
              >
                {/* Le point ne s'affiche que sur le non-lu : un marqueur posé
                    partout ne marque plus rien. */}
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    n.read ? "bg-transparent" : "bg-accent"
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{n.title}</span>
                  {n.message && (
                    <span className="mt-0.5 block line-clamp-2 text-sm text-muted-foreground">
                      {n.message}
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {quand(n.created_at)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panneau>
  );
}

/** Le nombre de messages non lus — en un appel plutôt qu'un parcours client. */
export async function compterMessagesNonLus(): Promise<number> {
  const { data, error } = await supabase.rpc("messages_non_lus");
  if (error) return 0;
  return (data as number) ?? 0;
}
