/**
 * Onglet « Publications » — autoriser, masquer, retirer.
 *
 * 🔴 CE QUE CET ÉCRAN DÉBLOQUE. `masquer_si_signale()` cache une publication au
 *    3ᵉ signalement distinct, et la policy `reports_admin` réserve la lecture
 *    des signalements à `is_staff()`. Aucun compte ne portait ce rôle : la file
 *    se remplissait et personne ne pouvait la lire. Une publication masquée à
 *    tort le restait pour toujours.
 *
 * ⚠ « AUTORISER » REJETTE LES SIGNALEMENTS, dans la même transaction. Les
 *   laisser ouverts remettrait la publication dans la file au prochain
 *   chargement et `masquer_si_signale()` la re-masquerait — l'écran défaisant
 *   ce que l'écran vient de faire.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Flag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EtatVide, EtatErreur } from "@/components/Etats";
import { getThumbUrl } from "@/lib/imageThumb";
import {
  curseurSuivant,
  dateCourte,
  messageErreur,
  modererPublication,
  nombre,
  publicationsAdmin,
  type ActionPublication,
  type Curseur,
  type FiltrePublications,
  type PublicationAdmin,
} from "@/lib/admin";
import { BTN_DANGER, BTN_SECONDAIRE, Carte, Filtres, Note, Pastille, Squelette, BoutonSuite } from "./Communs";

const PAR_PAGE = 30;

const FILTRES: { cle: FiltrePublications; label: string }[] = [
  { cle: "signalees", label: "À relire" },
  { cle: "masquees", label: "Masquées" },
  { cle: "retirees", label: "Retirées" },
  { cle: "toutes", label: "Toutes" },
];

/**
 * ⚠ `media` ARRIVE EN `jsonb`, DONC EN `unknown`. On le convertit champ par
 *   champ au lieu de le caster : une publication dont le média a une forme
 *   inattendue doit s'afficher sans vignette, pas faire tomber l'écran.
 */
function premiereImage(media: unknown): string | null {
  if (!Array.isArray(media) || media.length === 0) return null;
  const p = media[0];
  if (typeof p !== "object" || p === null) return null;
  const url = (p as { url?: unknown }).url;
  return typeof url === "string" && url ? url : null;
}

function etatLisible(status: string): { texte: string; ton: "neutre" | "primaire" | "alerte" } {
  if (status === "published") return { texte: "En ligne", ton: "primaire" };
  if (status === "hidden") return { texte: "Masquée", ton: "alerte" };
  return { texte: "Retirée", ton: "neutre" };
}

