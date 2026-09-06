import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Les deux droits RGPD qu'on exerce soi-même, depuis Paramètres :
 * télécharger ses données (RPC `mes_donnees`, migration 0122) et supprimer
 * son compte (Edge Function `supprimer-mon-compte`, clé service côté serveur).
 *
 * ⚠ AVANT LA MIGRATION ET LE DÉPLOIEMENT DE LA FONCTION, les deux appels
 *   échouent : l'écran ne ment pas, il donne l'adresse et le délai légal.
 *   C'était déjà le comportement précédent (un toast qui renvoyait à un
 *   e-mail — et à la boîte de Fonenako, audit du 05/09/2026).
 * ⚠ L'identifiant du compte ne part JAMAIS dans le corps d'une requête : la
 *   fonction le lit dans le jeton vérifié (règle CLAUDE.md « jamais
 *   d'identifiant utilisateur venant du corps »).
 */
export function MesDonnees() {
  const [busy, setBusy] = useState<"export" | "suppression" | null>(null);

  async function exporter() {
    if (busy) return;
    setBusy("export");
    try {
      const { data, error } = await supabase.rpc("mes_donnees");
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `diako-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Vos données sont téléchargées.");
    } catch {
      toast.error("Export indisponible pour l'instant.", {
        description: "Écrivez à contact.diako@gmail.com : nous vous l'envoyons sous un mois.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function supprimer() {
    if (busy) return;
    const ok = window.confirm(
      "Supprimer votre compte ? Vos récits, photos, commentaires et messages seront effacés. Cette action est définitive."
    );
    if (!ok) return;
    setBusy("suppression");
    try {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>("supprimer-mon-compte");
      if (error || !data?.ok) throw error ?? new Error("réponse inattendue");
      await supabase.auth.signOut();
      toast.success("Votre compte est supprimé.");
      window.location.assign("/");
    } catch {
      toast.error("La suppression n'a pas pu se faire.", {
        description: "Écrivez à contact.diako@gmail.com : votre compte sera effacé sous 48 h.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void exporter()}
        disabled={busy !== null}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted disabled:opacity-60"
      >
        <Download className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">
            {busy === "export" ? "Préparation…" : "Télécharger mes données"}
          </span>
          <span className="block text-xs text-muted-foreground">
            Profil, récits, réactions, carnet, messages — un fichier JSON.
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => void supprimer()}
        disabled={busy !== null}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-destructive transition hover:bg-destructive/5 disabled:opacity-60"
      >
        <Trash2 className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">
            {busy === "suppression" ? "Suppression…" : "Supprimer mon compte"}
          </span>
          <span className="block text-xs text-muted-foreground">
            Immédiat et définitif : récits, photos, commentaires et messages effacés.
          </span>
        </span>
      </button>
    </>
  );
}
