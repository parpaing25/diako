import { UtensilsCrossed } from "lucide-react";
import { TagRow } from "@/components/TagRow";
import { ImageProgressive } from "@/components/ImageProgressive";
import { cn } from "@/lib/utils";

/**
 * L'APERÇU DU RÉCIT DANS LE FIL — gabarit G6, à partir de 1280 px.
 *
 * ⚠ POURQUOI IL EXISTE. Ce qu'on écrit dans un formulaire ne ressemble jamais
 *   à ce que les autres verront : le texte est tronqué à 180 caractères dans
 *   le fil, les photos passent en 392 × 176, et les trois tags apparaissent
 *   sous la photo. Sans aperçu, on découvre la coupure APRÈS avoir publié.
 *
 * ⚠ IL REPREND LES MÊMES RÈGLES QUE LA VRAIE CARTE, sinon il ment. Même seuil
 *   de troncature, même `<TagRow>`, même ratio d'image. Un aperçu approximatif
 *   est pire qu'aucun aperçu : il donne confiance à tort.
 *
 * ⚠ IL N'INVENTE NI COMPTEUR NI DATE. Pas de « 12 réactions » ni de « il y a
 *   2 h » en figuration : la publication n'existe pas encore, et un chiffre de
 *   décor sur un site qui s'interdit les chiffres inventés serait une faute
 *   de plus que de forme.
 */

/** Le même seuil que `PostCard` — s'il change là-bas, il change ici. */
const SEUIL_TEXTE = 180;

export function ApercuRecit({
  auteur,
  avatar,
  texte,
  lieu,
  plat,
  etablissement,
  photos,
  className,
}: {
  auteur: string;
  avatar?: string | null;
  texte: string;
  lieu?: string | null;
  plat?: string | null;
  etablissement?: string | null;
  photos: { url: string }[];
  className?: string;
}) {
  const long = texte.length > SEUIL_TEXTE;
  const visible = long ? texte.slice(0, SEUIL_TEXTE).trimEnd() + "…" : texte;

  return (
    <aside className={cn("hidden shrink-0 xl:sticky xl:top-20 xl:block xl:w-[390px]", className)}>
      <div className="flex items-center gap-2">
        <p className="dk-etiquette flex-1">Dans le fil, ça donnera ça</p>
      </div>

      <article className="mt-2 overflow-hidden rounded-2xl border border-border bg-card">
        <header className="flex items-center gap-3 px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary-soft text-xs font-semibold text-primary-foreground">
            {avatar ? (
              <img src={avatar} alt="" width={36} height={36} className="h-9 w-9 object-cover" />
            ) : (
              auteur.slice(0, 1).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold">{auteur}</p>
            {lieu && <p className="dk-secondaire truncate">{lieu}</p>}
          </div>
        </header>

        {photos.length > 0 ? (
          <div className="aspect-[16/9] bg-muted">
            <ImageProgressive src={photos[0].url} alt="" ajustement="cover" />
          </div>
        ) : (
          <div className="grid aspect-[16/9] place-items-center bg-secondary">
            <span className="dk-secondaire px-6 text-center">
              Sans photo, la publication passe presque inaperçue dans le fil.
            </span>
          </div>
        )}

        <div className="px-4 py-3">
          {visible ? (
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {visible}
              {long && <span className="ml-1 font-medium text-muted-foreground">plus</span>}
            </p>
          ) : (
            <p className="dk-secondaire italic">Votre texte apparaîtra ici.</p>
          )}

          <TagRow
            className="mt-2.5"
            lieu={lieu ? { nom: lieu } : null}
            etablissement={etablissement ? { nom: etablissement } : null}
            plat={plat ? { nom: plat } : null}
            taille="compacte"
          />
        </div>
      </article>

      {/* Le seul conseil qui vaille : ce qui manque à CETTE publication. */}
      <ul className="mt-3 space-y-1.5">
        {!photos.length && (
          <Conseil>
            Ajoutez une photo — c'est ce qui fait s'arrêter dans le fil.
          </Conseil>
        )}
        {!lieu && <Conseil>Taguez le lieu : le récit remontera sur sa page.</Conseil>}
        {!plat && (
          <Conseil icone>
            Taguez un plat, il rejoindra l'atlas culinaire.
          </Conseil>
        )}
        {long && (
          <Conseil>
            Les {SEUIL_TEXTE} premiers caractères décident si on lit la suite :
            mettez l'essentiel devant.
          </Conseil>
        )}
      </ul>
    </aside>
  );
}

function Conseil({ children, icone }: { children: React.ReactNode; icone?: boolean }) {
  return (
    <li className="flex gap-2 rounded-xl bg-secondary px-3 py-2 text-xs leading-relaxed">
      {icone ? (
        <UtensilsCrossed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-strong" aria-hidden="true" />
      ) : (
        <span className="mt-0.5 shrink-0 text-primary" aria-hidden="true">
          ·
        </span>
      )}
      <span>{children}</span>
    </li>
  );
}
