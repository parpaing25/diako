import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, Mountain } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { compteur, useStats } from "@/hooks/useStats";
import { useReveal } from "@/hooks/useReveal";
import { EmptyState, EtatErreur } from "@/components/Etats";
import { BadgeVerification } from "@/components/Badges";
import { chargerCircuits, type CircuitListe } from "@/lib/decouverte";
import { cn } from "@/lib/utils";

/**
 * LES CIRCUITS — /circuits (écran N1 du design final, vue liste).
 *
 * ⚠ AUCUN CIRCUIT N'EST ENCORE PUBLIÉ. Les tables existent (`tours`,
 *   `tour_prices`, `tour_days`, `tour_inclusions`, et `tour_departures` depuis
 *   la migration 0032) : l'écran est donc BRANCHÉ, pas simulé. Ce qu'on y écrit
 *   se garde. C'est la condition posée par la charte pour ouvrir une entrée de
 *   navigation.
 *
 * ⚠ LE PRIX D'UN CIRCUIT EST TOUJOURS PAR PERSONNE ET PAR PALIER DE GROUPE.
 *   C'est la règle du métier : à six, la voiture et le guide se partagent, donc
 *   le prix par personne baisse. Afficher un prix unique tromperait un couple
 *   comme un groupe de six. Le barème vit dans `tour_prices` et s'affiche sur
 *   la fiche.
 */

const DIFFICULTE: Record<string, string> = {
  facile: "Facile",
  moyen: "Moyen",
  sportif: "Sportif",
  difficile: "Difficile",
};

export default function Circuits() {
  const stats = useStats();
  useSEO({
    titre: "Circuits à Madagascar — itinéraires et agences",
    description:
      "Les circuits proposés par les agences malgaches : durée, axe, difficulté, jour par jour et prix par personne selon la taille du groupe.",
    url: "https://diako.fonenako.mg/circuits",
  });

  const [circuits, setCircuits] = useState<CircuitListe[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  useReveal(circuits);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(false);
    try {
      setCircuits(await chargerCircuits(24));
    } catch {
      setErreur(true);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  return (
    <div className="px-4 py-5">
      <p className="dk-etiquette">Voyager accompagné</p>
      <h1 className="dk-titre mt-1">Circuits</h1>
      <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
        Des itinéraires montés par les agences, avec leur jour par jour, leurs
        temps de route réels et leur prix par personne selon la taille du groupe.
      </p>

      {erreur && <EtatErreur className="mt-5" onReessayer={() => void charger()} />}

      {chargement && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 large:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="dk-skeleton h-40 rounded-2xl" />
          ))}
        </ul>
      )}

      {!chargement && circuits.length > 0 && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 large:grid-cols-3">
          {circuits.map((c) => (
            <li key={c.id}>
              <Link
                to={`/circuit/${c.slug}`}
                className="dk-reveal dk-carte block rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {c.axe && <Puce>{c.axe}</Puce>}
                  <Puce>
                    {c.duration_days} jour{c.duration_days > 1 ? "s" : ""}
                    {c.duration_nights ? ` · ${c.duration_nights} nuits` : ""}
                  </Puce>
                  {c.difficulty && <Puce>{DIFFICULTE[c.difficulty] ?? c.difficulty}</Puce>}
                </div>
                <h2 className="mt-2.5 text-[17px] font-bold leading-tight">{c.title}</h2>
                {c.summary && (
                  <p className="dk-corps mt-1.5 line-clamp-2 text-muted-foreground">{c.summary}</p>
                )}
                {c.page && (
                  <p className="dk-secondaire mt-3 inline-flex items-center gap-1.5">
                    {c.page.name}
                    {c.page.verification_status !== "none" && (
                      <BadgeVerification niveau={c.page.verification_status} />
                    )}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!chargement && circuits.length === 0 && !erreur && (
        <EmptyState
          className="mt-5"
          icone={Mountain}
          manque="Aucune agence n'a encore publié de circuit sur Diako."
          action={{ libelle: "Inscrire mon agence", lien: "/pro" }}
          contenuReel={
            <>
              <p className="dk-secondaire leading-relaxed">
                En attendant, le référentiel porte déjà de quoi préparer un
                itinéraire soi-même : {compteur(stats?.destinations)} destinations,
                avec leurs accès réels depuis Antananarivo — distances, durées de
                route et état des pistes.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/explorer"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold"
                >
                  <Compass className="h-4 w-4" aria-hidden="true" />
                  Explorer les destinations
                </Link>
                <Link
                  to="/carte"
                  className="inline-flex min-h-10 items-center rounded-full border border-input px-4 text-sm font-semibold"
                >
                  Voir la carte
                </Link>
              </div>
            </>
          }
        />
      )}
    </div>
  );
}

function Puce({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
      )}
    >
      {children}
    </span>
  );
}
