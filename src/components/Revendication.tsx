import { useRef, useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { revendiquer } from "@/lib/etablissements";
import {
  ACCEPT_FICHIER,
  FORMATS_LISIBLES,
  OU_TROUVER,
  formeNif,
  formeStat,
  formeTel,
  televerserPiece,
} from "@/lib/justificatifs";
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
 *
 * 🔴 LA PHOTO DU LIEU ÉTAIT ANNONCÉE « FACULTATIF » — donc presque jamais
 *    jointe, et le dossier se réduisait alors à des numéros qui se recopient
 *    depuis n'importe quelle facture affichée au comptoir. C'est pourtant la
 *    seule preuve qu'on ne peut pas produire sans se déplacer : elle devient
 *    obligatoire, dans le libellé ET dans la condition d'envoi.
 *
 * ⚠ CET ÉCRAN DEMANDE EXACTEMENT CE QUE LA BASE EXIGERA, NI PLUS NI MOINS.
 *   🔴 AU PRÉSENT, CETTE PHRASE ÉTAIT FAUSSE — et la croire ferait relâcher les
 *      contrôles d'ici. La migration 0084 fera refuser à `revendiquer_page` un
 *      dossier sans photo du lieu, sans numéro joignable et sans couple fiscal
 *      ni pièce ; elle N'EST PAS ENCORE APPLIQUÉE (au 16/08/2026, la dernière
 *      migration en base est 0082). La fonction qui tourne aujourd'hui est
 *      celle de 0078 : elle accepte un dossier entièrement vide. Tant que 0084
 *      n'est pas passée, les vérifications de ce fichier sont les SEULES.
 *   Une fois 0084 appliquée, le miroir doit tenir dans les deux sens : toute
 *   condition ajoutée en base se recopie ici, et rien ne se bloque ici qui
 *   passerait là-bas. Sans ce miroir, on fait téléverser cinq minutes en 3G
 *   pour rendre une erreur PostgreSQL brute, que personne ne sait traduire en
 *   « il vous manque la photo ».
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

  // 🔴 LE FORMULAIRE S'OUVRAIT EN ÉTAT D'ERREUR. Le manque se calculait sur des
  //    champs encore vierges : « Il manque encore un numéro où vous rappeler,
  //    la photo du lieu et de quoi prouver que… » s'affichait AVANT la première
  //    frappe, et chaque aide de champ virait au reproche au premier caractère.
  //    On accusait quelqu'un de n'avoir pas fait ce qu'on venait tout juste de
  //    lui demander ; ça se lit « ce site ne veut pas de moi », et ça se ferme.
  //
  // ⚠ DEUX DÉCLENCHEURS, PAS UN, PARCE QU'ILS NE COUVRENT PAS LA MÊME CHOSE.
  //   `touche` s'allume champ par champ au `blur` — l'erreur arrive quand on a
  //   fini d'écrire, pas à la troisième lettre d'un numéro. `tente` s'allume à
  //   la première pression sur Envoyer et montre TOUT, y compris les deux
  //   pièces jointes, qu'aucun `blur` n'atteindra jamais.
  const [touche, setTouche] = useState<Record<"tel" | "nif" | "stat", boolean>>({
    tel: false,
    nif: false,
    stat: false,
  });
  const [tente, setTente] = useState(false);

  const vNif = formeNif(nif);
  const vStat = formeStat(stat);
  const vTel = formeTel(tel);

  const aTel = aideChamp(
    vTel,
    tente || touche.tel,
    "C'est le numéro que nous appelons pour vérifier. Il n'est jamais publié."
  );
  const aNif = aideChamp(vNif, tente || touche.nif, OU_TROUVER.nif);
  const aStat = aideChamp(vStat, tente || touche.stat, OU_TROUVER.stat);

  // ⚠ « LE COUPLE FISCAL OU UNE PIÈCE » RESTE UN CHOIX : une gargote n'a
  //   souvent qu'un des deux papiers, et exiger les deux écarterait exactement
  //   les établissements que personne d'autre ne référencera.
  const documents = (vNif.ok && vStat.ok) || Boolean(piece);
  const complet = documents && Boolean(photo) && vTel.ok;

  // ⚠ ON NOMME CE QUI MANQUE, PIÈCE PAR PIÈCE. Un bouton muet — grisé, ou qui
  //   ne répond rien — se lit « le site est cassé » : on recharge la page, et
  //   toute la saisie, téléversements compris, repart à zéro.
  // ⚠ CETTE LISTE NE S'AFFICHE QU'APRÈS `tente` (voir plus bas) : la calculer
  //   ici sur des champs vierges ne coûte rien, la MONTRER coûtait la personne.
  // ⚠ Le troisième point reste vague EXPRÈS : détailler « le NIF et le STAT, ou
  //   un document » ici donnait « … et le NIF et le STAT, ou un document »,
  //   illisible dès que les trois manquent. Le choix est expliqué juste en
  //   dessous, où il a la place d'une phrase entière.
  const manque = [
    !vTel.ok && "un numéro où vous rappeler",
    !photo && "la photo du lieu",
    !documents && "de quoi prouver que cet établissement est le vôtre",
  ].filter((x): x is string => typeof x === "string");

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

    // 🔴 LE BOUTON ÉTAIT GRISÉ TANT QUE LE DOSSIER ÉTAIT INCOMPLET — donc la
    //    « première tentative d'envoi » n'existait pas, et le seul moment où
    //    l'on pouvait légitimement dire ce qui manque n'arrivait jamais. Le
    //    bouton reste cliquable : le clic RÉVÈLE les manques et ne part pas.
    //    Aucun appel réseau, aucune erreur PostgreSQL brute — une phrase en
    //    français, à l'endroit où la personne vient de regarder.
    if (!complet) {
      setTente(true);
      setTouche({ tel: true, nif: true, stat: true });
      return;
    }

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

        {/* ⚠ LA VÉRIFICATION SE TERMINE PAR UN APPEL — le dire ici, c'est la
            différence entre un vrai numéro et un numéro de façade. */}
        <label className="mt-3 block text-sm font-medium" htmlFor="tel-rev">
          Votre numéro
        </label>
        <input
          id="tel-rev"
          value={tel}
          onChange={(e) => setTel(e.target.value)}
          onBlur={() => setTouche((t) => ({ ...t, tel: true }))}
          inputMode="tel"
          placeholder="034 00 000 00"
          aria-invalid={aTel.erreur || undefined}
          aria-describedby="tel-rev-aide"
          className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
        />
        <p id="tel-rev-aide" className={cn("mt-1 text-xs", aTel.classe)}>
          {aTel.texte}
        </p>

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
          onBlur={() => setTouche((t) => ({ ...t, nif: true }))}
          inputMode="numeric"
          aria-invalid={aNif.erreur || undefined}
          aria-describedby="nif-rev-aide"
          className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base tabular-nums"
        />
        <p id="nif-rev-aide" className={cn("mt-1 text-xs", aNif.classe)}>
          {aNif.texte}
        </p>

        <label className="mt-3 block text-sm font-medium" htmlFor="stat-rev">
          Numéro STAT
        </label>
        <input
          id="stat-rev"
          value={stat}
          onChange={(e) => setStat(e.target.value)}
          onBlur={() => setTouche((t) => ({ ...t, stat: true }))}
          aria-invalid={aStat.erreur || undefined}
          aria-describedby="stat-rev-aide"
          className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base tabular-nums"
        />
        <p id="stat-rev-aide" className={cn("mt-1 text-xs", aStat.classe)}>
          {aStat.texte}
        </p>

        <Piece
          titre="Un document à votre nom"
          exigence="à défaut du NIF et du STAT"
          aide={OU_TROUVER.piece}
          formats={FORMATS_LISIBLES.piece}
          fichier={piece}
          occupe={enCours === "piece"}
          onChoisir={() => refPiece.current?.click()}
          onRetirer={() => setPiece(null)}
        />
        {/* 🔴 `accept` NE S'ÉCRIT PLUS À LA MAIN. Il se déduit de la liste que
            `televerserPiece` applique : c'est la seule façon que le sélecteur
            ne propose jamais un format qu'on refusera trois minutes plus tard,
            une fois la 3G consommée. */}
        <input
          ref={refPiece}
          type="file"
          accept={ACCEPT_FICHIER.piece}
          className="hidden"
          onChange={(e) => void joindre(e, "piece")}
        />

        {/* ⚠ L'AIDE DIT À QUOI SERT CETTE PHOTO, pas ce qu'elle doit contenir.
            Une exigence de plus sans raison se lit comme une tracasserie et
            fait fermer le formulaire ; « c'est ce qui montre que vous y êtes »
            se comprend en une lecture, et se photographie en dix secondes. */}
        <Piece
          titre="Une photo du lieu"
          exigence="obligatoire"
          aide={OU_TROUVER.photoLieu}
          formats={FORMATS_LISIBLES.photo_lieu}
          fichier={photo}
          occupe={enCours === "photo_lieu"}
          onChoisir={() => refPhoto.current?.click()}
          onRetirer={() => setPhoto(null)}
        />
        {/* 🔴 C'ÉTAIT `image/*` ICI, ET LE VALIDATEUR N'EN CONNAÎT QUE TROIS.
            Un HEIC — le réglage d'usine de beaucoup d'iPhone et de Samsung —
            passait donc le sélecteur pour se faire refuser après l'envoi.
            ⚠ Et pas de PDF sur ce champ-là : on demande une photo prise sur
              place, la seule preuve qui ne se recopie pas depuis une facture. */}
        <input
          ref={refPhoto}
          type="file"
          accept={ACCEPT_FICHIER.photo_lieu}
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

        {/* ⚠ ON DIT CE QUI MANQUE, on ne grise pas le bouton en silence.
            ⚠ `text-accent-strong` et jamais `text-accent` : le corail #F4633A
              ne passe pas 4,5:1 et ce message est précisément celui qu'il ne
              faut pas rater.
            ⚠ `tente &&` EST LA CONDITION QUI EMPÊCHE L'ACCUSATION D'OUVERTURE.
              Sans elle, ce bloc s'affichait sur un formulaire vierge.
            ⚠ `role="alert"` parce qu'il apparaît en réponse à un clic : sans
              lui, un lecteur d'écran annonce « Envoyer mon dossier » et rien
              d'autre — le bouton semble ne rien faire. */}
        {tente && manque.length > 0 && (
          <div role="alert" className="mt-3 space-y-1">
            <p className="text-xs font-medium leading-relaxed text-accent-strong">
              Il manque encore {enumerer(manque)}.
            </p>
            {!documents && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Pour cette preuve, l'un ou l'autre suffit : le NIF{" "}
                <strong>et</strong> le STAT, <strong>ou</strong> un document à
                votre nom.
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          {/* ⚠ CE BOUTON N'EST PLUS GRISÉ PAR L'INCOMPLÉTUDE : il répond en
              nommant ce qui manque, et ne part pas. Il reste désactivé pendant
              l'envoi et pendant un téléversement — là, cliquer déposerait
              vraiment un dossier en double ou amputé d'une pièce en cours. */}
          <button
            onClick={() => void envoyer()}
            disabled={envoi || enCours !== null}
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

/** « a », « a et b », « a, b et c » — la liste écrite comme on la dirait. */
function enumerer(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/**
 * L'AIDE SOUS UN CHAMP : neutre, réussie, ou fautive.
 *
 * 🔴 L'ERREUR ÉTAIT GRISE, DONC INVISIBLE. `vTel.ok ? "text-primary" :
 *    "text-muted-foreground"` donnait à « 6 chiffres — il en faut au moins 9 »
 *    exactement la couleur de la phrase d'aide neutre qu'elle remplaçait. Le
 *    message existait, personne ne le distinguait, et on cherchait pourquoi le
 *    dossier ne partait pas en relisant un texte qui avait l'air anodin.
 *
 * ⚠ `text-accent-strong` (#D0471C) et JAMAIS `text-accent` : index.css écrit à
 *   la ligne du token que le corail #F4633A ne sert « dès qu'il y a du texte ».
 *
 * ⚠ ET JAMAIS FAUTIVE AVANT QUE LA PERSONNE AIT EU SA CHANCE : `montrer` vaut
 *   le `blur` du champ ou la première tentative d'envoi. Un champ encore vide
 *   rend `message` vide, donc reste neutre de toute façon — mais un champ à
 *   moitié tapé, lui, serait rouge dès la deuxième lettre sans ce garde-fou.
 */
function aideChamp(
  etat: { ok: boolean; message: string },
  montrer: boolean,
  defaut: string
): { erreur: boolean; texte: string; classe: string } {
  if (etat.ok) return { erreur: false, texte: etat.message, classe: "text-primary" };
  if (montrer && etat.message !== "") {
    return { erreur: true, texte: etat.message, classe: "text-accent-strong" };
  }
  return { erreur: false, texte: defaut, classe: "text-muted-foreground" };
}

function Piece({
  titre,
  exigence,
  aide,
  formats,
  fichier,
  occupe,
  onChoisir,
  onRetirer,
}: {
  titre: string;
  /** ⚠ « obligatoire » ou « à défaut du NIF et du STAT » : sans cette mention,
   *  il faut cliquer sur Envoyer pour découvrir laquelle des deux pièces
   *  bloque — et l'une des deux ne bloque justement pas. */
  exigence?: string;
  aide: string;
  /** ⚠ LES FORMATS ACCEPTÉS, ÉCRITS. L'attribut `accept` grise les fichiers
   *  refusés sans jamais dire pourquoi : quelqu'un qui ne retrouve pas sa photo
   *  dans la liste en conclut que le site est cassé, pas que son HEIC n'est pas
   *  lisible. La phrase vient de `justificatifs.ts`, avec la règle. */
  formats: string;
  fichier: { nom: string } | null;
  occupe: boolean;
  onChoisir: () => void;
  onRetirer: () => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-sm font-medium">
        {titre}
        {exigence && (
          <span className="font-normal text-muted-foreground"> · {exigence}</span>
        )}
      </p>
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
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{formats}</p>
        </>
      )}
    </div>
  );
}
