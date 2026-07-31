import { supabase } from "@/integrations/supabase/client";

/**
 * Drapeaux applicatifs lus EN BASE (table app_flags).
 *
 * Motif repris de Fonenako : le jour où les identifiants OAuth Google sont
 * configurés, une seule ligne SQL ouvre le bouton — sans rebuild ni redéploiement :
 *   update app_flags set actif = true where cle = 'google_login';
 *
 * Mise en cache pour la session : ces drapeaux changent une fois par trimestre,
 * il est hors de question de payer une requête par montage de composant.
 */
const cache = new Map<string, boolean>();
let pending: Promise<void> | null = null;

async function loadAll(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    const { data } = await supabase.from("app_flags").select("cle,actif");
    for (const row of data ?? []) cache.set(row.cle, row.actif);
  })();
  return pending;
}

export async function flagActif(cle: string, repli = false): Promise<boolean> {
  try {
    await loadAll();
    return cache.get(cle) ?? repli;
  } catch {
    return repli;
  }
}
