/**
 * Onglet « Photos » — la file des propositions, et la pose directe.
 *
 * ⚠ CE QUE « EN ATTENTE » GARANTIT, ET CE QU'IL NE GARANTIT PAS. Une photo
 *   proposée n'est affichée NULLE PART dans le produit tant qu'elle n'est pas
 *   approuvée : aucune requête de Diako ne lit `photo_propositions`, et
 *   l'approbation est la seule écriture qui recopie l'URL sur la fiche visée.
 *   Il n'y a pas de filtre à oublier quelque part, il n'y a rien à filtrer.
 *   En revanche le FICHIER est déjà sur o2switch — comme toute image publique
 *   de ce dépôt, Supabase Storage restant réservé aux pièces d'identité. Il est
 *   donc joignable par qui connaît son URL exacte, mais lié nulle part.
 *
 * 🔴 LE REFUS TENTE D'EFFACER LE FICHIER, SANS POUVOIR LE GARANTIR.
 *    `o2delete.php` n'autorise que les chemins sous le dossier de l'appelant
 *    (`^<dossier>/<jwtUserId>/`, garde anti-IDOR) : l'administration ne peut
 *    donc pas effacer le fichier d'un membre. La photo cesse d'être publiable
 *    dans tous les cas ; le fichier, lui, ne part que si l'administration
 *    refuse sa propre photo. L'écran ne dit rien de plus que ce qui est vrai.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ImagePlus, Images, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EtatVide, EtatErreur } from "@/components/Etats";
import { compressImage } from "@/lib/imageCompression";
import { getThumbUrl } from "@/lib/imageThumb";
import { deleteFromO2Switch, uploadToO2Switch } from "@/lib/o2switchUpload";
import {
  curseurSuivant,
  dateCourte,
  messageErreur,
  photosAdmin,
  poserPhotoAdmin,
  traiterPhoto,
  LIBELLE_CIBLE,
  type CibleType,
  type Curseur,
  type FiltrePhotos,
  type PhotoProposee,
} from "@/lib/admin";
import {
  BTN_DANGER,
  BTN_PRIMAIRE,
  BTN_SECONDAIRE,
  CHAMP,
  ETIQUETTE,
  BoutonSuite,
  Carte,
  Filtres,
  Note,
  Pastille,
  Squelette,
} from "./Communs";

const PAR_PAGE = 30;

const FILTRES: { cle: FiltrePhotos; label: string }[] = [
  { cle: "en_attente", label: "En attente" },
  { cle: "approuvee", label: "Approuvées" },
  { cle: "refusee", label: "Refusées" },
  { cle: "toutes", label: "Toutes" },
];

/* ═══════════════════════════════════════════════════════════════════════════
   Poser une photo directement — « insertion photo »
   ═══════════════════════════════════════════════════════════════════════════ */

interface Fiche {
  id: string;
  nom: string;
}

/**
 * ⚠ QUATRE TABLES, QUATRE NOMS DE COLONNE. `places` et `dishes` portent
 *   `name_fr`, `attractions` et `pages` portent `name`. On nomme les colonnes
 *   une par une — un `select('*')` anonyme rend 401 depuis la fermeture
 *   colonne par colonne sur `profiles`, et la règle vaut partout.
 */
async function chercherFiches(type: CibleType, q: string): Promise<Fiche[]> {
  const motif = `%${q}%`;
  if (type === "destination") {
    const { data, error } = await supabase
      .from("places")
      .select("id, name_fr")
      .ilike("name_fr", motif)
      .order("name_fr")
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, nom: r.name_fr }));
  }
  if (type === "site") {
    const { data, error } = await supabase
      .from("attractions")
      .select("id, name")
      .ilike("name", motif)
      .order("name")
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, nom: r.name }));
  }
  if (type === "plat") {
    const { data, error } = await supabase
      .from("dishes")
      .select("id, name_fr")
      .ilike("name_fr", motif)
      .order("name_fr")
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, nom: r.name_fr }));
  }
  const { data, error } = await supabase
    .from("pages")
    .select("id, name")
    .ilike("name", motif)
    .order("name")
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, nom: r.name }));
}

/**
 * Mesure les dimensions réelles du fichier.
 *
 * ⚠ SANS `width`/`height`, LA PAGE SAUTE au chargement de l'image — la règle du
 *   dépôt les impose sur toutes les images. On les relève ici, une fois, plutôt
 *   que de les laisser à `null` et d'y revenir jamais.
 */
