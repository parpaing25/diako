import { useRef, useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { revendiquer } from "@/lib/etablissements";
import { OU_TROUVER, formeNif, formeStat, televerserPiece } from "@/lib/justificatifs";
import { cn } from "@/lib/utils";

/**
 * REVENDIQUER UN ÉTABLISSEMENT.
 *
 * 🔴 CE FORMULAIRE NE DEMANDAIT QU'UN NUMÉRO ET UN MESSAGE. Il ouvre pourtant
 *    sur la PROPRIÉTÉ d'une fiche : accès aux messages des clients, aux tarifs,
 *    et à ce que le public lit de l'établissement. Deux champs libres ne
 *    prouvent rien.
 *
 * ⚠ « LE COUPLE FISCAL OU UNE PIÈCE », jamais les deux exigés. Beaucoup de
 *   gargotes et de chambres d'hôtes n'ont qu'un des deux documents sous la
 *   main ; exiger l'ensemble écarterait précisément les établissements que
 *   personne d'autre ne référencera jamais.
 *
 * ⚠ AUCUN BADGE NE SORT D'ICI. Remplir NIF et STAT ne vérifie rien : recopier
 *   le même numéro dans les deux cases passe n'importe quel contrôle de forme.
 *   C'est un humain qui accorde, après avoir regardé les pièces.
 *
 * ⚠ LA VALIDATION DE FORME EST À LA FRAPPE, PAS À L'ENVOI. Sur une 3G malgache,
 *   un dossier avec deux pièces part en trois à cinq minutes : découvrir à
 *   l'arrivée qu'il manque un chiffre, c'est tout perdre. Et on AVERTIT sans
 *   jamais bloquer — un contrôle de forme n'a pas à décider à la place de
 *   quelqu'un qui a le papier sous les yeux.
 */
export function Revendication({
  ficheId,
  ficheNom,
  onFerme,
}: {
  ficheId: string;
  ficheNom: string;
  onFerme: () => void;
}) {
  const [role, setRole] = useState("proprietaire");
  const [tel, setTel] = useState("");
  const [nif, setNif] = useState("");
  const [stat, setStat] = useState("");
  const [message, setMessage] = useState("");
  const [piece, setPiece] = useState<{ nom: string; chemin: string } | null>(null);
  const [photo, setPhoto] = useState<{ nom: string; chemin: string } | null>(null);
  const [enCours, setEnCours] = useState<"piece" | "photo_lieu" | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const refPiece = useRef<HTMLInputElement>(null);
  const refPhoto = useRef<HTMLInputElement>(null);

  const vNif = formeNif(nif);
  const vStat = formeStat(stat);
  const assez = (vNif.ok && vStat.ok) || Boolean(piece);

  async function joindre(e: React.ChangeEvent<HTMLInputElement>, quoi: "piece" | "photo_lieu") {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEnCours(quoi);
    try {
      const chemin = await televerserPiece(f, quoi);
      if (quoi === "piece") setPiece({ nom: f.name, chemin });
      else setPhoto({ nom: f.name, chemin });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Le fichier n'a pas pu être envoyé.");
    } finally {
      setEnCours(null);
    }
  }

  async function envoyer() {
    if (envoi) return;
    setEnvoi(true);
    try {
      await revendiquer(ficheId, {
        message,
        tel,
        nif: nif.trim() || null,
        stat: stat.trim() || null,
        piece: piece?.chemin ?? null,
        photoLieu: photo?.chemin ?? null,
        role,
      });
      toast.success("Dossier envoyé", {
        description:
          "Nous vérifions vos pièces et vous rappelons. La fiche vous est transférée ensuite.",
      });
      onFerme();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "La demande n'a pas pu être envoyée.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end overflow-y-auto sm:place-items-center">
      <button aria-label="Fermer" onClick={onFerme} className="absolute inset-0 bg-black/50" />
      <div className="relative my-auto w-full max-w-md rounded-t-2xl bg-background p-5 sm:rounded-2xl">
        <h2 className="text-lg font-semibold">Reprendre {ficheNom}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cette fiche donne accès aux messages de vos clients et à vos tarifs.
          Nous vérifions chaque dossier à la main avant de la transférer.
        </p>

        {/* 🔴 CE BLOC EST LA DIFFÉRENCE ENTRE UN FORMULAIRE ET UNE FUITE. Les
            pièces ne partent PAS sur o2switch comme les autres photos : elles
            vont dans un espace privé, et personne d'autre que son déposant et
            l'administration ne peut les ouvrir. Ce projet a déjà exposé des
            cartes d'identité dans un dossier servi par le web — le dire ici
            n'est pas de la communication, c'est ce qui fait accepter de
            joindre une pièce. */}
        <p className="mt-3 flex gap-2 rounded-xl bg-secondary p-3 text-xs leading-relaxed">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          Vos pièces sont déposées dans un espace privé, jamais publiées, et
          consultables uniquement par notre équipe de vérification.
        </p>

        <label className="mt-4 block text-sm font-medium" htmlFor="role-rev">
          Vous êtes
        </label>
        <select
          id="role-rev"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
        >
          <option value="proprietaire">Le propriétaire</option>
          <option value="gerant">Le gérant</option>
          <option value="employe_mandate">Un employé mandaté</option>
          <option value="autre">Autre</option>
        </select>

        <label className="mt-3 block text-sm font-medium" htmlFor="tel-rev">
          Votre numéro
        </label>
        <input
          id="tel-rev"
          value={tel}
          onChange={(e) => setTel(e.target.value)}
          inputMode="tel"
          placeholder="034 00 000 00"
          className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
        />

        {/* ⚠ OÙ LE TROUVER, SOUS CHAQUE CHAMP. Sans cette phrase, un gérant qui
            ne sait pas où chercher son STAT recopie son NIF dans les deux
            cases : les deux passent le contrôle de forme, et le dossier arrive
            avec une donnée inventée de bonne foi. */}
        <label className="mt-3 block text-sm font-medium" htmlFor="nif-rev">
          Numéro NIF
        </label>
        <input
          id="nif-rev"
          value={nif}
          onChange={(e) => setNif(e.target.value)}
          inputMode="numeric"
          className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base tabular-nums"
        />
        <p className={cn("mt-1 text-xs", vNif.ok ? "text-primary" : "text-muted-foreground")}>
          {vNif.message || OU_TROUVER.nif}
        </p>

        <label className="mt-3 block text-sm font-medium" htmlFor="stat-rev">
          Numéro STAT
        </label>
        <input
          id="stat-rev"
          value={stat}
          onChange={(e) => setStat(e.target.value)}
          className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base tabular-nums"
        />
        <p className={cn("mt-1 text-xs", vStat.ok ? "text-primary" : "text-muted-foreground")}>
          {vStat.message || OU_TROUVER.stat}
        </p>

        <Piece
          titre="Un document à votre nom"
          aide={OU_TROUVER.piece}
          fichier={piece}
          occupe={enCours === "piece"}
          onChoisir={() => refPiece.current?.click()}
          onRetirer={() => setPiece(null)}
        />
        <input
          ref={refPiece}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => void joindre(e, "piece")}
        />

        <Piece
          titre="Une photo du lieu (facultatif)"
          aide="La façade, l'enseigne, l'entrée. Elle ne sera publiée qu'après vérification."
          fichier={photo}
          occupe={enCours === "photo_lieu"}
          onChoisir={() => refPhoto.current?.click()}
          onRetirer={() => setPhoto(null)}
        />
        <input
          ref={refPhoto}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void joindre(e, "photo_lieu")}
        />

        <label className="mt-3 block text-sm font-medium" htmlFor="msg-rev">
          Un mot pour nous
        </label>
        <textarea
          id="msg-rev"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Depuis quand vous gérez ce lieu, à quelle heure vous joindre…"
          className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-base"
        />

        {/* ⚠ ON DIT CE QUI MANQUE, on ne grise pas le bouton en silence. */}
        {!assez && (
          <p className="mt-3 text-xs text-muted-foreground">
            Il nous faut soit le NIF <strong>et</strong> le STAT, soit un
            document à votre nom. L'un ou l'autre suffit.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void envoyer()}
            disabled={envoi || !assez || enCours !== null}
            className="h-12 flex-1 rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-60"
          >
            {envoi ? "Envoi…" : "Envoyer mon dossier"}
          </button>
          <button onClick={onFerme} className="h-12 rounded-xl border border-input px-5">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

function Piece({
  titre,
  aide,
  fichier,
  occupe,
  onChoisir,
  onRetirer,
}: {
  titre: string;
  aide: string;
  fichier: { nom: string } | null;
  occupe: boolean;
  onChoisir: () => void;
  onRetirer: () => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-sm font-medium">{titre}</p>
      {fichier ? (
        <div className="mt-1 flex min-h-12 items-center gap-2 rounded-xl border border-primary/40 bg-secondary px-3 text-sm">
          <Lock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{fichier.nom}</span>
          <button onClick={onRetirer} className="shrink-0 text-xs underline">
            Retirer
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={onChoisir}
            disabled={occupe}
            className="mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-input text-sm disabled:opacity-60"
          >
            {occupe ? "Envoi en cours…" : "Choisir un fichier"}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">{aide}</p>
        </>
      )}
    </div>
  );
}
