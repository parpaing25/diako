/**
 * Console d'administration — `/admin`.
 *
 * Calquée sur `AdminDashboard.tsx` de Fonenako : onglet actif porté par l'URL,
 * pastilles scrollables, un composant par onglet, la page ne fait que router.
 * Adaptée au voyage — rien de l'immobilier n'est repris (recharges, KYC,
 * affiliation), et rien de shadcn/ui non plus : les 34 pages de Diako sont
 * écrites en Tailwind à la main, une console qui tirerait Radix pour un seul
 * écran ne ressemblerait à aucune autre.
 *
 * 🔴 CE QUE CET ÉCRAN NE FAIT PAS : PROTÉGER QUOI QUE CE SOIT. `jeSuisAdmin()`
 *    décide d'afficher la console ou une porte fermée, rien de plus. Le vrai
 *    contrôle est en base : chaque RPC appelée par les onglets commence par
 *    `if not public.is_admin() then raise` (migrations 0097 et 0098), et
 *    `is_admin()` reconnaît `contact.diako@gmail.com` par l'e-mail vérifié de
 *    `auth.uid()`. La clé anonyme du projet est publique par construction :
 *    n'importe qui peut appeler ces RPC à la main, et se fera refuser par le
 *    serveur. Un `if` en React n'est pas un contrôle d'accès.
 */

import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  FileText,
  Images,
  ShieldCheck,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSEO } from "@/hooks/useSEO";
import { jeSuisAdmin } from "@/lib/admin";
import { cn } from "@/lib/utils";
import Statistiques from "@/components/admin/Statistiques";
import Publications from "@/components/admin/Publications";
import Membres from "@/components/admin/Membres";
import Promos from "@/components/admin/Promos";

/**
 * ⚠ SEUL ONGLET EN CHARGEMENT PARESSEUX. Il embarque la compression d'image et
 *   le téléversement o2switch, dont les quatre autres n'ont aucun besoin.
 *   Fonenako fait le même geste pour `recharts` (422 Ko) : on ne fait pas payer
 *   à l'ouverture ce qui ne sert qu'à un onglet sur cinq.
 */
const Photos = lazy(() => import("@/components/admin/Photos"));

type Cle = "chiffres" | "publications" | "photos" | "membres" | "promos";

const ONGLETS: { cle: Cle; label: string; icone: LucideIcon }[] = [
  { cle: "chiffres", label: "Chiffres", icone: BarChart3 },
  { cle: "publications", label: "Publications", icone: FileText },
  { cle: "photos", label: "Photos", icone: Images },
  { cle: "membres", label: "Membres", icone: Users },
  { cle: "promos", label: "Codes promo", icone: Ticket },
];

const PAR_DEFAUT: Cle = "chiffres";

export default function Admin() {
  useSEO({ titre: "Console d'administration", noindex: true });
  const { user, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const [acces, setAcces] = useState<"chargement" | "ok" | "refus">("chargement");

  /**
   * ⚠ L'ONGLET VIT DANS L'URL, comme chez Fonenako. Le geste retour — bouton
   *   Android, balayage — remonte alors d'onglet en onglet au lieu de quitter
   *   la console d'un coup, ce qui est la déception la plus banale d'un écran
   *   à onglets sur téléphone.
   */
  const demande = params.get("tab");
  const actif: Cle = ONGLETS.some((o) => o.cle === demande) ? (demande as Cle) : PAR_DEFAUT;

  const changer = (cle: Cle) => {
    if (cle === actif) return;
    // PUSH et non REPLACE : chaque onglet est une étape d'historique.
    setParams((prev) => {
      const suivant = new URLSearchParams(prev);
      suivant.set("tab", cle);
      return suivant;
    });
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAcces("refus");
      return;
    }
    let vivant = true;
    void jeSuisAdmin().then((oui) => {
      if (vivant) setAcces(oui ? "ok" : "refus");
    });
    return () => {
      vivant = false;
    };
  }, [authLoading, user]);

  if (authLoading || acces === "chargement") {
    return (
      <div className="space-y-3 px-4 py-6">
        <div className="dk-skeleton h-8 w-1/2" />
        <div className="dk-skeleton h-10 w-full rounded-full" />
        <div className="dk-skeleton h-64 w-full rounded-2xl" />
      </div>
    );
  }

  /**
   * ⚠ ON REFUSE, ON NE REDIRIGE PAS, ET ON NE DIT PAS POURQUOI. Rediriger vers
   *   l'accueil laisse croire à un lien mort. Écrire « seul
   *   contact.diako@gmail.com peut entrer » nommerait le compte à viser à toute
   *   personne qui tape l'adresse au hasard. On dit le strict nécessaire.
   */
  if (acces === "refus") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
          <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-semibold">Cet espace est réservé</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {user
            ? "Votre compte n'a pas accès à l'administration de Diako."
            : "Connectez-vous avec le compte d'administration."}
        </p>
        <Link
          to={user ? "/" : "/auth"}
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          {user ? "Retour à l'accueil" : "Se connecter"}
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-5">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
        </span>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">Administration</h1>
      </div>

      {/* ⚠ PASTILLES SCROLLABLES. Cinq onglets ne tiennent pas sur 390 px ; le
          défilement horizontal est la seule mise en page qui ne les écrase ni
          ne les empile. Les marges négatives laissent le premier et le dernier
          se coller au bord pendant le défilement. */}
      <div
        role="tablist"
        aria-label="Sections de l'administration"
        className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {ONGLETS.map((o) => {
          const Icone = o.icone;
          const choisi = o.cle === actif;
          return (
            <button
              key={o.cle}
              role="tab"
              aria-selected={choisi}
              onClick={() => changer(o.cle)}
              className={cn(
                "dk-tap inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm",
                choisi
                  ? "border-primary bg-primary font-medium text-primary-foreground"
                  : "border-input"
              )}
            >
              <Icone className="h-4 w-4" aria-hidden="true" />
              {o.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {actif === "chiffres" ? <Statistiques /> : null}
        {actif === "publications" ? <Publications /> : null}
        {actif === "photos" ? (
          <Suspense fallback={<div className="dk-skeleton h-64 w-full rounded-2xl" />}>
            <Photos />
          </Suspense>
        ) : null}
        {actif === "membres" ? <Membres /> : null}
        {actif === "promos" ? <Promos /> : null}
      </div>
    </div>
  );
}
