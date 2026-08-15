import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bookmark, LogOut, Settings, Store, User, UtensilsCrossed } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";

/**
 * LE MENU DE L'AVATAR — comme sur Fonenako.
 *
 * 🔴 CE QUE ÇA REMPLACE. L'avatar était un lien direct vers `/compte`. Pour se
 *    déconnecter ou changer un réglage, il fallait donc charger tout l'espace
 *    compte : deux écrans sur une 3G pour un geste d'un seul.
 *
 * ⚠ CINQ ENTRÉES, PAS QUINZE. Le rail latéral porte déjà le produit ; ce menu
 *   ne porte que ce qui concerne LA PERSONNE — son espace, ses affaires, sa
 *   sortie. Y remettre les destinations et les plats recréerait le doublon
 *   qu'on est en train de supprimer.
 *
 * ⚠ « ESPACE PRO » N'APPARAÎT QUE POUR UN PRO. Un voyageur n'a rien à y faire,
 *   et la règle du projet interdit une entrée vers un écran qui ne le concerne
 *   pas. Elle reste dans le rail pour qui veut la découvrir.
 *
 * ⚠ ÉCHAP ET CLIC DEHORS FERMENT. Un menu qu'on ne peut fermer qu'en
 *   rechoisissant une entrée piège l'utilisateur au clavier.
 */
export function MenuCompte({ ouvert, onFermer }: { ouvert: boolean; onFermer: () => void }) {
  const { signOut } = useAuth();
  const { profile } = useUserData();
  const navigate = useNavigate();
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent) => {
      if (!boite.current?.contains(e.target as Node)) onFermer();
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    // ⚠ `mousedown` et non `click` : le bouton qui a ouvert le menu recevrait
    //   sinon son propre `click` et le refermerait aussitôt.
    document.addEventListener("mousedown", surClic);
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("mousedown", surClic);
      document.removeEventListener("keydown", surTouche);
    };
  }, [ouvert, onFermer]);

  if (!ouvert) return null;

  const entrees = [
    { to: "/compte", label: "Mon compte", icon: User },
    { to: "/favoris", label: "Mon carnet", icon: Bookmark },
    { to: "/gouts", label: "Mon carnet de goûts", icon: UtensilsCrossed },
    ...(profile?.account_type === "pro"
      ? [{ to: "/pro", label: "Espace pro", icon: Store }]
      : []),
    { to: "/parametres", label: "Paramètres", icon: Settings },
  ];

  return (
    <div
      ref={boite}
      role="menu"
      aria-label="Mon compte"
      className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
    >
      <div className="border-b border-border px-4 py-3">
        <p className="truncate text-sm font-semibold">
          {profile?.display_name || "Mon compte"}
        </p>
        {/* ⚠ Le métier plutôt que l'e-mail : l'adresse n'apprend rien à son
            propriétaire, et elle traîne à l'écran devant qui regarde. */}
        <p className="dk-secondaire truncate">
          {profile?.account_type === "pro" ? "Compte professionnel" : "Voyageur"}
        </p>
      </div>

      <ul className="py-1">
        {entrees.map(({ to, label, icon: Icone }) => (
          <li key={to}>
            <Link
              to={to}
              role="menuitem"
              onClick={onFermer}
              className="flex min-h-11 items-center gap-3 px-4 text-sm hover:bg-muted"
            >
              <Icone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="border-t border-border py-1">
        <button
          role="menuitem"
          onClick={() => {
            onFermer();
            void signOut().then(() => navigate("/"));
          }}
          className="flex min-h-11 w-full items-center gap-3 px-4 text-sm text-muted-foreground hover:bg-muted"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
