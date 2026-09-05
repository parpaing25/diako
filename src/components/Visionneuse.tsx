import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Media } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * LA VISIONNEUSE — une photo du site, en grand.
 *
 * 🔴 CE QUI MANQUAIT. Le propriétaire l'a demandé en clair : « les photos
 *    cliquables ». Toucher une photo du fil ne faisait RIEN — ni zoom, ni
 *    plein écran. Sur un site de voyage, dont la matière première est l'image,
 *    le geste le plus naturel du monde tombait dans le vide.
 *
 * 🔴 LE PORTAIL N'EST PAS UN DÉTAIL DE STYLE, C'EST LE CŒUR DU CORRECTIF.
 *    Un `position: fixed` n'est ancré à la fenêtre QUE si aucun ancêtre ne
 *    porte un `transform`, un `filter` ou un `perspective` — le premier qui en
 *    porte un devient le bloc conteneur, et le « plein écran » se retrouve
 *    enfermé dans une carte de 300 px. Ce projet a déjà payé ce piège très
 *    cher : l'accueil mobile est resté VIDE plusieurs jours à cause d'un
 *    `animation-fill-mode: both` qui laissait un `transform` d'identité posé
 *    pour toujours (voir `.dk-page` dans index.css). Les cartes du fil portent
 *    `dk-carte` et `dk-zoom`, donc des transforms au survol. On sort donc du
 *    DOM de la page : `createPortal` vers `<body>`, hors de portée de tout
 *    ancêtre transformé, présent ou futur.
 *
 * ⚠ LA PLUS GRANDE VARIANTE, PAS L'ORIGINAL. `o2upload.php` fabrique une
 *   `.w1600.webp` : c'est elle qu'on affiche. L'original pèse jusqu'à 1 Mo pour
 *   une largeur qu'aucun écran visé n'exploite — ouvrir une photo ne doit pas
 *   coûter le double du fil entier sur une 3G.
 *
 * ⚠ LE DÉFILEMENT DE LA PAGE EST GELÉ pendant l'ouverture. Sans cela, le geste
 *   de balayage fait défiler le fil DERRIÈRE la visionneuse : on la referme et
 *   on a perdu sa place dans la liste.
 */

/** La variante 1600 quand l'image vient d'o2switch ; l'URL telle quelle sinon. */
function grandeTaille(url: string): string {
  if (!url.includes("/uploads/")) return url;
  return url.replace(/\.(jpe?g|png|webp)(\?.*)?$/i, ".w1600.webp$2");
}

export function Visionneuse({
  images,
  depart = 0,
  alt = "",
  credit = null,
  onFermer,
}: {
  images: Media[];
  depart?: number;
  alt?: string;
  credit?: string | null;
  onFermer: () => void;
}) {
  const [i, setI] = useState(depart);
  const [echoue, setEchoue] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  /* ⚠ On mémorise QUI avait le focus pour le lui rendre à la fermeture. Sans
     ça, refermer la visionneuse renvoie le focus au début du document et la
     navigation au clavier repart de zéro — on perd sa place dans le fil. */
  const focusAvant = useRef<Element | null>(null);

  const n = images.length;
  const suivante = useCallback(() => setI((v) => (v + 1) % n), [n]);
  const precedente = useCallback(() => setI((v) => (v - 1 + n) % n), [n]);

  useEffect(() => {
    focusAvant.current = document.activeElement;
    boite.current?.focus();

    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
      else if (e.key === "ArrowRight") suivante();
      else if (e.key === "ArrowLeft") precedente();
    };
    document.addEventListener("keydown", auClavier);

    // Gel du défilement, en conservant la position exacte.
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", auClavier);
      document.body.style.overflow = avant;
      (focusAvant.current as HTMLElement | null)?.focus?.();
    };
  }, [onFermer, suivante, precedente]);

  // Une nouvelle photo mérite une nouvelle chance de se charger.
  useEffect(() => setEchoue(false), [i]);

  const media = images[i];
  if (!media) return null;

  return createPortal(
    <div
      ref={boite}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Photo en grand"}
      /* ⚠ `fixed inset-0` ET `z-[100]` : le rail droit monte à z-40, les
         panneaux de l'en-tête à z-50. En dessous, la visionneuse s'ouvrirait
         DERRIÈRE eux — visible, mais inutilisable. */
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 outline-none"
      onClick={(e) => {
        // Cliquer À CÔTÉ de la photo referme : c'est le geste attendu, et il
        // évite de chercher la croix sur un fond noir.
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <button
        onClick={onFermer}
        aria-label="Fermer"
        className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      {n > 1 && (
        <>
          <button
            onClick={precedente}
            aria-label="Photo précédente"
            className="absolute left-2 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white sm:left-4"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
          <button
            onClick={suivante}
            aria-label="Photo suivante"
            className="absolute right-2 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white sm:right-4"
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </button>
          <p className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {i + 1} / {n}
          </p>
        </>
      )}

      {/* ⚠ `max-h-[88dvh]` et non `100vh` : sur mobile, `vh` compte la barre
          d'adresse qui n'est pas là — le bas de la photo passait sous l'écran. */}
      {media.type === "video" ? (
        <video
          key={media.url}
          src={media.url}
          poster={media.poster}
          controls
          autoPlay
          playsInline
          className="max-h-[88dvh] max-w-[96vw] bg-black object-contain"
        >
          Votre navigateur ne lit pas cette vidéo.
        </video>
      ) : (
        <img
          key={media.url}
          src={echoue ? media.url : grandeTaille(media.url)}
          alt={alt}
          /* ⚠ Un repli sur l'ORIGINAL si la grande variante manque. Une variante
             absente ne rend pas 404 sur cet hébergeur : le `.htaccess` renvoie
             `index.html` avec un « 200 OK », et le navigateur affiche une image
             cassée. `onError` est le seul signal fiable. */
          onError={() => setEchoue(true)}
          className="max-h-[88dvh] max-w-[96vw] object-contain"
        />
      )}

      {credit && (
        <p
          className={cn(
            "absolute bottom-3 left-1/2 max-w-[92vw] -translate-x-1/2 truncate",
            "rounded-full bg-black/50 px-3 py-1 text-xs text-white/80 backdrop-blur-sm"
          )}
        >
          {credit}
        </p>
      )}
    </div>,
    document.body
  );
}
