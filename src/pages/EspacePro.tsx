import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Eye, Plus, Star, Store } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AssistantEtablissement } from "@/components/AssistantEtablissement";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  ariary,
  CATEGORIES,
  mesEtablissements,
  unite,
} from "@/lib/etablissements";
import { cn } from "@/lib/utils";

type MonEtab = Awaited<ReturnType<typeof mesEtablissements>>[number];

/**
 * L'espace professionnel.
 *
 * ⚠ CE QUI A CHANGÉ. Cet écran affichait six « outils » — Ma page, Mes
 *   chambres, Ma carte, Mes demandes, Mes avis, Mes statistiques — qui étaient
 *   un tableau littéral dont chaque bouton déclenchait un toast « Bientôt
 *   disponible », plus quatre indicateurs figés à « — ». Il n'existait aucun
 *   back-office, et cocher « Professionnel » à l'inscription n'avait d'autre
 *   effet qu'un badge sur le profil public.
 *
 *   Ici, un gérant crée réellement sa fiche et la gère. La création passe par un
 *   ASSISTANT en étapes qui garde un brouillon : le formulaire d'un seul tenant
 *   faisait tout perdre à qui s'arrêtait au milieu. Seules trois informations
 *   sont exigées — nom, activité, lieu ; le reste se complète ensuite, et la
 *   barre de complétude dit ce qui manque.
 */
export default function EspacePro() {
  const { user } = useAuth();
  useDocumentTitle("Espace professionnel");

  const [etabs, setEtabs] = useState<MonEtab[]>([]);
  const [chargement, setChargement] = useState(true);
  const [formOuvert, setFormOuvert] = useState(false);

  const charger = useCallback(async () => {
    if (!user) {
      setChargement(false);
      return;
    }
    try {
      setEtabs(await mesEtablissements());
    } catch {
      toast.error("Vos établissements n'ont pas pu être chargés.");
    } finally {
      setChargement(false);
    }
  }, [user]);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
          <Store className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-semibold">Espace professionnel</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Hôtel, restaurant, agence de voyage ou guide : créez votre compte pour
          publier votre fiche, vos tarifs et votre carte.
        </p>
        <Link
          to="/auth"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Espace professionnel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vos établissements, leurs tarifs et leur carte.
          </p>
        </div>
        {!formOuvert && etabs.length > 0 && (
          <button
            onClick={() => setFormOuvert(true)}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter
          </button>
        )}
      </div>

      {chargement && <div className="dk-skeleton mt-5 h-28 rounded-2xl" />}

      {/* Gabarit G1 : les fiches d'un gérant se comparent en colonnes, pas en
          pile. Un hôtelier qui tient trois pages doit voir les trois d'un coup
          pour repérer celle qui n'est pas à jour.
          ⚠ Le commentaire est ICI et non dans le `&&` : une accolade JSX ne
            peut pas être le premier enfant d'une expression conditionnelle. */}
      {!chargement && etabs.length > 0 && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 large:grid-cols-3">
          {etabs.map((e) => (
            <li key={e.id} className="rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold">{e.name}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.categories
                      .map((c) => CATEGORIES.find((x) => x.code === c)?.label ?? c)
                      .join(" · ")}
                    {!e.is_published && " · non publiée"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    to={`/p/${e.slug}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-input px-3 text-sm"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Voir
                  </Link>
                  <Link
                    to={`/pro/${e.slug}`}
                    className="inline-flex min-h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
                  >
                    Gérer
                  </Link>
                </div>
              </div>

              {/* La complétude dit ce qui manque plutôt que de féliciter, et
                  c'est elle qui classe la fiche dans les résultats. */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Fiche remplie à {e.completeness} %</span>
                  {e.completeness < 100 && <span>Une fiche complète ressort mieux</span>}
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      e.completeness >= 75 ? "bg-primary" : "bg-accent"
                    )}
                    style={{ width: `${e.completeness}%` }}
                  />
                </div>
              </div>

              {/* Des chiffres RÉELS, y compris quand ils valent zéro. */}
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>
                  {e.price_min_ar != null
                    ? `À partir de ${ariary(e.price_min_ar)} ${unite(e.price_min_unit)}`
                    : "Aucun tarif saisi"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" aria-hidden="true" />
                  {e.rating_count > 0 ? `${e.rating_avg} (${e.rating_count} avis)` : "Aucun avis"}
                </span>
                <span>
                  {e.views_count} vue{e.views_count > 1 ? "s" : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ⚠ L'ancien formulaire tenait sur un seul ecran. Un gerant qui
          s'arretait au milieu — parce qu'il cherchait son numero, parce qu'un
          client arrivait — perdait tout. L'assistant garde un brouillon a
          chaque frappe et ne pose qu'une question a la fois. */}
      {!chargement && (formOuvert || etabs.length === 0) && (
        <div className="mt-5">
          <AssistantEtablissement
            onAnnuler={etabs.length > 0 ? () => setFormOuvert(false) : undefined}
          />
        </div>
      )}

    </div>
  );
}
