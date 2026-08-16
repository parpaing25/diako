/**
 * Onglet « Codes promo ».
 *
 * ⚠ CE QU'UN CODE EST ICI. Diako met en relation : « Demander », jamais
 *   « Réserver » ni « Payer ». Il n'y a ni panier, ni paiement. Un code n'est
 *   donc pas un moyen de paiement — c'est un avantage qu'un partenaire accorde
 *   et que le voyageur MENTIONNE sur place. `avantage` est un texte saisi à la
 *   main (« −10 % sur la nuitée ») et non un nombre : rien dans ce dépôt ne
 *   sait calculer une remise, et un pourcentage stocké laisserait croire le
 *   contraire.
 *
 * 🔴 LES UTILISATIONS NE SONT PAS COMPTÉES, ET L'ÉCRAN LE DIT. Aucun parcours
 *    ne consomme un code : une colonne `usage_count` ne serait alimentée par
 *    rien. 0092 a passé une migration entière à réparer deux compteurs affichés
 *    que rien n'alimentait ; en poser un troisième serait un défaut connu créé
 *    volontairement.
 */

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Ticket, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { EtatVide, EtatErreur } from "@/components/Etats";
import {
  dateCourte,
  enregistrerPromo,
  messageErreur,
  promosAdmin,
  supprimerPromo,
  type CodePromo,
} from "@/lib/admin";
import {
  BTN_DANGER,
  BTN_PRIMAIRE,
  BTN_SECONDAIRE,
  CHAMP,
  ETIQUETTE,
  Carte,
  Note,
  Pastille,
  Squelette,
} from "./Communs";

interface Brouillon {
  id: string | null;
  code: string;
  libelle: string;
  detail: string;
  avantage: string;
  debut: string;
  fin: string;
  actif: boolean;
}

const VIDE: Brouillon = {
  id: null,
  code: "",
  libelle: "",
  detail: "",
  avantage: "",
  debut: "",
  fin: "",
  actif: true,
};

function depuis(c: CodePromo): Brouillon {
  return {
    id: c.id,
    code: c.code,
    libelle: c.libelle,
    detail: c.detail ?? "",
    avantage: c.avantage ?? "",
    debut: c.debut ?? "",
    fin: c.fin ?? "",
    actif: c.actif,
  };
}

/** Un code est périmé si sa date de fin est passée — dit, pas deviné. */
function perime(c: CodePromo): boolean {
  if (!c.fin) return false;
  return new Date(c.fin) < new Date(new Date().toDateString());
}

