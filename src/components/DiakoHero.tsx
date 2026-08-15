import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Map as MapIcon, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";
import { SearchBar } from "@/components/SearchBar";
import { CATEGORIES } from "@/lib/categories";
import { chargerDestinations, type Lieu } from "@/lib/etablissements";

/**
 * Bandeau d'accueil — transposition directe de HeroSection de Fonenako.
 *
 * On reprend son langage visuel, qui fonctionne : salutation personnalisée,
 * recherche, carrousel horizontal, puis « stories » de catégories en pastilles
 * dégradées. Le contenu passe de l'immobilier au voyage.
 *
 * Le carrousel de destinations est alimenté par le référentiel `places` :
 * ce sont de vrais lieux, classés par le nombre de récits publiés. Les
 * vignettes mènent à la fiche de destination, qui dit honnêtement combien
 * d'établissements y sont rattachés — zéro compris.
 */
export function DiakoHero({
  categorie,
  onCategorie,
}: {
  categorie: string;
  onCategorie: (k: string) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useUserData();

  const prenom = profile?.display_name?.split(" ")[0];

  const [destinations, setDestinations] = useState<Lieu[]>([]);
  useEffect(() => {
    void chargerDestinations(12).then(setDestinations).catch(() => undefined);
  }, []);

  return (
    /* 🔴 CORRIGE : ce bandeau portait encore `.dk-colonne`, qui le bridait a
       620 px. Le fil en dessous a ete libere au passage a la coque v4, pas lui :
       sur un ecran large, l'entete et les regions s'arretaient au tiers de la
       zone de contenu, avec un vide a leur droite — precisement le vide que
       l'elargissement devait supprimer.
       ⚠ La colonne de LECTURE reste bornee la ou on lit vraiment : un recit
         ouvert, une page legale. Un bandeau n'est pas de la lecture longue,
         c'est une banniere — elle occupe la largeur qu'on lui donne. Ce qui a
         besoin d'une longueur de ligne lisible (le titre, le sous-titre) la
         garde par son propre `max-w`, ligne par ligne. */
    <section className="px-4 pt-4">
      {/* 🔴 LE BANDEAU D'ACCUEIL ET « RÉGIONS ACTIVES » SONT SUPPRIMÉS.
          Andry, capture à l'appui : « tout de suite on démarre sur le filtre ».
          Deux raisons de fond, au-delà du goût :

          ① C'ÉTAIT UN DOUBLON. « Régions actives cette semaine » répétait le
            bloc « En vogue cette semaine » du rail de droite, à deux cents
            pixels de distance et avec le même classement. Le rail le fait
            mieux : il reste visible pendant qu'on lit le fil.

          ② UN RÉSEAU SOCIAL NE SE PRÉSENTE PAS, IL MONTRE. Facebook ouvre sur
            le composeur et le fil ; personne n'y lit une accroche. Six cents
            pixels de titre et de recherche repoussaient la première
            publication sous la ligne de flottaison — sur l'écran même qui
            porte tout le contenu du produit.

          ⚠ La recherche n'est PAS perdue : elle est dans l'en-tête, sur toutes
            les pages. C'est précisément pour ça qu'on peut retirer celle-ci. */}

      {/* ── Catégories en pastilles (les « stories » de Fonenako) ───────── */}
      <div
        className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-2 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Catégories"
      >
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const actif = categorie === cat.key;
          return (
            <button
              key={cat.key}
              role="tab"
              aria-selected={actif}
              onClick={() => onCategorie(cat.key)}
              className={`flex shrink-0 flex-col items-center gap-1.5 transition-all duration-200 ${
                actif ? "scale-105" : "opacity-70 hover:opacity-100"
              }`}
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-200 md:h-16 md:w-16 ${
                  actif
                    ? `bg-gradient-to-br ${cat.color} shadow-lg ring-2 ring-primary/30 ring-offset-2 ring-offset-background`
                    : "border border-border bg-card shadow-sm hover:shadow-md"
                }`}
              >
                <Icon
                  className={`h-6 w-6 md:h-7 md:w-7 ${actif ? "text-primary-foreground" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
              </span>
              <span
                className={`text-[10px] font-medium md:text-xs ${
                  actif ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