export default function Publications() {
  const [filtre, setFiltre] = useState<FiltrePublications>("signalees");
  const [lignes, setLignes] = useState<PublicationAdmin[]>([]);
  const [curseur, setCurseur] = useState<Curseur | null>(null);
  const [chargement, setChargement] = useState(true);
  const [suite, setSuite] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async (f: FiltrePublications) => {
    setChargement(true);
    setErreur(false);
    try {
      const lot = await publicationsAdmin(f, null, PAR_PAGE);
      setLignes(lot);
      setCurseur(curseurSuivant(lot, PAR_PAGE));
    } catch (e) {
      setErreur(true);
      toast.error(messageErreur(e, "La file n'a pas pu être chargée."));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger(filtre);
  }, [charger, filtre]);

  const chargerSuite = useCallback(async () => {
    if (!curseur) return;
    setSuite(true);
    try {
      const lot = await publicationsAdmin(filtre, curseur, PAR_PAGE);
      setLignes((v) => [...v, ...lot]);
      setCurseur(curseurSuivant(lot, PAR_PAGE));
    } catch (e) {
      toast.error(messageErreur(e, "La suite n'a pas pu être chargée."));
    } finally {
      setSuite(false);
    }
  }, [curseur, filtre]);

  const agir = useCallback(
    async (ligne: PublicationAdmin, action: ActionPublication) => {
      let motif: string | undefined;
      if (action !== "autoriser") {
        // ⚠ LE MOTIF PART EN NOTIFICATION À L'AUTEUR. Un masquage muet se lit
        //   comme une panne, et la personne republie la même chose.
        const saisi = window.prompt(
          action === "masquer"
            ? "Pourquoi cette publication est-elle masquée ? (l'auteur le lira)"
            : "Pourquoi cette publication est-elle retirée ? (l'auteur le lira)",
          ""
        );
        if (saisi === null) return;
        motif = saisi.trim().slice(0, 500) || undefined;
      }

      setEnCours(ligne.id);
      try {
        const statut = await modererPublication(ligne.id, action, motif);
        // ⚠ ON MET LA LIGNE À JOUR SUR PLACE au lieu de tout recharger : sur la
        //   file « À relire », un rechargement ferait disparaître la ligne sous
        //   le doigt et la décision suivante viserait une autre publication.
        setLignes((v) =>
          v.map((l) =>
            l.id === ligne.id
              ? { ...l, status: statut, nb_signalements: 0, motifs: [] }
              : l
          )
        );
        toast.success(
          action === "autoriser"
            ? "Publication autorisée."
            : action === "masquer"
              ? "Publication masquée."
              : "Publication retirée."
        );
      } catch (e) {
        toast.error(messageErreur(e, "L'action n'a pas abouti."));
      } finally {
        setEnCours(null);
      }
    },
    []
  );

  return (
    <div className="space-y-4">
      <Filtres valeur={filtre} options={FILTRES} onChange={setFiltre} />

      <Note>
        Une publication est masquée automatiquement au 3ᵉ signalement de personnes
        différentes. « Autoriser » la remet en ligne et solde ses signalements ; sans quoi
        elle serait re-masquée à la relecture suivante.
      </Note>

      {chargement ? (
        <Squelette nombre={4} hauteur="h-28" />
      ) : erreur ? (
        <EtatErreur
          titre="La file n'a pas pu être chargée"
          texte="Rien n'est perdu. Réessayez, la connexion est peut-être passée en 2G."
          onReessayer={() => void charger(filtre)}
        />
      ) : lignes.length === 0 ? (
        <EtatVide
          icone={Flag}
          titre={filtre === "signalees" ? "Rien à relire" : "Aucune publication ici"}
          texte={
            filtre === "signalees"
              ? "Aucune publication signalée ni masquée en attente. C'est le bon état."
              : "Changez de filtre pour voir les autres publications."
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {lignes.map((l) => {
              const etat = etatLisible(l.status);
              const vignette = premiereImage(l.media);
              const occupe = enCours === l.id;
              return (
                <li key={l.id}>
                  <Carte>
                    <div className="flex gap-3">
                      {vignette ? (
                        <img
                          src={getThumbUrl(vignette)}
                          alt=""
                          width={72}
                          height={72}
                          loading="lazy"
                          className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover"
                        />
                      ) : null}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pastille ton={etat.ton}>{etat.texte}</Pastille>
                          {l.nb_signalements > 0 ? (
                            <Pastille ton="alerte">
                              {nombre(l.nb_signalements)} signalement
                              {l.nb_signalements > 1 ? "s" : ""}
                            </Pastille>
                          ) : null}
                          <span className="dk-secondaire">{dateCourte(l.created_at)}</span>
                        </div>

                        <p className="mt-1.5 text-sm">
                          <Link
                            to={`/user/${l.auteur_id}`}
                            className="font-medium hover:underline"
                          >
                            {l.auteur_nom ?? "Membre"}
                          </Link>
                        </p>

                        {/* ⚠ 180 CARACTÈRES, comme partout ailleurs : `posts`
                            n'a pas de titre, la moyenne mesurée est de 1 494
                            caractères. Tout afficher noierait la file. */}
                        {l.body ? (
                          <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                            {l.body.slice(0, 180)}
                            {l.body.length > 180 ? "…" : ""}
                          </p>
                        ) : (
                          <p className="dk-secondaire mt-1">Publication sans texte.</p>
                        )}

                        {l.motifs.length > 0 ? (
                          <p className="dk-secondaire mt-1.5">
                            Motifs : {l.motifs.join(" · ")}
                          </p>
                        ) : null}

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link to={`/post/${l.id}`} className={BTN_SECONDAIRE}>
                            Voir
                          </Link>
                          {l.status !== "published" ? (
                            <button
                              type="button"
                              disabled={occupe}
                              onClick={() => void agir(l, "autoriser")}
                              className={BTN_SECONDAIRE}
                            >
                              <Eye className="h-4 w-4" aria-hidden="true" />
                              Autoriser
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={occupe}
                              onClick={() => void agir(l, "masquer")}
                              className={BTN_SECONDAIRE}
                            >
                              <EyeOff className="h-4 w-4" aria-hidden="true" />
                              Masquer
                            </button>
                          )}
                          {l.status !== "removed" ? (
                            <button
                              type="button"
                              disabled={occupe}
                              onClick={() => void agir(l, "retirer")}
                              className={BTN_DANGER}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              Retirer
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </Carte>
                </li>
              );
            })}
          </ul>

          {curseur ? <BoutonSuite onClick={() => void chargerSuite()} chargement={suite} /> : null}
        </>
      )}
    </div>
  );
}
