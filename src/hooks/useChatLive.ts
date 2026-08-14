import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Msg = Pick<
  Tables<"messages">,
  "id" | "conv_id" | "sender_id" | "body" | "created_at" | "read"
> & {
  /** Message affiché avant confirmation du serveur. */
  provisoire?: boolean;
  /** L'envoi a échoué : on garde la bulle et on propose de réessayer. */
  echoue?: boolean;
};

/**
 * Une conversation vivante — l'expérience d'une vraie messagerie.
 *
 * ⚠ DEUX DÉFAUTS DE FOND CORRIGÉS EN MÊME TEMPS QUE CE HOOK (migration 0021) :
 *   · la publication `supabase_realtime` ne contenait AUCUNE table, donc le
 *     canal s'abonnait sans jamais rien recevoir — un message n'apparaissait
 *     qu'au rechargement ;
 *   · il n'existait aucune policy UPDATE sur `messages`, donc `read` était une
 *     colonne morte et « Vu » était impossible.
 *
 * Ce que ce hook apporte, dans l'ordre de ce qui se voit :
 *
 *  ① ENVOI OPTIMISTE. La bulle apparaît AVANT l'aller-retour. Sur une 3G à
 *    800 ms, attendre la confirmation donne l'impression que le bouton ne
 *    marche pas — et on appuie deux fois.
 *
 *  ② DÉDOUBLONNAGE. Le message provisoire est remplacé par le vrai quand le
 *    serveur le renvoie par le canal temps réel. Sans ça, chaque message
 *    envoyé s'afficherait DEUX fois.
 *
 *  ③ « EN TRAIN D'ÉCRIRE » par diffusion, sans écrire en base. Une frappe ne
 *    doit pas coûter une ligne : c'est le genre de détail qui a fait exploser
 *    l'egress du projet frère.
 *
 * ⚠ Le suffixe aléatoire du nom de canal évite « cannot add postgres_changes
 *   callbacks after subscribe() » quand React remonte le composant en mode
 *   strict.
 */
export function useChatLive(convId: string | null, moi: string | undefined) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chargement, setChargement] = useState(false);
  const [autreEcrit, setAutreEcrit] = useState(false);
  const canal = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const minuteurFrappe = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Chargement + abonnement ──────────────────────────────────────────── */
  useEffect(() => {
    if (!convId) {
      setMessages([]);
      return;
    }
    let vivant = true;
    setChargement(true);

    void (async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, conv_id, sender_id, body, created_at, read")
        .eq("conv_id", convId)
        .order("created_at")
        .limit(200);
      if (!vivant) return;
      setMessages((data as Msg[]) ?? []);
      setChargement(false);
      // Ouvrir une conversation = l'avoir lue. Un seul appel, pas un par
      // message.
      void supabase.rpc("marquer_conversation_lue", { p_conv: convId });
    })();

    const c = supabase
      .channel(`conv-${convId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conv_id=eq.${convId}` },
        (charge) => {
          const arrive = charge.new as Msg;
          setMessages((liste) => {
            // Déjà là (on l'a inséré nous-mêmes) → on ne double pas.
            if (liste.some((m) => m.id === arrive.id)) return liste;
            // Remplace la bulle provisoire correspondante, s'il y en a une.
            const i = liste.findIndex(
              (m) => m.provisoire && m.sender_id === arrive.sender_id && m.body === arrive.body
            );
            if (i >= 0) {
              const copie = [...liste];
              copie[i] = arrive;
              return copie;
            }
            return [...liste, arrive];
          });
          // Un message reçu pendant qu'on regarde est lu immédiatement.
          if (arrive.sender_id !== moi) {
            void supabase.rpc("marquer_conversation_lue", { p_conv: convId });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conv_id=eq.${convId}` },
        (charge) => {
          const maj = charge.new as Msg;
          setMessages((l) => l.map((m) => (m.id === maj.id ? { ...m, read: maj.read } : m)));
        }
      )
      // La frappe passe par une DIFFUSION : rien n'est écrit en base.
      .on("broadcast", { event: "frappe" }, ({ payload }) => {
        if ((payload as { de?: string })?.de === moi) return;
        setAutreEcrit(true);
        if (minuteurFrappe.current) clearTimeout(minuteurFrappe.current);
        minuteurFrappe.current = setTimeout(() => setAutreEcrit(false), 3000);
      })
      .subscribe();

    canal.current = c;
    return () => {
      vivant = false;
      if (minuteurFrappe.current) clearTimeout(minuteurFrappe.current);
      setAutreEcrit(false);
      void supabase.removeChannel(c);
      canal.current = null;
    };
  }, [convId, moi]);

  /* ── Signaler qu'on écrit ─────────────────────────────────────────────── */
  const dernierSignal = useRef(0);
  const signalerFrappe = useCallback(() => {
    // Une diffusion toutes les deux secondes au plus : sinon chaque touche
    // enfoncée part sur le réseau.
    if (Date.now() - dernierSignal.current < 2000) return;
    dernierSignal.current = Date.now();
    void canal.current?.send({ type: "broadcast", event: "frappe", payload: { de: moi } });
  }, [moi]);

  /* ── Envoi ────────────────────────────────────────────────────────────── */
  const envoyer = useCallback(
    async (texte: string) => {
      const corps = texte.trim();
      if (!convId || !corps || !moi) return;

      const idProvisoire = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const provisoire: Msg = {
        id: idProvisoire,
        conv_id: convId,
        sender_id: moi,
        body: corps,
        created_at: new Date().toISOString(),
        read: false,
        provisoire: true,
      };
      setMessages((l) => [...l, provisoire]);

      const { data, error } = await supabase
        .from("messages")
        .insert({ conv_id: convId, sender_id: moi, body: corps })
        .select("id, conv_id, sender_id, body, created_at, read")
        .maybeSingle();

      setMessages((l) =>
        l.map((m) =>
          m.id === idProvisoire
            ? error || !data
              ? { ...m, echoue: true, provisoire: false }
              : (data as Msg)
            : m
        )
      );
      if (error) throw error;
    },
    [convId, moi]
  );

  /** Réessaie un message échoué, en le remettant en file. */
  const reessayer = useCallback(
    async (id: string) => {
      const m = messages.find((x) => x.id === id);
      if (!m) return;
      setMessages((l) => l.filter((x) => x.id !== id));
      await envoyer(m.body);
    },
    [messages, envoyer]
  );

  return { messages, chargement, autreEcrit, envoyer, reessayer, signalerFrappe };
}
