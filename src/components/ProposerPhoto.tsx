import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { compressImage } from "@/lib/imageCompression";
import { uploadToO2Switch } from "@/lib/o2switchUpload";
import { proposerPhoto, type CibleType } from "@/lib/admin";

/**
 * PROPOSER UNE PHOTO POUR CETTE FICHE.
 *
 * 🔴 CE QUI MANQUAIT, ET CE QUE ÇA BLOQUAIT. Le propriétaire l'a demandé :
 *    « les utilisateurs peuvent proposer une photo, avec approbation admin ».
 *    La table, les politiques, la file de modération et l'écran d'approbation
 *    existent depuis la migration 0098 — mais AUCUN écran public n'appelait la
 *    fonction. La file ne pouvait donc se remplir que par l'administration :
 *    la moitié visible de la fonctionnalité n'était nulle part.
 *
 *    L'enjeu est concret : 419 destinations sur 508 n'ont aucune photo, et
 *    l'archive personnelle est épuisée. Les gens qui y sont allés sont la seule
 *    source qui reste.
 *
 * ⚠ RIEN N'EST PUBLIÉ ICI. `dk_proposer_photo()` dépose une ligne
 *   `en_attente` ; la fiche n'est touchée qu'à l'approbation, et le contrôle
 *   ④ de 0098 le PROUVE en base. Le bouton le dit avant l'envoi plutôt que de
 *   laisser croire à une publication immédiate — une photo qui « disparaît »
 *   sans explication est reproposée la semaine suivante.
 *
 * ⚠ L'IMAGE EST COMPRESSÉE AVANT L'ENVOI, comme dans /publier. Une photo de
 *   téléphone fait 4 à 8 Mo : l'envoyer telle quelle depuis une 3G malgache
 *   échoue une fois sur deux, et le membre croit que le bouton est cassé.
 *
 * ⚠ LE DOSSIER EST « pages », JAMAIS Supabase Storage : règle du dépôt, facteur
 *   17 sur l'egress. Et ce sont des photos de lieux — rien de personnel n'entre
 *   ici. Les pièces d'identité, elles, restent dans le bucket privé.
 */
export function ProposerPhoto({
  cibleType,
  cible,
  nom,
  className,
}: {
  cibleType: CibleType;
  cible: string;
  /** Le nom de la fiche, pour que le message dise DE QUOI on parle. */
  nom: string;
  className?: string;
}) {
  const { user } = useAuth();
  const champ = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState(false);
  const [envoyee, setEnvoyee] = useState(false);

  /* ⚠ ON NE MONTRE RIEN À QUI N'EST PAS CONNECTÉ ? Non — on montre un lien de
     connexion. Cacher le bouton laisserait croire que la fiche ne peut pas
     recevoir de photo, alors que c'est exactement ce qu'on demande aux gens. */
  if (!user) {
    return (
      <p className={className}>
        <Link to="/auth" className="text-sm font-medium text-primary underline underline-offset-4">
          Connectez-vous
        </Link>{" "}
        <span className="text-sm text-muted-foreground">
          pour proposer une photo de {nom}.
        </span>
      </p>
    );
  }

  if (envoyee) {
    return (
      <p className={`flex items-center gap-2 text-sm text-ok ${className ?? ""}`}>
        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
        Merci — votre photo est en attente de relecture.
      </p>
    );
  }

  const choisir = async (f: File | undefined) => {
    if (!f) return;
    setEnvoi(true);
    try {
      const compresse = await compressImage(f);
      const envoi = await uploadToO2Switch(compresse, "pages");
      if (!envoi.success || !envoi.url) {
        toast.error(envoi.error || "La photo n'a pas pu être envoyée.");
        return;
      }
      await proposerPhoto({ cibleType, cible, url: envoi.url });
      setEnvoyee(true);
    } catch (e) {
      /* ⚠ LE MESSAGE DU SERVEUR EST REPRIS TEL QUEL quand il existe : c'est lui
         qui dit « vous avez déjà une photo en attente pour cette fiche », et
         c'est une information utile — pas une panne. */
      const m = e instanceof Error ? e.message : "";
      toast.error(m || "La proposition n'a pas pu être enregistrée.");
    } finally {
      setEnvoi(false);
      if (champ.current) champ.current.value = "";
    }
  };

  return (
    <div className={className}>
      <input
        ref={champ}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void choisir(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => champ.current?.click()}
        disabled={envoi}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-input px-4 text-sm font-semibold disabled:opacity-60"
      >
        {envoi ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Camera className="h-4 w-4" aria-hidden="true" />
        )}
        {envoi ? "Envoi…" : "Proposer une photo"}
      </button>
      {/* ⚠ DIT AVANT, PAS APRÈS. « Elle sera relue » après l'envoi se lit comme
          un refus déguisé ; avant, c'est une règle du jeu. */}
      <p className="dk-secondaire mt-1.5 text-muted-foreground">
        Elle sera relue avant d'illustrer la fiche.
      </p>
    </div>
  );
}
