import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Bell, ChevronRight, Lock, LogOut, Monitor, Moon, Shield, Sun, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  activerPush,
  desactiverPush,
  etatPush,
  type EtatPush,
} from "@/lib/pushNotifications";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";

const MODES: { cle: Theme; label: string; icon: typeof Sun }[] = [
  { cle: "clair", label: "Clair", icon: Sun },
  { cle: "sombre", label: "Sombre", icon: Moon },
  { cle: "systeme", label: "Système", icon: Monitor },
];

const CLASSE_LIGNE =
  "flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted";

function Ligne({
  icon: Icon,
  titre,
  detail,
  onClick,
  to,
}: {
  icon: typeof Bell;
  titre: string;
  detail: string;
  onClick?: () => void;
  /** Quand le réglage vit ailleurs, la ligne y MÈNE. */
  to?: string;
}) {
  const contenu = (
    <>
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{titre}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );

  // ⚠ Un réglage qui mène vers un autre écran doit être un LIEN, pas un bouton
  //   qui navigue : sinon le clic milieu, le « ouvrir dans un nouvel onglet »
  //   et les lecteurs d'écran ne voient qu'un bouton sans destination.
  return to ? (
    <Link to={to} className={CLASSE_LIGNE}>
      {contenu}
    </Link>
  ) : (
    <button onClick={onClick} className={CLASSE_LIGNE}>
      {contenu}
    </button>
  );
}

/**
 * Paramètres.
 *
 * Le sélecteur de thème est RÉEL et fonctionne immédiatement — les variables
 * de la palette sombre existaient déjà dans index.css sans que rien ne les
 * active.
 *
 * 🔴 PLUS AUCUNE LIGNE NE MENT ICI. « Langue » et « Confidentialité » ne
 *    faisaient qu'un toast « Bientôt disponible ». Or la confidentialité EXISTE
 *    et fonctionne depuis /compte (visibilité publication par publication,
 *    ouverture des lieux visités) : la ligne y mène désormais. La langue, elle,
 *    n'a rien derrière — pas de traduction, `profiles.language` n'est lu nulle
 *    part — donc la ligne est RETIRÉE. Un réglage qui ne règle rien est pire
 *    qu'un réglage absent : il fait croire que le malgache est déjà choisi.
 */
export default function Parametres() {
  useDocumentTitle("Paramètres");
  const { theme, effectif, setTheme } = useTheme();
  const { user, signOut } = useAuth();

  const [push, setPush] = useState<EtatPush>("impossible");
  const [bascule, setBascule] = useState(false);

  const relire = useCallback(() => {
    void etatPush().then(setPush);
  }, []);
  useEffect(relire, [relire]);

  async function basculerPush() {
    setBascule(true);
    try {
      if (push === "actif") {
        await desactiverPush();
        toast.success("Notifications coupées.");
      } else {
        const ok = await activerPush();
        toast[ok ? "success" : "error"](
          ok
            ? "Notifications activées."
            : "Le navigateur a refusé. Autorisez les notifications dans ses réglages."
        );
      }
    } finally {
      setBascule(false);
      relire();
    }
  }

  const detailPush =
    !user
      ? "Connectez-vous pour être prévenu des réponses"
      : push === "impossible"
        ? "Votre navigateur ne les gère pas"
        : push === "refuse"
          ? "Refusées — à réautoriser dans les réglages du navigateur"
          : push === "actif"
            ? "Activées sur cet appareil · appuyez pour couper"
            : "Être prévenu quand un établissement vous répond";

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <h1 className="text-2xl font-semibold">Paramètres</h1>

      {/* ── Apparence — pleinement fonctionnel ─────────────────────────── */}
      <section className="mt-6" aria-labelledby="titre-apparence">
        <h2 id="titre-apparence" className="text-sm font-semibold">
          Apparence
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {MODES.map(({ cle, label, icon: Icon }) => (
            <button
              key={cle}
              onClick={() => setTheme(cle)}
              aria-pressed={theme === cle}
              className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 transition ${
                theme === cle
                  ? "border-primary bg-secondary"
                  : "border-border hover:bg-muted"
              }`}
            >
              <Icon
                className={`h-5 w-5 ${theme === cle ? "text-primary" : "text-muted-foreground"}`}
                aria-hidden="true"
              />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Actuellement en mode <strong>{effectif}</strong>
          {theme === "systeme" && " — suit le réglage de votre appareil"}.
        </p>
      </section>

      {/* ── Deux réglages, tous les deux branchés ──────────────────────── */}
      <section className="mt-7" aria-labelledby="titre-prefs">
        <h2 id="titre-prefs" className="text-sm font-semibold">
          Préférences
        </h2>
        <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {/* Le push sert d'abord aux REPONSES : un voyageur ecrit le soir,
              le gerant repond le lendemain. Sans notification, la reponse
              attend qu'on pense a rouvrir le site — et la mise en relation ne
              se fait pas. */}
          {/* ⚠ DÉCONNECTÉ, LA LIGNE MÈNE À /auth au lieu d'annoncer « bientôt » :
              le push fonctionne, il lui manque seulement un compte à qui
              rattacher l'abonnement. */}
          <Ligne
            icon={Bell}
            titre="Notifications"
            detail={detailPush}
            to={user ? undefined : "/auth"}
            onClick={() => {
              if (push === "impossible" || push === "refuse" || bascule) return;
              void basculerPush();
            }}
          />
          {/* ⚠ CETTE LIGNE MÈNE AU RÉGLAGE RÉEL, elle ne le reproduit pas :
              `changerVisibilite` s'exerce publication par publication dans
              « Mes publications », et `ouvrirMesLieux` dans « Mon profil ».
              Les recopier ici aurait fait deux commandes pour un seul état. */}
          <Ligne
            icon={Shield}
            titre="Confidentialité"
            detail={
              user
                ? "Vos lieux visités, et la visibilité de chaque publication"
                : "Connectez-vous pour choisir qui voit vos publications"
            }
            to={user ? "/compte?onglet=profil" : "/auth"}
          />
        </div>
      </section>

      <section className="mt-7" aria-labelledby="titre-compte">
        <h2 id="titre-compte" className="text-sm font-semibold">
          Compte
        </h2>
        <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {user ? (
            <>
              <Link to="/compte" className="flex w-full items-center gap-3 px-4 py-3.5 transition hover:bg-muted">
                <Lock className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Mon profil</span>
                  <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
              <button
                onClick={() => void signOut()}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted"
              >
                <LogOut className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium">Se déconnecter</span>
              </button>
              <button
                onClick={() =>
                  toast("Suppression de compte", {
                    description: "Écrivez à contact.fonenako@gmail.com : votre compte et vos publications seront effacés.",
                  })
                }
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-destructive transition hover:bg-destructive/5"
              >
                <Trash2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium">Supprimer mon compte</span>
              </button>
            </>
          ) : (
            <Link to="/auth" className="flex w-full items-center gap-3 px-4 py-3.5 transition hover:bg-muted">
              <Lock className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">Se connecter ou créer un compte</span>
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>

      <p className="mt-6 text-xs text-muted-foreground">
        <Link to="/mentions" className="underline underline-offset-4">Mentions légales</Link>
        {" · "}
        <Link to="/confidentialite" className="underline underline-offset-4">Confidentialité</Link>
        {" · "}
        <Link to="/cgu" className="underline underline-offset-4">Conditions</Link>
      </p>
    </div>
  );
}
