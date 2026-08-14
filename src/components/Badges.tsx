import { BadgeCheck, Phone, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LES BADGES ET LES ÉTATS.
 *
 * ⚠ LA PHRASE DE LA MAQUETTE, QUI EST UNE RÈGLE JURIDIQUE AUTANT QUE VISUELLE :
 *   « Le badge dit ce qui est vérifié, jamais la qualité du service. »
 *
 *   « Documents vérifiés » veut dire qu'on a vu un NIF et une licence. Ça ne
 *   dit rien de la propreté des chambres. Un badge qui laisse croire l'inverse
 *   engage la responsabilité de Diako sur une prestation qu'il ne fournit pas
 *   (TDR §9.5 et §9.7). D'où des libellés qui nomment la PREUVE, jamais le
 *   mérite.
 */

const NIVEAUX = {
  documents: {
    label: "Documents vérifiés",
    icone: ShieldCheck,
    classe: "bg-primary text-primary-foreground",
    aide: "NIF, STAT ou licence contrôlés par Diako.",
  },
  place: {
    label: "Lieu vérifié",
    icone: BadgeCheck,
    classe: "bg-primary/12 text-primary",
    aide: "La position a été confirmée sur le terrain.",
  },
  phone: {
    label: "Téléphone vérifié",
    icone: Phone,
    classe: "bg-primary/12 text-primary",
    aide: "Le numéro a répondu à un code de vérification.",
  },
  partner: {
    label: "Partenaire Diako",
    icone: ShieldCheck,
    classe: "bg-primary text-primary-foreground",
    aide: "Établissement partenaire.",
  },
  none: {
    label: "Non vérifié",
    icone: null,
    classe: "bg-secondary text-muted-foreground",
    aide: "Fiche créée sans contrôle. Vous êtes le gérant ? Réclamez-la.",
  },
} as const;

export type NiveauVerification = keyof typeof NIVEAUX;

export function BadgeVerification({
  niveau,
  className,
}: {
  niveau: NiveauVerification | string | null;
  className?: string;
}) {
  const n = (niveau && niveau in NIVEAUX ? niveau : "none") as NiveauVerification;
  const { label, icone: Icone, classe, aide } = NIVEAUX[n];
  return (
    <span
      title={aide}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        classe,
        className
      )}
    >
      {Icone && <Icone className="h-3 w-3" aria-hidden="true" />}
      {label}
    </span>
  );
}

/** « Sponsorisé » — la maquette l'exige visible, et jamais en première place. */
export function BadgeSponsorise({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent-strong",
        className
      )}
    >
      Sponsorisé
    </span>
  );
}

/**
 * L'état d'ouverture.
 *
 * ⚠ « Ferme dans 40 min » est l'information qui change une décision — pas
 *   « ouvert ». Quelqu'un qui cherche où dîner à 20 h 40 doit le savoir AVANT
 *   de prendre un taxi. Le calcul se fait à l'heure de Madagascar (UTC+3),
 *   jamais à celle du navigateur : un membre de la diaspora qui prépare un
 *   voyage verrait sinon tout fermé.
 */
export type EtatOuverture =
  | { etat: "ouvert"; fermeDansMin?: number }
  | { etat: "ferme"; ouvreA?: string }
  | { etat: "inconnu" };

export function BadgeOuverture({ v, className }: { v: EtatOuverture; className?: string }) {
  if (v.etat === "inconnu") return null;

  if (v.etat === "ouvert") {
    const bientot = v.fermeDansMin != null && v.fermeDansMin <= 60;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
          bientot ? "bg-accent/15 text-accent-strong" : "bg-primary/12 text-primary",
          className
        )}
      >
        <span
          className={cn("h-1.5 w-1.5 rounded-full", bientot ? "bg-accent" : "bg-primary")}
          aria-hidden="true"
        />
        {bientot ? `Ferme dans ${v.fermeDansMin} min` : "Ouvert maintenant"}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground",
        className
      )}
    >
      Fermé{v.ouvreA ? ` · ouvre à ${v.ouvreA}` : ""}
    </span>
  );
}

/** Tarifs à confirmer — le signal de fraîcheur, en pastille. */
export function BadgeTarifsAConfirmer({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent-strong",
        className
      )}
    >
      Tarifs à confirmer
    </span>
  );
}

/**
 * Calcule l'état d'ouverture à l'heure de Madagascar.
 * `horaires` : lignes { weekday 0-6, opens_at 'HH:MM', closes_at 'HH:MM' }.
 */
export function etatOuverture(
  horaires: { weekday: number; opens_at: string; closes_at: string }[]
): EtatOuverture {
  if (!horaires.length) return { etat: "inconnu" };

  // UTC+3 en dur : Madagascar n'a pas d'heure d'été, et se fier au fuseau du
  // navigateur donnerait une réponse fausse à qui prépare son voyage de loin.
  const ici = new Date(Date.now() + 3 * 3600_000);
  const jour = ici.getUTCDay();
  const min = ici.getUTCHours() * 60 + ici.getUTCMinutes();
  const enMin = (h: string) => {
    const [a, b] = h.split(":").map(Number);
    return a * 60 + (b || 0);
  };

  for (const h of horaires.filter((x) => x.weekday === jour)) {
    const o = enMin(h.opens_at);
    let f = enMin(h.closes_at);
    if (f <= o) f += 1440; // service qui passe minuit
    if (min >= o && min < f) return { etat: "ouvert", fermeDansMin: f - min };
  }

  const suivant = horaires
    .filter((x) => x.weekday === jour && enMin(x.opens_at) > min)
    .sort((a, b) => enMin(a.opens_at) - enMin(b.opens_at))[0];
  return { etat: "ferme", ouvreA: suivant?.opens_at.slice(0, 5) };
}
