/**
 * La provenance d'un récit repris de Facebook, en une ligne courte :
 *   « Vu sur Facebook — Andri.matel le 23/08/2026 » → « Andri.matel · 23/08 · via Facebook »
 *
 * 🔴 POURQUOI (18/09/2026). L'auteur n'apparaissait qu'EN BAS de la carte, en
 *    13 px, après la photo, les tags et le repère : on lisait un récit sans
 *    savoir qui parlait. La ligne passe sous le titre, et elle commence par la
 *    personne — c'est elle qui compte, pas le réseau d'où vient le texte.
 *
 * ⚠ RIEN N'EST INVENTÉ. La ligne vient de `posts.body` (écrite par le bot,
 *   `bot-diako/bot/redaction.py`, `ligne_source`) ou, à défaut, de la colonne
 *   `page_name`. Sans l'une ni l'autre : `null`, et la carte n'affiche rien.
 * ⚠ L'ANNÉE N'EST GARDÉE QUE SI CE N'EST PAS L'ANNÉE EN COURS : « 23/08 »
 *   d'un récit de l'an dernier le ferait passer pour frais.
 * ⚠ Une ligne dont le format n'est pas reconnu est rendue telle quelle : on ne
 *   perd jamais la provenance pour une question de mise en forme.
 */
/* ⚠ L'AUTEUR EST FACULTATIF : le nettoyage du bruit Facebook
   (src/lib/etablissements.ts) réduit « Vu sur Facebook — Indicateur de statut
   En ligne le 25/08/2026 » à « Vu sur Facebook le 25/08/2026 ». */
const LIGNE_SOURCE =
  /^Vu sur Facebook(?:\s*[—–-]\s*(.+?))?(?:\s+le\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?)?\s*$/;

export function provenanceCourte(
  source: string | null | undefined,
  pageName: string | null | undefined
): string | null {
  if (source) {
    const m = LIGNE_SOURCE.exec(source.trim());
    if (!m) return source.trim();
    const qui = m[1]?.trim() || null;
    let quand: string | null = null;
    if (m[2] && m[3]) {
      quand = `${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
      if (m[4] && Number(m[4]) !== new Date().getFullYear()) quand += `/${m[4]}`;
    }
    return [qui, quand, "via Facebook"].filter(Boolean).join(" · ");
  }
  const page = pageName?.trim();
  return page ? `${page} · via Facebook` : null;
}
