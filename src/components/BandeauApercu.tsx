import { Eye } from "lucide-react";

/**
 * Bandeau obligatoire sur tout écran affichant des données d'aperçu.
 *
 * Sans lui, Diako referait l'erreur de sa version précédente : une colonne
 * « Hôtel Sakamanga · 4.8 · 245 avis » entièrement inventée, que rien ne
 * distinguait d'une vraie fiche. Ici, le visiteur sait ce qu'il regarde.
 */
export function BandeauApercu({ quoi }: { quoi: string }) {
  return (
    <div
      role="note"
      className="mb-4 flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-2.5"
    >
      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      <p className="text-[13px] leading-snug text-foreground/80">
        <strong className="font-semibold text-foreground">Aperçu du design.</strong>{" "}
        {quoi} Rien ici n'est encore réel : aucun établissement n'est référencé
        et aucun tarif n'est vérifié.
      </p>
    </div>
  );
}
