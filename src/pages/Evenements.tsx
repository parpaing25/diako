import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Compass, RefreshCw } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EmptyState, EtatErreur } from "@/components/Etats";
import { ImageProgressive } from "@/components/ImageProgressive";
import { Prix } from "@/components/Prix";
import { chargerEvenements, type Evenement } from "@/lib/decouverte";

/**
 * LES ÉVÉNEMENTS — /evenements (design final §4).
 *
 * ⚠ LES PHÉNOMÈNES NATURELS SONT DES ÉVÉNEMENTS ANNUELS. Les baleines à
 *   Sainte-Marie, les litchis à Toamasina, les jacarandas d'Antananarivo
 *   reviennent chaque année aux mêmes semaines. Les saisir comme des dates
 *   uniques les ferait disparaître le 1er janvier suivant — d'où le drapeau
 *   `yearly`, affiché en clair pour que le lecteur sache que la date se répète.
 */

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function periode(debut: string, fin: string | null, annuel: boolean) {
  const d = new Date(debut);
  const jour = `${d.getDate()} ${MOIS[d.getMonth()]}`;
  if (!fin) return annuel ? `chaque année vers le ${jour}` : `${jour} ${d.getFullYear()}`;
  const f = new Date(fin);
  const finTexte = `${f.getDate()} ${MOIS[f.getMonth()]}`;
  return annuel ? `chaque année, ${jour} → ${finTexte}` : `${jour} → ${finTexte} ${f.getFullYear()}`;
}

export default function Evenements() {
  useSEO({
    titre: "Événements à Madagascar — fêtes, saisons et phénomènes naturels",
    description:
      "Le calendrier malgache : fêtes, festivals, et les rendez-vous de la nature — baleines, litchis, jacarandas — avec leurs dates et leurs lieux.",
    url: "https://diako.fonenako.mg/evenements",
  });

  const [evts, setEvts] = useState<Evenement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  useReveal(evts.length);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(false);
    try {
      setEvts(await chargerEvenements(24));
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
      <p className="dk-etiquette">Le calendrier</p>
      <h1 className="dk-titre mt-1">Événements</h1>
      <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
        Les fêtes, les festivals, et les rendez-vous que donne la nature —
        baleines, litchis, jacarandas. Ceux-là reviennent chaque année.
      </p>

      {erreur && <EtatErreur className="mt-5" onReessayer={() => void charger()} />}

      {chargement && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 large:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="dk-skeleton h-48 rounded-2xl" />
          ))}
        </ul>
      )}

      {!chargement && evts.length > 0 && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 large:grid-cols-3">
          {evts.map((e) => (
            <li key={e.id}>
              <article className="dk-reveal dk-carte overflow-hidden rounded-2xl border border-border bg-card">
                {e.poster_url && (
                  <div className="dk-zoom aspect-[16/9] bg-secondary">
                    <ImageProgressive src={e.poster_url} alt={e.title} ajustement="cover" />
                  </div>
                )}
                <div className="p-4">
                  <p className="dk-etiquette inline-flex items-center gap-1.5">
                    {e.yearly && <RefreshCw className="h-3 w-3" aria-hidden="true" />}
                    {periode(e.starts_on, e.ends_on, e.yearly)}
                  </p>
                  <h2 className="mt-1 text-[17px] font-bold leading-tight">{e.title}</h2>
                  {e.place && <p className="dk-secondaire mt-0.5">{e.place.name_fr}</p>}
                  {e.summary && (
                    <p className="dk-corps mt-2 line-clamp-3 text-muted-foreground">{e.summary}</p>
                  )}
                  {e.price_ar != null && (
                    <Prix montant={e.price_ar} base={e.price_unit} taille="compacte" className="mt-3" />
                  )}
                  {e.organizer && (
                    <p className="dk-secondaire mt-2">Organisé par {e.organizer}</p>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {!chargement && evts.length === 0 && !erreur && (
        <EmptyState
          className="mt-5"
          icone={CalendarDays}
          manque="Aucun événement n'est encore inscrit au calendrier."
          action={{ libelle: "Signaler un événement", lien: "/publier" }}
          contenuReel={
            <>
              <p className="dk-secondaire leading-relaxed">
                Le calendrier se remplira des fêtes locales et des saisons
                naturelles. En attendant, cinq destinations portent déjà leur
                saisonnalité mois par mois — quand y aller, et pourquoi.
              </p>
              <Link
                to="/explorer"
                className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold"
              >
                <Compass className="h-4 w-4" aria-hidden="true" />
                Voir les destinations
              </Link>
            </>
          }
        />
      )}
    </div>
  );
}