export default function Promos() {
  const [lignes, setLignes] = useState<CodePromo[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(false);
    try {
      setLignes(await promosAdmin());
    } catch (e) {
      setErreur(true);
      toast.error(messageErreur(e, "Les codes n'ont pas pu être chargés."));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const enregistrer = useCallback(async () => {
    if (!brouillon) return;
    if (brouillon.code.trim().length < 3) {
      toast.error("Le code doit faire au moins 3 caractères.");
      return;
    }
    if (brouillon.libelle.trim().length < 3) {
      toast.error("Le libellé est obligatoire.");
      return;
    }
    setEnvoi(true);
    try {
      await enregistrerPromo({
        id: brouillon.id,
        code: brouillon.code,
        libelle: brouillon.libelle,
        detail: brouillon.detail || null,
        avantage: brouillon.avantage || null,
        // ⚠ CHAÎNE VIDE ≠ ABSENCE. Un `""` envoyé à une colonne `date` part en
        //   erreur PostgREST ; `null` dit « pas de date », ce qui est le cas.
        debut: brouillon.debut || null,
        fin: brouillon.fin || null,
        actif: brouillon.actif,
      });
      toast.success(brouillon.id ? "Code mis à jour." : "Code créé.");
      setBrouillon(null);
      await charger();
    } catch (e) {
      toast.error(messageErreur(e, "L'enregistrement a échoué."));
    } finally {
      setEnvoi(false);
    }
  }, [brouillon, charger]);

  const supprimer = useCallback(
    async (c: CodePromo) => {
      if (!window.confirm(`Supprimer définitivement le code « ${c.code} » ?`)) return;
      try {
        await supprimerPromo(c.id);
        setLignes((v) => v.filter((l) => l.id !== c.id));
        toast.success("Code supprimé.");
      } catch (e) {
        toast.error(messageErreur(e, "La suppression a échoué."));
      }
    },
    []
  );

  return (
    <div className="space-y-4">
      {brouillon ? (
        <Carte>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold">
              {brouillon.id ? "Modifier le code" : "Nouveau code promo"}
            </h3>
            <button
              type="button"
              onClick={() => setBrouillon(null)}
              aria-label="Fermer"
              className="dk-tap grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void enregistrer();
            }}
          >
            <div>
              <label className={ETIQUETTE} htmlFor="promo-code">
                Code
              </label>
              <input
                id="promo-code"
                className={CHAMP}
                value={brouillon.code}
                onChange={(e) => setBrouillon({ ...brouillon, code: e.target.value })}
                placeholder="ETE2026"
              />
              <p className="dk-secondaire mt-1">
                Enregistré en majuscules. Deux codes ne peuvent pas se ressembler à la casse
                près.
              </p>
            </div>

            <div>
              <label className={ETIQUETTE} htmlFor="promo-libelle">
                Libellé
              </label>
              <input
                id="promo-libelle"
                className={CHAMP}
                value={brouillon.libelle}
                onChange={(e) => setBrouillon({ ...brouillon, libelle: e.target.value })}
                placeholder="Offre de lancement"
              />
            </div>

            <div>
              <label className={ETIQUETTE} htmlFor="promo-avantage">
                Avantage (facultatif)
              </label>
              <input
                id="promo-avantage"
                className={CHAMP}
                value={brouillon.avantage}
                onChange={(e) => setBrouillon({ ...brouillon, avantage: e.target.value })}
                placeholder="−10 % sur la nuitée"
              />
              <p className="dk-secondaire mt-1">
                Texte libre, affiché tel quel. Diako ne calcule aucune remise et n'encaisse
                rien : le code se mentionne sur place.
              </p>
            </div>

            <div>
              <label className={ETIQUETTE} htmlFor="promo-detail">
                Conditions (facultatif)
              </label>
              <textarea
                id="promo-detail"
                rows={3}
                className="w-full rounded-xl border border-input bg-background p-3 text-base outline-none focus:ring-2 focus:ring-ring"
                value={brouillon.detail}
                onChange={(e) => setBrouillon({ ...brouillon, detail: e.target.value })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={ETIQUETTE} htmlFor="promo-debut">
                  Début (facultatif)
                </label>
                <input
                  id="promo-debut"
                  type="date"
                  className={CHAMP}
                  value={brouillon.debut}
                  onChange={(e) => setBrouillon({ ...brouillon, debut: e.target.value })}
                />
              </div>
              <div>
                <label className={ETIQUETTE} htmlFor="promo-fin">
                  Fin (facultatif)
                </label>
                <input
                  id="promo-fin"
                  type="date"
                  className={CHAMP}
                  value={brouillon.fin}
                  onChange={(e) => setBrouillon({ ...brouillon, fin: e.target.value })}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-input"
                checked={brouillon.actif}
                onChange={(e) => setBrouillon({ ...brouillon, actif: e.target.checked })}
              />
              Code actif
            </label>

            <button type="submit" disabled={envoi} className={`${BTN_PRIMAIRE} w-full`}>
              {envoi ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        </Carte>
      ) : (
        <button type="button" onClick={() => setBrouillon({ ...VIDE })} className={BTN_PRIMAIRE}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouveau code
        </button>
      )}

      <Note>
        Les utilisations ne sont pas comptées : aucun écran de Diako ne consomme un code, un
        compteur n'aurait donc rien à compter. Il viendra le jour où un parcours de
        validation existera.
      </Note>

      {chargement ? (
        <Squelette nombre={3} hauteur="h-24" />
      ) : erreur ? (
        <EtatErreur
          titre="Les codes n'ont pas pu être chargés"
          texte="Rien n'est perdu. Réessayez, la connexion est peut-être passée en 2G."
          onReessayer={() => void charger()}
        />
      ) : lignes.length === 0 ? (
        <EtatVide
          icone={Ticket}
          titre="Aucun code promo"
          texte="Créez-en un pour une offre de lancement ou un partenariat."
        />
      ) : (
        <ul className="space-y-3">
          {lignes.map((c) => (
            <li key={c.id}>
              <Carte>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-secondary px-2.5 py-1 font-mono text-sm font-semibold">
                    {c.code}
                  </span>
                  {c.actif ? (
                    <Pastille ton="primaire">Actif</Pastille>
                  ) : (
                    <Pastille ton="neutre">Inactif</Pastille>
                  )}
                  {perime(c) ? <Pastille ton="alerte">Période terminée</Pastille> : null}
                </div>

                <p className="mt-2 font-medium">{c.libelle}</p>
                {c.avantage ? <p className="text-sm">{c.avantage}</p> : null}
                {c.detail ? (
                  <p className="dk-secondaire mt-1 whitespace-pre-line">{c.detail}</p>
                ) : null}

                <p className="dk-secondaire mt-1">
                  {c.debut || c.fin
                    ? `Du ${c.debut ? dateCourte(c.debut) : "…"} au ${c.fin ? dateCourte(c.fin) : "…"}`
                    : "Sans date de fin"}
                  {c.page_nom ? ` · ${c.page_nom}` : ""}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setBrouillon(depuis(c))}
                    className={BTN_SECONDAIRE}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => void supprimer(c)}
                    className={BTN_DANGER}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Supprimer
                  </button>
                </div>
              </Carte>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
