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

/**
 * QUAND A LIEU CET ÉVÉNEMENT — en ne disant que ce qu'on sait.
 *
 * 🔴 CETTE FONCTION FABRIQUAIT UNE DATE SUR 42 CARTES SUR 42. Elle recevait
 *    `starts_on`, nul sur la totalité des événements publiés ; `new Date(null)`
 *    rend l'époque Unix, d'où « chaque année vers le 1 janvier » partout, et
 *    « 1 JANVIER 1970 » sur les deux fiches non annuelles. Le propriétaire l'a
 *    vu sur sa capture avant nous.
 *
 * ⚠ LA VRAIE MATIÈRE ÉTAIT LÀ, ET N'ÉTAIT MÊME PAS SÉLECTIONNÉE : la colonne
 *   `periode` porte la phrase d'une source — « Début août, jour variable selon
 *   la lune » — et `mois` porte les mois concernés. La migration 0079 les avait
 *   posées précisément pour ne pas inventer de date exacte ; l'écran, lui, a
 *   continué de lire `starts_on`.
 *
 * ⚠ ORDRE DE PRÉFÉRENCE, du plus précis au plus prudent : une vraie date si
 *   elle existe un jour, sinon la phrase de la source, sinon les mois, sinon
 *   RIEN. Une carte sans mention de date est honnête ; une carte qui annonce le
 *   1er janvier envoie quelqu'un au mauvais moment de l'année.
 */
function periode(e: {
  starts_on: string | null;
  ends_on: string | null;
  yearly: boolean;
  periode: string | null;
  mois: number[] | null;
}): string | null {
  if (e.starts_on) {
    const d = new Date(e.starts_on);
    const jour = `${d.getDate()} ${MOIS[d.getMonth()]}`;
    if (!e.ends_on) return e.yearly ? `chaque année vers le ${jour}` : `${jour} ${d.getFullYear()}`;
    const f = new Date(e.ends_on);
    const finTexte = `${f.getDate()} ${MOIS[f.getMonth()]}`;
    return e.yearly ? `chaque année, ${jour} → ${finTexte}` : `${jour} → ${finTexte} ${f.getFullYear()}`;
  }

  if (e.periode?.trim()) return e.periode.trim();

  const m = (e.mois ?? []).filter((n) => n >= 1 && n <= 12).sort((a, b) => a - b);
  if (!m.length) return null;
  if (m.length === 1) return `en ${MOIS[m[0] - 1]}`;
  // ⚠ Deux mois qui se suivent se lisent « de … à … » ; une série éclatée se
  //   liste, sinon « de janvier à décembre » mentirait sur une saison en deux
  //   temps.
  const continu = m.every((v, i) => i === 0 || v === m[i - 1] + 1);
  return continu
    ? `de ${MOIS[m[0] - 1]} à ${MOIS[m[m.length - 1] - 1]}`
    : m.map((n) => MOIS[n - 1]).join(", ");
}

/** Le mois en cours, pour remonter ce qui se passe MAINTENANT. */
const MOIS_COURANT = new Date().getMonth() + 1;

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
  useReveal(evts);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(false);
    try {
      // ⚠ ON CHARGE LES 42, PAS 24 : le tri par mois ne peut pas remonter
      //   « ce qui se passe en août » s'il ne voit qu'une tranche arbitraire.
      const recus = await chargerEvenements(200);
      /**
       * ⚠ CE QUI SE PASSE MAINTENANT D'ABORD. Le tri d'origine portait sur
       *   `starts_on`, nul sur les 42 : il n'ordonnait donc RIEN, et l'ordre
       *   dépendait du plan d'exécution. On classe par distance au mois
       *   courant, en repassant par janvier — un événement de septembre
       *   intéresse plus en août qu'un événement de mars.
       */
      const distance = (e: Evenement) => {
        const m = (e.mois ?? []).filter((n) => n >= 1 && n <= 12);
        if (!m.length) return 99;
        return Math.min(...m.map((n) => (n - MOIS_COURANT + 12) % 12));
      };
      setEvts(
        [...recus].sort((a, b) => distance(a) - distance(b) || a.title.localeCompare(b.title, "fr"))
      );
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
                    <ImageProgressive src={e.poster_url} alt={e.title} ajustement="cover"
              largeurAffichee={"(min-width:1280px) 30vw, (min-width:640px) 45vw, 92vw"}
            />
                  </div>
                )}
                <div className="p-4">
                  {/* ⚠ L'ÉTIQUETTE DISPARAÎT QUAND ON NE SAIT PAS. Elle affichait
                      « chaque année vers le 1 janvier » sur toutes les cartes,
                      faute de date en base — une mention absente vaut mieux
                      qu'une date fausse, qui envoie quelqu'un au mauvais moment
                      de l'année. */}
                  {(() => {
                    const quand = periode(e);
                    return quand ? (
                      <p className="dk-etiquette inline-flex items-center gap-1.5">
                        {e.yearly && <RefreshCw className="h-3 w-3" aria-hidden="true" />}
                        {quand}
                      </p>
                    ) : null;
                  })()}
                  <h2 className="mt-1 text-[17px] font-bold leading-tight">{e.title}</h2>
                  {(e.place || e.lieu_libre) && (
                    <p className="dk-secondaire mt-0.5">{e.place?.name_fr ?? e.lieu_libre}</p>
                  )}
                  {(e.summary || e.description) && (
                    <p className="dk-corps mt-2 line-clamp-3 text-muted-foreground">
                      {e.summary ?? e.description}
                    </p>
                  )}
                  {e.price_ar != null && (
                    <Prix montant={e.price_ar} base={e.price_unit} taille="compacte" className="mt-3" />
                  )}
                  {e.organizer && (
                    <p className="dk-secondaire mt-2">Organisé par {e.organizer}</p>
                  )}
                  {/* ⚠ LA SOURCE EST CLIQUABLE. Migration 0079 : un événement
                      sans source ne se présente pas comme un fait établi, et
                      celui qui en a une doit pouvoir être vérifié. */}
                  {e.source && (
                    <a
                      href={e.source}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="dk-secondaire mt-2 inline-block text-primary underline underline-offset-4"
                    >
                      source
                    </a>
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
