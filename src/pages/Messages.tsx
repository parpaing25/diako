import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Check, CheckCheck, MessageCircle, Send } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import { useChatLive, type Msg } from "@/hooks/useChatLive";
import { getThumbUrl } from "@/lib/imageThumb";
import { mesConversations, type Conversation } from "@/lib/api";
import { cn } from "@/lib/utils";

const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** « Aujourd'hui », « Hier », puis la date. Repère de lecture, pas décoration. */
function jourLisible(iso: string): string {
  const d = new Date(iso);
  const aujourdhui = new Date();
  const hier = new Date(aujourdhui);
  hier.setDate(hier.getDate() - 1);
  const memeJour = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (memeJour(d, aujourdhui)) return "Aujourd'hui";
  if (memeJour(d, hier)) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Messagerie.
 *
 * ⚠ C'est le SEUL endroit du site où le temps réel est autorisé — avec les
 *   notifications. Sur le projet frère, 17 canaux ouverts ont produit environ
 *   6 Go par mois de battements de cœur sur un quota gratuit de 2 Go. Ici : un
 *   canal, uniquement quand une conversation est ouverte, refermé en quittant.
 *
 * ⚠ ET IL NE MARCHAIT PAS. La publication `supabase_realtime` ne contenait
 *   aucune table : le canal s'abonnait sans jamais rien recevoir, et un
 *   message n'apparaissait qu'au rechargement. Corrigé en migration 0021, avec
 *   la policy UPDATE qui manquait pour marquer « lu ».
 *
 * Ce qui rend la conversation vivante, dans l'ordre de ce qui se remarque :
 * envoi optimiste, accusé de lecture, « en train d'écrire », bulles groupées
 * par auteur, séparateurs de jour, Entrée pour envoyer.
 */
export default function Messages() {
  useDocumentTitle("Messages");
  const { user, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const convId = params.get("c");

  const [convs, setConvs] = useState<Conversation[]>([]);
  const [saisie, setSaisie] = useState("");
  const [chargementListe, setChargementListe] = useState(true);
  const bas = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);

  const { messages, chargement, autreEcrit, envoyer, reessayer, signalerFrappe } = useChatLive(
    convId,
    user?.id
  );

  useEffect(() => {
    if (authLoading || !user) {
      if (!authLoading) setChargementListe(false);
      return;
    }
    void mesConversations()
      .then(setConvs)
      .catch(() => undefined)
      .finally(() => setChargementListe(false));
  }, [user, authLoading]);

  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, autreEcrit]);

  const soumettre = useCallback(async () => {
    const texte = saisie;
    if (!texte.trim()) return;
    setSaisie("");
    if (champ.current) champ.current.style.height = "auto";
    try {
      await envoyer(texte);
    } catch {
      toast.error("Le message n'est pas parti. Appuyez sur la bulle pour réessayer.");
    }
  }, [saisie, envoyer]);

  if (!authLoading && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
          <MessageCircle className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Vos messages</h1>
        <p className="mt-2 text-muted-foreground">
          Connectez-vous pour écrire aux voyageurs et aux établissements.
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

  const active = convs.find((c) => c.id === convId);

  /* ── Une conversation ouverte ────────────────────────────────────────── */
  if (convId) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
        <div className="dk-glass sticky top-0 z-10 flex items-center gap-3 border-b border-border px-4 py-3">
          <button
            onClick={() => setParams({})}
            aria-label="Retour aux conversations"
            className="dk-tap grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-sm font-semibold">
            {active?.autre.avatar ? (
              <img
                src={getThumbUrl(active.autre.avatar)}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 object-cover"
              />
            ) : (
              (active?.autre.name || "?").slice(0, 1).toUpperCase()
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">
              {active?.autre.name || "Conversation"}
            </p>
            {autreEcrit && (
              <p className="text-xs text-primary">en train d'écrire…</p>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-4 py-4">
          {chargement && messages.length === 0 && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="dk-skeleton h-10 w-2/3 rounded-2xl" />
              ))}
            </div>
          )}

          {!chargement && messages.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun message. Écrivez le premier.
            </p>
          )}

          {messages.map((m, i) => (
            <Bulle
              key={m.id}
              message={m}
              precedent={messages[i - 1]}
              suivant={messages[i + 1]}
              moi={user?.id}
              onReessayer={() => void reessayer(m.id)}
            />
          ))}

          {autreEcrit && (
            <div className="flex justify-start pt-1">
              <div className="flex gap-1 rounded-2xl bg-muted px-3 py-2.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={bas} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void soumettre();
          }}
          className="flex items-end gap-2 border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          <label htmlFor="msg" className="sr-only">
            Votre message
          </label>
          <textarea
            id="msg"
            ref={champ}
            value={saisie}
            rows={1}
            onChange={(e) => {
              setSaisie(e.target.value);
              signalerFrappe();
              // Le champ grandit avec le texte, jusqu'à cinq lignes : écrire un
              // paragraphe dans une ligne unique est pénible.
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              // Entrée envoie, Maj+Entrée passe à la ligne — la convention de
              // toutes les messageries. Sur téléphone on garde le retour à la
              // ligne : le clavier virtuel n'a pas de Maj pratique.
              if (e.key === "Enter" && !e.shiftKey && window.innerWidth >= 768) {
                e.preventDefault();
                void soumettre();
              }
            }}
            placeholder="Écrire un message…"
            maxLength={4000}
            className="max-h-[120px] min-h-[44px] w-full min-w-0 flex-1 resize-none rounded-2xl bg-muted px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={!saisie.trim()}
            aria-label="Envoyer"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    );
  }

  /* ── Liste des conversations ─────────────────────────────────────────── */
  return (
    <div className="px-4 py-5">
      <h1 className="text-2xl font-semibold">Messages</h1>

      {chargementListe ? (
        <div className="mt-5 space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="dk-skeleton h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : convs.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
            <MessageCircle className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-4 font-medium">Aucune conversation</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Ouvrez la fiche d'un hôtel ou d'une agence et écrivez-lui — la
            conversation apparaîtra ici.
          </p>
          <Link
            to="/recherche"
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
          >
            Trouver un établissement
          </Link>
        </div>
      ) : (
        <ul className="dk-stagger mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {convs.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setParams({ c: c.id })}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-semibold">
                  {c.autre.avatar ? (
                    <img
                      src={getThumbUrl(c.autre.avatar)}
                      alt=""
                      width={44}
                      height={44}
                      className="h-11 w-11 object-cover"
                    />
                  ) : (
                    (c.autre.name || "?").slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.autre.name || "Membre"}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {c.dernier || "Nouvelle conversation"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Une bulle.
 *
 * Le regroupement compte plus qu'il n'y paraît : trois messages d'affilée du
 * même auteur forment un bloc, avec l'heure sur le DERNIER seulement. Répéter
 * l'heure sur chaque ligne hache la lecture et fait paraître la conversation
 * plus longue qu'elle n'est.
 */
function Bulle({
  message,
  precedent,
  suivant,
  moi,
  onReessayer,
}: {
  message: Msg;
  precedent?: Msg;
  suivant?: Msg;
  moi?: string;
  onReessayer: () => void;
}) {
  const aMoi = message.sender_id === moi;
  const memeAuteurAvant = precedent?.sender_id === message.sender_id;
  const memeAuteurApres = suivant?.sender_id === message.sender_id;

  // Un nouveau jour, ou plus d'une heure d'écart : on repose un repère.
  const nouveauJour =
    !precedent ||
    new Date(precedent.created_at).toDateString() !== new Date(message.created_at).toDateString();
  const grosseCoupure =
    precedent &&
    new Date(message.created_at).getTime() - new Date(precedent.created_at).getTime() > 3600_000;

  return (
    <>
      {(nouveauJour || grosseCoupure) && (
        <p className="py-3 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {jourLisible(message.created_at)}
        </p>
      )}

      <div className={cn("flex", aMoi ? "justify-end" : "justify-start", memeAuteurAvant && !nouveauJour ? "mt-0.5" : "mt-2")}>
        <div className="max-w-[80%]">
          <button
            type="button"
            onClick={message.echoue ? onReessayer : undefined}
            disabled={!message.echoue}
            className={cn(
              "block w-full rounded-2xl px-3.5 py-2 text-left transition",
              aMoi ? "bg-primary text-primary-foreground" : "bg-muted",
              // Les coins se ferment à l'intérieur d'un groupe : c'est ce qui
              // fait lire trois bulles comme un seul bloc.
              aMoi && memeAuteurAvant && !nouveauJour && "rounded-tr-md",
              aMoi && memeAuteurApres && "rounded-br-md",
              !aMoi && memeAuteurAvant && !nouveauJour && "rounded-tl-md",
              !aMoi && memeAuteurApres && "rounded-bl-md",
              message.provisoire && "opacity-60",
              message.echoue && "border border-destructive bg-destructive/10 text-foreground"
            )}
          >
            <p className="whitespace-pre-line break-words text-sm">{message.body}</p>
          </button>

          {message.echoue && (
            <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-destructive">
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              Non envoyé — appuyez pour réessayer
            </p>
          )}

          {/* L'heure et l'accusé n'apparaissent qu'à la fin d'un groupe. */}
          {!memeAuteurApres && !message.echoue && (
            <p
              className={cn(
                "mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground",
                aMoi ? "justify-end" : "justify-start"
              )}
            >
              {heure(message.created_at)}
              {aMoi &&
                !message.provisoire &&
                (message.read ? (
                  <CheckCheck className="h-3 w-3 text-primary" aria-label="Vu" />
                ) : (
                  <Check className="h-3 w-3" aria-label="Envoyé" />
                ))}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
