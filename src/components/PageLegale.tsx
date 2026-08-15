import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * L'ENVELOPPE DES PAGES LÉGALES — gabarit G2.
 *
 * ⚠ LE SOMMAIRE EST CONSTRUIT DEPUIS LE DOM, pas déclaré à la main. Les CGU, la
 *   confidentialité et les mentions sont des textes qu'on modifie : un sommaire
 *   écrit en dur diverge à la première section ajoutée, et un sommaire faux sur
 *   un document qui engage Diako est pire que pas de sommaire du tout.
 *
 * ⚠ LE TEXTE RESTE À SA LARGEUR DE LECTURE. Ce qui change avec l'écran, c'est
 *   l'apparition du sommaire à côté — pas la longueur des lignes.
 *
 * ⚠ LES IDENTIFIANTS SONT POSÉS ICI, sur les titres qui n'en ont pas. Sans eux
 *   les ancres ne mènent nulle part, et un lien vers « article 6 » envoyé par
 *   courriel retomberait en haut de page.
 */
export function PageLegale({
  titre,
  majLe,
  children,
}: {
  titre: string;
  /** Date de dernière modification, au format lisible. */
  majLe?: string;
  children: React.ReactNode;
}) {
  const zone = useRef<HTMLElement>(null);
  const [sections, setSections] = useState<{ id: string; texte: string }[]>([]);
  const [actif, setActif] = useState<string | null>(null);

  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const titres = Array.from(el.querySelectorAll("h2"));
    const liste = titres.map((h, i) => {
      // Un identifiant stable, lisible, et qui survit à une reformulation
      // mineure : on garde le rang en préfixe.
      const id =
        h.id ||
        `s${i + 1}-` +
          (h.textContent ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40);
      h.id = id;
      h.style.scrollMarginTop = "5rem";
      return { id, texte: h.textContent ?? "" };
    });
    setSections(liste);

    // ⚠ Un seul observateur pour tous les titres. Un par section serait
    //   inutilement coûteux sur un Android d'entrée de gamme.
    const obs = new IntersectionObserver(
      (entrees) => {
        const vu = entrees.filter((e) => e.isIntersecting).sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
        )[0];
        if (vu) setActif(vu.target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" }
    );
    titres.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [children]);

  return (
    <div className="px-4 py-8 xl:flex xl:items-start xl:justify-center xl:gap-8">
      {/* ── Le sommaire, à partir de xl ─────────────────────────────────── */}
      <nav
        aria-label="Sommaire"
        className="sticky top-20 hidden h-fit w-64 shrink-0 xl:block"
      >
        <p className="dk-etiquette">Sommaire</p>
        <ul className="mt-2 space-y-0.5 border-l border-border">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={actif === s.id ? "true" : undefined}
                className={cn(
                  "-ml-px block border-l-2 py-1.5 pl-3 text-sm transition",
                  actif === s.id
                    ? "border-primary font-medium text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                {s.texte}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article
        ref={zone}
        className="prose prose-sm mx-auto max-w-2xl dark:prose-invert xl:mx-0 xl:shrink-0"
      >
        <h1>{titre}</h1>
        {children}
        {majLe && (
          <p className="text-xs text-muted-foreground">Dernière mise à jour : {majLe}.</p>
        )}
      </article>

      {/* ⚠ L'HISTORIQUE N'EST PAS INVENTÉ. Le design final prévoit une colonne
          de versions à 1920 px ; aucun historique n'est conservé en base. On
          affiche donc ce qui est vrai — la date de la version en cours et
          l'engagement de prévenir — plutôt qu'une liste fabriquée. */}
      <aside className="mt-8 hidden shrink-0 large:sticky large:top-20 large:mt-0 large:block large:w-60">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="dk-etiquette">Cette version</p>
          <p className="dk-secondaire mt-2 leading-relaxed">
            {majLe ? `En vigueur depuis le ${majLe}.` : "Version en cours."} Aucun
            historique n'est publié pour l'instant : à la prochaine modification,
            les comptes existants seront prévenus avant qu'elle s'applique.
          </p>
        </div>
      </aside>
    </div>
  );
}
