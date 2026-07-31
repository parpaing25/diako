import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getThumbUrl } from "@/lib/imageThumb";
import {
  chargerMessages,
  envoyerMessage,
  mesConversations,
  type Conversation,
} from "@/lib/api";
import type { Tables } from "@/integrations/supabase/types";

type Msg = Pick<Tables<"messages">, "id" | "conv_id" | "sender_id" | "body" | "created_at">;

const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/**
 * Messagerie.
 *
 * ⚠ C'est le SEUL endroit du site où le temps réel est autorisé — avec les
 * notifications. Sur Fonenako, 17 canaux ouverts ont produit ~6 Go/mois de
 * battements de cœur sur un quota gratuit de 2 Go. Ici : un canal, uniquement
 * quand une conversation est ouverte, refermé en quittant.
 *
 * Le suffixe aléatoire du nom de canal évite le plantage « cannot add
 * postgres_changes callbacks after subscribe() » quand React remonte le
 * composant en mode strict.
 */
export default function Messages() {
  useDocumentTitle("Messages");
  const { user, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const convId = params.get("c");

  const [convs, setConvs] = useState<Conversation[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [saisie, setSaisie] = useState("");
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const bas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading || !user) {
      if (!authLoading) setChargement(false);
      return;
    }
    (async () => {
      try {
        setConvs(await mesConversations());
      } catch {
        /* liste vide */
      } finally {
        setChargement(false);
      }
    })();
  }, [user, authLoading]);

  const recharger = useCallback(async () => {
    if (!convId) return;
    try {
      setMsgs((await chargerMessages(convId)) as Msg[]);
    } catch {
      toast.error("Les messages n'ont pas pu être chargés.");
    }
  }, [convId]);

  useEffect(() => {
    if (!convId) {
      setMsgs([]);
      return;
    }
    void recharger();

    const canal = supabase
      .channel(`msg-${convId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conv_id=eq.${convId}` },
        (payload) => setMsgs((l) => [...l, payload.new as Msg])
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [convId, recharger]);

  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!convId || !saisie.trim() || envoi) return;
    const texte = saisie;
    setSaisie("");
    setEnvoi(true);
    try {
      await envoyerMessage(convId, texte);
    } catch {
      setSaisie(texte);
      toast.error("Le message n'a pas pu être envoyé.");
    } finally {
      setEnvoi(false);
    }
  }

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

  // ── Une conversation ouverte ─────────────────────────────────────────
  if (convId) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button
            onClick={() => setParams({})}
            aria-label="Retour aux conversations"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-sm font-semibold">
            {active?.autre.avatar ? (
              <img src={getThumbUrl(active.autre.avatar)} alt="" width={36} height={36} className="h-9 w-9 object-cover" />
            ) : (
              (active?.autre.name || "?").slice(0, 1).toUpperCase()
            )}
          </span>
          <p className="min-w-0 truncate font-medium">{active?.autre.name || "Conversation"}</p>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {msgs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun message. Écrivez le premier.
            </p>
          ) : (
            msgs.map((m) => {
              const moi = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${moi ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                      moi ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    <p className="whitespace-pre-line text-sm">{m.body}</p>
                    <p className={`mt-0.5 text-[10px] ${moi ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {heure(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bas} />
        </div>

        <form onSubmit={envoyer} className="flex items-center gap-2 border-t border-border px-4 py-3">
          <label htmlFor="msg" className="sr-only">
            Votre message
          </label>
          <input
            id="msg"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Écrire un message…"
            maxLength={4000}
            className="h-11 min-w-0 flex-1 rounded-full bg-muted px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={!saisie.trim() || envoi}
            aria-label="Envoyer"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    );
  }

  // ── Liste des conversations ──────────────────────────────────────────
  return (
    <div className="px-4 py-5">
      <h1 className="text-2xl font-semibold">Messages</h1>

      {chargement ? (
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
            Ouvrez le profil d'un voyageur ou d'un établissement et écrivez-lui —
            la conversation apparaîtra ici.
          </p>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {convs.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setParams({ c: c.id })}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-semibold">
                  {c.autre.avatar ? (
                    <img src={getThumbUrl(c.autre.avatar)} alt="" width={44} height={44} className="h-11 w-11 object-cover" />
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
