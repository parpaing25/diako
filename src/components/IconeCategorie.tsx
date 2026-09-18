import { BedDouble, Car, Compass, Store, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { familleDe, type FamilleEtablissement } from "@/lib/etablissements";

const ICONE: Record<FamilleEtablissement, LucideIcon> = {
  hebergement: BedDouble,
  table: UtensilsCrossed,
  agence: Compass,
  vehicule: Car,
  autre: Store,
};

/**
 * L'icône de la famille d'un établissement — hôtel, table, agence, véhicule.
 *
 * ⭐ POURQUOI. 94 % des fiches n'ont pas de photo (3 219 sur 3 412 le
 *   18/09/2026). Sans image, rien ne disait si l'on regardait un hôtel ou un
 *   restaurant : le nom seul, répété sur un aplat. Le médaillon le dit d'un
 *   coup d'œil, sans rien prétendre montrer de l'endroit.
 *
 * ⚠ DÉCORATIVE : le libellé de la catégorie est toujours écrit à côté, en
 *   texte. L'icône ne porte aucune information qu'un lecteur d'écran
 *   n'entendrait pas autrement.
 */
export function IconeCategorie({
  categories,
  className,
}: {
  categories: string[] | null | undefined;
  className?: string;
}) {
  const Icone = ICONE[familleDe(categories)];
  return <Icone className={className} aria-hidden="true" />;
}
