import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * Invite à installer l'application.
 *
 * Pourquoi ça compte ici plus qu'ailleurs : à Madagascar, le téléphone est
 * souvent le seul appareil, et une application installée s'ouvre depuis
 * l'écran d'accueil sans passer par le navigateur, garde sa session, et
 * fonctionne partiellement hors ligne grâce au service worker déjà en place.
 *
 * ⚠ DEUX RÈGLES DE POLITESSE, apprises du projet frère où l'invite était
 *   apparue trop tôt et trop souvent :
 *
 *   ① ON NE DEMANDE PAS À QUELQU'UN QUI VIENT D'ARRIVER. L'invite attend que
 *     le visiteur ait passé un moment sur le site — sinon on demande un
 *     engagement à quelqu'un qui ne sait pas encore ce qu'on lui propose.
 *
 *   ② UN REFUS VAUT POUR LONGTEMPS. Redemander chaque semaine transforme une
 *     proposition en harcèlement. Trente jours.
 */

const CLE_REFUS = "diako_install_refus";
const JOURS_AVANT_NOUVELLE_DEMANDE = 30;
const DELAI_AVANT_INVITE_MS = 45_000;

interface EvenementInstallation extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function refusRecent(): boolean {
  try {
    const t = Number(localStorage.getItem(CLE_REFUS) ?? 0);
    return Date.now() - t < JOURS_AVANT_NOUVELLE_DEMANDE * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [evenement, setEvenement] = useState<EvenementInstallation | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (refusRecent()) return;
    /* ⚠ JAMAIS À LA PREMIÈRE VISITE, ni sur l'écran de connexion. Capture du
       05/09/2026 à 390 px : l'invite couvrait le texte du premier récit avant
       même que le visiteur sache ce qu'est Diako. On compte les visites ;
       l'invite attend la deuxième. */
    try {
      const n = Number(localStorage.getItem("dk-visites") ?? 0) + 1;
      localStorage.setItem("dk-visites", String(n));
      if (n < 2 || window.location.pathname.startsWith("/auth")) return;
    } catch {
      return;
    }
    // Déjà installée : le navigateur l'ouvre en mode autonome.
    if (window.matchMedia?.("(display-mode: standalone)").matches) return;

    const auPrompt = (e: Event) => {
      // On empêche la bannière native pour choisir NOTRE moment : la sienne
      // tombe pendant le premier défilement, au pire instant.
      e.preventDefault();
      setEvenement(e as EvenementInstallation);
    };
    window.addEventListener("beforeinstallprompt", auPrompt);
    return () => window.removeEventListener("beforeinstallprompt", auPrompt);
  }, []);

  useEffect(() => {
    if (!evenement) return;
    const t = setTimeout(() => setVisible(true), DELAI_AVANT_INVITE_MS);
    return () => clearTimeout(t);
  }, [evenement]);

  if (!visible || !evenement) return null;

  const refuser = () => {
    try {
      localStorage.setItem(CLE_REFUS, String(Date.now()));
    } catch {
      /* mode privé */
    }
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Installer Diako"
      className="dk-scale-in fixed inset-x-3 bottom-20 z-40 rounded-2xl border border-border bg-card p-4 shadow-lg sm:left-auto sm:right-6 sm:w-[360px] lg:bottom-6"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary">
          <Download className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">Installer Diako</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sur votre écran d'accueil, sans passer par le navigateur — et une
            partie du site reste consultable hors connexion.
          </p>
        </div>
        <button
          onClick={refuser}
          aria-label="Plus tard"
          className="dk-tap grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={async () => {
            setVisible(false);
            try {
              await evenement.prompt();
              const { outcome } = await evenement.userChoice;
              // Un refus au prompt natif compte comme un refus : on ne
              // repropose pas la semaine suivante.
              if (outcome === "dismissed") refuser();
            } catch {
              /* le navigateur a refusé d'ouvrir la boîte : rien à faire */
            }
          }}
          className="min-h-10 flex-1 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Installer
        </button>
        <button
          onClick={refuser}
          className="min-h-10 rounded-full border border-input px-4 text-sm font-medium"
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
