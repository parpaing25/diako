import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Copy, Link2, Share2, X } from "lucide-react";
import { toast } from "sonner";

/**
 * LE PARTAGE — Facebook, WhatsApp, le lien, et le partage natif du téléphone.
 *
 * ⭐ POURQUOI UN MENU ET PAS `navigator.share` SEUL. Sur un ordinateur, le
 *   partage natif n'existe pas et le bouton se contentait de copier le lien —
 *   sans le dire autrement qu'un toast. À Madagascar, un récit se partage sur
 *   Facebook et sur WhatsApp avant tout : ces deux gestes méritent un bouton
 *   chacun, visible.
 *
 * ⚠ INSTAGRAM N'A PAS DE PARTAGE PAR LIEN sur le web : on copie le lien et on
 *   dit quoi en faire (le coller dans une story ou la bio). Promettre un
 *   bouton « Instagram » qui ouvre l'application serait un mensonge.
 *
 * ⚠ PORTAIL VERS `<body>` : le menu vit au-dessus du fil plein écran du
 *   téléphone, qui est un conteneur `fixed`, et au-dessus des cartes qui
 *   portent un `transform` au survol (voir Visionneuse.tsx pour le piège).
 */
export function PartagerMenu({
  url,
  texte,
  onFermer,
}: {
  url: string;
  texte?: string;
  onFermer: () => void;
}) {
  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [onFermer]);

  const encode = encodeURIComponent;
  const accroche = (texte ?? "").slice(0, 120).trim();

  async function copier(message: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(message);
    } catch {
      toast.error("Le lien n'a pas pu être copié.");
    }
    onFermer();
  }

  async function natif() {
    try {
      await navigator.share({ title: "Diako", text: accroche, url });
    } catch {
      /* annulé */
    }
    onFermer();
  }

  const ligne =
    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Partager">
      <button aria-label="Fermer" onClick={onFermer} className="absolute inset-0 bg-black/50" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-2xl bg-background p-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-96 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
        <div className="flex items-center justify-between px-2 pb-2">
          <p className="font-semibold">Partager</p>
          <button
            onClick={onFermer}
            aria-label="Fermer"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encode(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onFermer}
          className={ligne}
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#1877F2] text-white" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.2H7.3V14h2.8v8h3.4z" />
            </svg>
          </span>
          Facebook
        </a>

        <a
          href={`https://wa.me/?text=${encode(accroche ? `${accroche} ${url}` : url)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onFermer}
          className={ligne}
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#25D366] text-white" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.9 2.9 4.6 4 1.7.7 2.3.8 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3z" />
            </svg>
          </span>
          WhatsApp
        </a>

        <button onClick={() => void copier("Lien copié — collez-le dans votre story ou votre bio Instagram.")} className={ligne}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span>
            Instagram
            <span className="block text-xs font-normal text-muted-foreground">copie le lien pour votre story</span>
          </span>
        </button>

        <button onClick={() => void copier("Lien copié")} className={ligne}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-muted" aria-hidden="true">
            <Link2 className="h-5 w-5" />
          </span>
          Copier le lien
        </button>

        {typeof navigator !== "undefined" && "share" in navigator && (
          <button onClick={() => void natif()} className={ligne}>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-muted" aria-hidden="true">
              <Share2 className="h-5 w-5" />
            </span>
            Autres applications…
          </button>
        )}
        <span className="sr-only">
          <Copy className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </div>,
    document.body
  );
}
