/**
 * Onglet « Membres » — qui est inscrit, et qui modère.
 *
 * ⚠ L'ADRESSE E-MAIL EST AFFICHÉE ICI ET NULLE PART AILLEURS. Elle ne sort de
 *   la base que par `dk_admin_membres()`, gardée par `is_admin()` : `profiles`
 *   est fermée colonne par colonne pour `anon`, et c'est ce qui fait qu'un
 *   `select('*')` anonyme rend 401. On ne rouvre pas cette porte pour un
 *   confort d'écran.
 *
 * 🔴 CET ÉCRAN NE DONNE PAS LE RÔLE `admin`, SEULEMENT `moderateur`. La RPC
 *    n'accepte même pas le nom du rôle en argument. Sinon un modérateur promu
 *    par erreur se promeut administrateur et évince le propriétaire : deux
 *    clics. Le rôle `admin` vient de l'adresse `contact.diako@gmail.com`,
 *    vérifiée par le serveur, et de nulle part ailleurs.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { EtatVide, EtatErreur } from "@/components/Etats";
import { getAvatarUrl } from "@/lib/supabaseImage";
import {
  basculerModerateur,
  curseurSuivant,
  dateCourte,
  membresAdmin,
  messageErreur,
  nombre,
  type Curseur,
  type MembreAdmin,
} from "@/lib/admin";
import {
  BTN_SECONDAIRE,
  BoutonSuite,
  CHAMP,
  Note,
  Pastille,
  Squelette,
} from "./Communs";

const PAR_PAGE = 40;

export default function Membres() {
  const [saisie, setSaisie] = useState("");
  const [recherche, setRecherche] = useState<string | null>(null);
  const [lignes, setLignes] = useState<MembreAdmin[]>([]);
  const [curseur, setCurseur] = useState<Curseur | null>(null);
  const [chargement, setChargement] = useState(true);
  const [suite, setSuite] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async (q: string | null) => {
    setChargement(true);
    setErreur(false);
    try {
      const lot = await membresAdmin(null, q, PAR_PAGE);
      setLignes(lot);
      setCurseur(curseurSuivant(lot, PAR_PAGE));
    } catch (e) {
      setErreur(true);
      toast.error(messageErreur(e, "Les membres n'ont pas pu être chargés."));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger(recherche);
  }, [charger, recherche]);

  const chargerSuite = useCallback(async () => {
    if (!curseur) return;
    setSuite(true);
    try {
      const lot = await membresAdmin(curseur, recherche, PAR_PAGE);
      setLignes((v) => [...v, ...lot]);
      setCurseur(curseurSuivant(lot, PAR_PAGE));
    } catch (e) {
      toast.error(messageErreur(e, "La suite n'a pas pu être chargée."));
    } finally {
      setSuite(false);
    }
  }, [curseur, recherche]);

  const basculer = useCallback(async (m: MembreAdmin) => {
    const estModo = m.roles.includes("moderateur");
    setEnCours(m.id);
    try {
      await basculerModerateur(m.id, !estModo);
      setLignes((v) =>
        v.map((l) =>
          l.id === m.id
            ? {
                ...l,
                roles: estModo
                  ? l.roles.filter((r) => r !== "moderateur")
                  : [...l.roles, "moderateur"].sort(),
              }
            : l
        )
      );
      toast.success(estModo ? "Rôle de modérateur retiré." : "Rôle de modérateur accordé.");
    } catch (e) {
      toast.error(messageErreur(e, "Le rôle n'a pas pu être modifié."));
    } finally {
      setEnCours(null);
    }
  }, []);

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setRecherche(saisie.trim() || null);
        }}
        className="flex gap-2"
      >
        <label className="sr-only" htmlFor="admin-membres-recherche">
          Chercher un membre
        </label>
        <input
          id="admin-membres-recherche"
          className={CHAMP}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Nom ou adresse e-mail"
        />
        <button type="submit" className={BTN_SECONDAIRE}>
          <Search className="h-4 w-4" aria-hidden="true" />
          Chercher
        </button>
      </form>

      <Note>
        Un modérateur peut relire les signalements. Il ne peut ni distribuer de rôles, ni
        toucher aux codes promo : ces deux gestes restent à l'administration.
      </Note>

      {chargement ? (
        <Squelette nombre={5} hauteur="h-20" />
      ) : erreur ? (
        <EtatErreur
          titre="Les membres n'ont pas pu être chargés"
          texte="Rien n'est perdu. Réessayez, la connexion est peut-être passée en 2G."
          onReessayer={() => void charger(recherche)}
        />
      ) : lignes.length === 0 ? (
        <EtatVide
          icone={Users}
          titre={recherche ? "Aucun membre ne correspond" : "Aucun membre inscrit"}
          texte={
            recherche
              ? "Essayez une autre orthographe, ou une partie de l'adresse e-mail."
              : "Les inscriptions apparaîtront ici."
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {lignes.map((m) => {
              const estModo = m.roles.includes("moderateur");
              const estAdmin = m.roles.includes("admin");
              return (
                <li key={m.id} className="flex items-center gap-3 bg-card p-3">
                  <img
                    src={getAvatarUrl(m.avatar_url, 44)}
                    alt=""
                    width={44}
                    height={44}
                    loading="lazy"
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link to={`/user/${m.id}`} className="truncate font-medium hover:underline">
                        {m.display_name ?? "Sans nom"}
                      </Link>
                      {estAdmin ? <Pastille ton="primaire">Admin</Pastille> : null}
                      {estModo ? <Pastille ton="neutre">Modérateur</Pastille> : null}
                      {m.account_type === "pro" ? <Pastille ton="neutre">Pro</Pastille> : null}
                    </div>
                    <p className="dk-secondaire truncate">{m.email ?? "Adresse inconnue"}</p>
                    <p className="dk-secondaire">
                      Inscrit le {dateCourte(m.created_at)} · {nombre(m.posts_count)} publication
                      {m.posts_count > 1 ? "s" : ""} · {nombre(m.followers_count)} abonné
                      {m.followers_count > 1 ? "s" : ""}
                    </p>
                  </div>

                  {/* ⚠ AUCUN BOUTON SUR UN ADMINISTRATEUR. Il n'a pas de rôle
                      `moderateur` à basculer, et l'écran ne doit pas laisser
                      croire qu'on peut lui retirer quoi que ce soit ici. */}
                  {estAdmin ? null : (
                    <button
                      type="button"
                      disabled={enCours === m.id}
                      onClick={() => void basculer(m)}
                      className={BTN_SECONDAIRE}
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      {estModo ? "Retirer" : "Modérateur"}
                    </button>
                  )}
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