function mesurer(fichier: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function PoserUnePhoto({ onPosee }: { onPosee: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<CibleType>("destination");
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<Fiche[]>([]);
  const [cherche, setCherche] = useState(false);
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [credit, setCredit] = useState("");
  const [legende, setLegende] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const champFichier = useRef<HTMLInputElement>(null);

  const lancerRecherche = useCallback(async () => {
    const q = recherche.trim();
    if (q.length < 2) {
      toast.error("Tapez au moins deux lettres.");
      return;
    }
    setCherche(true);
    try {
      setResultats(await chercherFiches(type, q));
    } catch (e) {
      toast.error(messageErreur(e, "La recherche a échoué."));
    } finally {
      setCherche(false);
    }
  }, [recherche, type]);

  const envoyer = useCallback(
    async (fichier: File) => {
      if (!fiche) return;
      setEnvoi(true);
      try {
        const dims = await mesurer(fichier);
        const compresse = await compressImage(fichier);
        const res = await uploadToO2Switch(compresse, "pages");
        if (!res.success || !res.url) {
          toast.error(res.error || "La photo n'a pas pu être envoyée.");
          return;
        }
        await poserPhotoAdmin({
          cibleType: type,
          cible: fiche.id,
          url: res.url,
          largeur: dims?.w ?? null,
          hauteur: dims?.h ?? null,
          credit: credit.trim() || null,
          legende: legende.trim() || null,
        });
        toast.success("Photo posée.", { description: `${fiche.nom} a maintenant une image.` });
        setFiche(null);
        setResultats([]);
        setRecherche("");
        setCredit("");
        setLegende("");
        setOuvert(false);
        onPosee();
      } catch (e) {
        toast.error(messageErreur(e, "La photo n'a pas pu être posée."));
      } finally {
        setEnvoi(false);
        if (champFichier.current) champFichier.current.value = "";
      }
    },
    [credit, fiche, legende, onPosee, type]
  );

  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className={BTN_PRIMAIRE}>
        <ImagePlus className="h-4 w-4" aria-hidden="true" />
        Poser une photo
      </button>
    );
  }

  return (
    <Carte>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">Poser une photo sur une fiche</h3>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          aria-label="Fermer"
          className="dk-tap grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <label className={ETIQUETTE} htmlFor="admin-photo-type">
            Type de fiche
          </label>
          <select
            id="admin-photo-type"
            className={CHAMP}
            value={type}
            onChange={(e) => {
              setType(e.target.value as CibleType);
              setResultats([]);
              setFiche(null);
            }}
          >
            {(Object.keys(LIBELLE_CIBLE) as CibleType[]).map((t) => (
              <option key={t} value={t}>
                {LIBELLE_CIBLE[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={ETIQUETTE} htmlFor="admin-photo-recherche">
            Chercher la fiche
          </label>
          <div className="flex gap-2">
            <input
              id="admin-photo-recherche"
              className={CHAMP}
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void lancerRecherche();
                }
              }}
              placeholder="Nom de la fiche"
            />
            <button
              type="button"
              onClick={() => void lancerRecherche()}
              disabled={cherche}
              className={BTN_SECONDAIRE}
            >
              {cherche ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4" aria-hidden="true" />
              )}
              Chercher
            </button>
          </div>
        </div>

        {resultats.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {resultats.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setFiche(r)}
                  className={`dk-tap flex w-full items-center justify-between px-3 py-2.5 text-left text-sm ${
                    fiche?.id === r.id ? "bg-secondary font-medium" : ""
                  }`}
                >
                  <span className="truncate">{r.nom}</span>
                  {fiche?.id === r.id ? (
                    <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {fiche ? (
          <>
            <div>
              <label className={ETIQUETTE} htmlFor="admin-photo-credit">
                Crédit — qui a pris la photo
              </label>
              <input
                id="admin-photo-credit"
                className={CHAMP}
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
                placeholder="Nom de l'auteur"
              />
              {/* ⚠ LE CRÉDIT N'EST PAS DÉCORATIF. 0049, 0082 et 0096 ont posé
                  les trois champs de crédit précisément parce qu'une photo
                  sous licence CC exige de nommer son auteur : sans crédit, une
                  photo posée n'est pas « gratuite », elle est en infraction. */}
              <p className="dk-secondaire mt-1">
                Laissé vide, la fiche n'affichera aucun auteur. Pour une photo qui vient
                d'ailleurs, c'est une infraction à sa licence.
              </p>
            </div>

            <div>
              <label className={ETIQUETTE} htmlFor="admin-photo-legende">
                Légende (facultatif)
              </label>
              <input
                id="admin-photo-legende"
                className={CHAMP}
                value={legende}
                onChange={(e) => setLegende(e.target.value)}
              />
            </div>

            <input
              ref={champFichier}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void envoyer(f);
              }}
            />
            <button
              type="button"
              disabled={envoi}
              onClick={() => champFichier.current?.click()}
              className={`${BTN_PRIMAIRE} w-full`}
            >
              {envoi ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Envoi…
                </>
              ) : (
                <>
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  Choisir la photo de « {fiche.nom} »
                </>
              )}
            </button>
            <Note>
              La photo remplace la couverture actuelle de la fiche, immédiatement et sans
              étape de validation. Elle laisse une trace dans la file ci-dessous, pour qu'on
              sache dans six mois d'où elle sort.
            </Note>
          </>
        ) : null}
      </div>
    </Carte>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   La file de modération
   ═══════════════════════════════════════════════════════════════════════════ */

export default function Photos() {
  const [filtre, setFiltre] = useState<FiltrePhotos>("en_attente");
  const [lignes, setLignes] = useState<PhotoProposee[]>([]);
  const [curseur, setCurseur] = useState<Curseur | null>(null);
  const [chargement, setChargement] = useState(true);
  const [suite, setSuite] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async (f: FiltrePhotos) => {
    setChargement(true);
    setErreur(false);
    try {
      const lot = await photosAdmin(f, null, PAR_PAGE);
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
      const lot = await photosAdmin(filtre, curseur, PAR_PAGE);
      setLignes((v) => [...v, ...lot]);
      setCurseur(curseurSuivant(lot, PAR_PAGE));
    } catch (e) {
      toast.error(messageErreur(e, "La suite n'a pas pu être chargée."));
    } finally {
      setSuite(false);
    }
  }, [curseur, filtre]);

  const approuver = useCallback(async (p: PhotoProposee) => {
    setEnCours(p.id);
    try {
      await traiterPhoto(p.id, "approuver");
      setLignes((v) => v.map((l) => (l.id === p.id ? { ...l, statut: "approuvee" } : l)));
      toast.success("Photo publiée.", {
        description: p.cible_nom ? `Elle illustre ${p.cible_nom}.` : undefined,
      });
    } catch (e) {
      toast.error(messageErreur(e, "L'approbation n'a pas abouti."));
    } finally {
      setEnCours(null);
    }
  }, []);

  const refuser = useCallback(async (p: PhotoProposee) => {
    const saisi = window.prompt(
      "Pourquoi cette photo n'est-elle pas retenue ? (le proposeur le lira)",
      ""
    );
    if (saisi === null) return;
    const motif = saisi.trim().slice(0, 500);
    if (!motif) {
      toast.error("Un refus doit porter un motif.");
      return;
    }

    setEnCours(p.id);
    try {
      await traiterPhoto(p.id, "refuser", motif);
      setLignes((v) =>
        v.map((l) => (l.id === p.id ? { ...l, statut: "refusee", motif_refus: motif } : l))
      );

      /**
       * 🔴 ON TENTE L'EFFACEMENT, ET ON NE PROMET PAS QU'IL A EU LIEU.
       *    `o2delete.php` refuse tout chemin qui n'est pas sous le dossier de
       *    l'appelant : `^<dossier>/<jwtUserId>/`, un garde anti-IDOR posé pour
       *    empêcher un membre d'effacer les photos d'un autre. L'administration
       *    n'y échappe pas — la RPC lui donne le droit de REFUSER la photo, pas
       *    de toucher au fichier d'autrui. L'appel réussit donc quand
       *    l'administration refuse sa propre photo, et échoue en silence pour
       *    celle d'un membre (`deleteFromO2Switch` ne jette jamais et ignore la
       *    réponse).
       *
       * ⚠ ÉCRIRE « fichier supprimé » SERAIT FAUX dans le cas qui compte. Ce
       *   qui est vrai et vérifiable : la photo n'est plus publiable. On dit
       *   cela. Pour vraiment purger le fichier, `o2delete.php` doit apprendre
       *   à reconnaître un administrateur — noté dans docs/chantiers/admin.md.
       */
      await deleteFromO2Switch([p.url]);
      toast.success("Photo refusée.", {
        description: "Elle ne sera publiée nulle part. Le proposeur reçoit le motif.",
      });
    } catch (e) {
      toast.error(messageErreur(e, "Le refus n'a pas abouti."));
    } finally {
      setEnCours(null);
    }
  }, []);

  return (
    <div className="space-y-4">
      <PoserUnePhoto onPosee={() => void charger(filtre)} />

      <Filtres valeur={filtre} options={FILTRES} onChange={setFiltre} />

      <Note>
        Une photo en attente n'apparaît nulle part dans Diako : aucune page ne lit cette
        file, et seule l'approbation recopie l'image sur la fiche. Le refus la rend
        définitivement non publiable, mais ne garantit pas la disparition du fichier envoyé.
      </Note>

      {chargement ? (
        <Squelette nombre={3} hauteur="h-32" />
      ) : erreur ? (
        <EtatErreur
          titre="La file n'a pas pu être chargée"
          texte="Rien n'est perdu. Réessayez, la connexion est peut-être passée en 2G."
          onReessayer={() => void charger(filtre)}
        />
      ) : lignes.length === 0 ? (
        <EtatVide
          icone={Images}
          titre={filtre === "en_attente" ? "Aucune photo en attente" : "Rien dans ce filtre"}
          texte={
            filtre === "en_attente"
              ? "Les photos proposées par les membres arriveront ici. En attendant, « Poser une photo » remplit le référentiel directement."
              : "Changez de filtre pour voir les autres propositions."
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {lignes.map((p) => {
              const occupe = enCours === p.id;
              return (
                <li key={p.id}>
                  <Carte>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      {/* ⚠ `width`/`height` EXPLICITES : sans eux la carte saute
                          quand l'image arrive, et la file en montre plusieurs. */}
                      <img
                        src={getThumbUrl(p.url)}
                        alt={p.legende ?? ""}
                        width={160}
                        height={120}
                        loading="lazy"
                        className="h-[120px] w-full max-w-full shrink-0 rounded-xl object-cover sm:w-40"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pastille ton="neutre">{LIBELLE_CIBLE[p.cible_type]}</Pastille>
                          {p.statut === "en_attente" ? (
                            <Pastille ton="alerte">En attente</Pastille>
                          ) : p.statut === "approuvee" ? (
                            <Pastille ton="primaire">Publiée</Pastille>
                          ) : (
                            <Pastille ton="neutre">Refusée</Pastille>
                          )}
                          <span className="dk-secondaire">{dateCourte(p.created_at)}</span>
                        </div>

                        <p className="mt-1.5 font-medium">
                          {p.cible_lien ? (
                            <Link to={p.cible_lien} className="hover:underline">
                              {p.cible_nom ?? "Fiche supprimée"}
                            </Link>
                          ) : (
                            (p.cible_nom ?? "Fiche supprimée")
                          )}
                        </p>

                        <p className="dk-secondaire mt-0.5">
                          Proposée par{" "}
                          <Link to={`/user/${p.proposeur_id}`} className="hover:underline">
                            {p.proposeur_nom ?? "un membre"}
                          </Link>
                          {p.credit ? ` · crédit : ${p.credit}` : " · aucun crédit"}
                        </p>

                        {p.legende ? <p className="mt-1 text-sm">{p.legende}</p> : null}
                        {p.motif_refus ? (
                          <p className="dk-secondaire mt-1">Motif : {p.motif_refus}</p>
                        ) : null}

                        <div className="mt-3 flex flex-wrap gap-2">
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className={BTN_SECONDAIRE}
                          >
                            Voir en grand
                          </a>
                          {p.statut === "en_attente" ? (
                            <>
                              <button
                                type="button"
                                disabled={occupe}
                                onClick={() => void approuver(p)}
                                className={BTN_PRIMAIRE}
                              >
                                {occupe ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                  <Check className="h-4 w-4" aria-hidden="true" />
                                )}
                                Approuver
                              </button>
                              <button
                                type="button"
                                disabled={occupe}
                                onClick={() => void refuser(p)}
                                className={BTN_DANGER}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                                Refuser
                              </button>
                            </>
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
