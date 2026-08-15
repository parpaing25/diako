<?php
/**
 * PARTAGE.PHP — L'APERÇU RICHE POUR LES ROBOTS DE PARTAGE
 *
 * 🔴 CE QUE ÇA CORRIGE. Diako est une application monopage : les métadonnées de
 *    chaque fiche sont posées par `useSEO` dans un effet React. Un robot qui
 *    n'exécute pas JavaScript — et c'est le cas de TOUS les robots de partage —
 *    ne voit donc jamais que les métas génériques de index.html. Coller
 *    « /p/kavitaha-hotel » dans une conversation WhatsApp affichait
 *    « Diako — Voyage & tourisme à Madagascar », pour les 220 URL du sitemap.
 *
 *    Sur ce marché, WhatsApp et Messenger SONT le canal d'acquisition. Un lien
 *    qui n'affiche ni le nom de l'hôtel ni sa photo ne se clique pas.
 *
 * ⚠ POURQUOI PHP ET PAS UN RENDU SERVEUR. o2switch est un hébergement mutualisé
 *   sans Node. `sitemap.php` prouve depuis des mois que PHP + l'API REST en clé
 *   anonyme fonctionne ici. Même mécanique, même clé, même coût : zéro.
 *
 * ⚠ SEULS LES ROBOTS PASSENT PAR ICI. Le `.htaccess` n'y route que les agents
 *   de partage connus ; un humain reçoit l'application intacte. On ne sert
 *   jamais deux contenus différents pour tromper un moteur — c'est la même
 *   information, dans un format que le robot sait lire. Google est
 *   volontairement EXCLU de la redirection : il exécute le JavaScript, et lui
 *   servir une page distincte serait du cloaking.
 *
 * ⚠ LA CLÉ ANONYME EST PUBLIQUE PAR NATURE — elle est déjà dans le paquet
 *   JavaScript du site. La sécurité repose entièrement sur la RLS, qui ne laisse
 *   lire que ce qui est publié.
 */

$base    = 'https://diako.fonenako.mg';
$sbUrl   = 'https://eifrwecaszzqrdwjjjbu.supabase.co';
$anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZnJ3ZWNhc3p6cXJkd2pqamJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTM5OTYsImV4cCI6MjA3MDAyOTk5Nn0.Ks8epc1CiOyj7Y4AYGL9zRHHoZscQJ7_nWbqwMNcVMQ';
$headers = ['apikey: ' . $anonKey, 'Authorization: Bearer ' . $anonKey];

/** Image de repli : la bannière 1200×630, JAMAIS le logo carré — un logo
 *  s'affiche rogné dans une vignette WhatsApp et ne dit rien du contenu. */
$OG_DEFAUT = $base . '/media/og-diako.jpg';

header('Content-Type: text/html; charset=utf-8');
// Un robot repasse : une heure de cache suffit et évite de marteler l'API.
header('Cache-Control: public, max-age=3600');

function lire(string $url, array $headers): array {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 6,   // Un robot n'attend pas : mieux vaut
        CURLOPT_CONNECTTIMEOUT => 3,   // le repli générique qu'un délai.
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ($code === 200 && $res) ? (json_decode($res, true) ?: []) : [];
}

$e = fn(?string $s) => htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8');

/** Coupe proprement, sur un mot, pour une vignette de partage. */
function extrait(?string $t, int $max = 200): string {
    $t = trim(preg_replace('/\s+/u', ' ', (string) $t));
    if ($t === '' || mb_strlen($t) <= $max) return $t;
    $c = mb_substr($t, 0, $max);
    $p = mb_strrpos($c, ' ');
    return ($p !== false ? mb_substr($c, 0, $p) : $c) . '…';
}

/** Formate un montant comme le site : « 93 000 Ar », espace insécable fine. */
function ariary($n): string {
    if ($n === null || $n === '') return '';
    return number_format((float) $n, 0, ',', ' ') . ' Ar';
}

/* ── Quelle page ? ───────────────────────────────────────────────────────── */
$chemin = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$chemin = rtrim($chemin, '/') ?: '/';
$url    = $base . ($chemin === '/' ? '/' : $chemin);

$titre = 'Diako — Voyage & tourisme à Madagascar';
$desc  = "Où dormir, où manger et avec qui partir à Madagascar. Hôtels, restaurants et agences, avec leurs vrais tarifs.";
$image = $OG_DEFAUT;
$type  = 'website';

/* ⚠ ON N'INVENTE RIEN ICI NON PLUS. Si la fiche n'a pas de prix, la description
   n'en porte pas ; si elle n'a pas de photo, on retombe sur la bannière. Une
   vignette de partage qui promet un tarif inexistant est un mensonge de plus
   grande portée qu'un écran, parce qu'elle circule sans le site autour. */

if (preg_match('#^/p/([a-z0-9\-]+)$#i', $chemin, $m)) {
    $r = lire($sbUrl . '/rest/v1/pages?slug=eq.' . urlencode($m[1])
              . '&is_published=eq.true&select=name,short_desc,cover_url,price_min_ar,price_min_unit'
              . ',place:places(name_fr)&limit=1', $headers);
    if ($r) {
        $f     = $r[0];
        $lieu  = $f['place']['name_fr'] ?? null;
        $titre = $f['name'] . ($lieu ? ' — ' . $lieu : '') . ' · Diako';
        $prix  = !empty($f['price_min_ar']) ? ' À partir de ' . ariary($f['price_min_ar']) . '.' : '';
        $desc  = extrait($f['short_desc'] ?: (($f['name'] ?? '') . ($lieu ? ' à ' . $lieu : '')
                 . '. Coordonnées, tarifs et avis sur Diako.')) . $prix;
        if (!empty($f['cover_url'])) $image = $f['cover_url'];
        $type  = 'article';
    }
} elseif (preg_match('#^/lieu/([a-z0-9\-]+)$#i', $chemin, $m)) {
    $r = lire($sbUrl . '/rest/v1/places?slug=eq.' . urlencode($m[1])
              . '&select=name_fr,region,summary&limit=1', $headers);
    if ($r) {
        $l     = $r[0];
        $titre = $l['name_fr'] . ' — où dormir et où manger · Diako';
        $desc  = extrait($l['summary'] ?: ($l['name_fr']
                 . ($l['region'] ? ' (' . $l['region'] . ')' : '')
                 . ' : hébergements, tables et accès réels depuis Antananarivo.'));
    }
} elseif (preg_match('#^/plat/([a-z0-9\-]+)$#i', $chemin, $m)) {
    $r = lire($sbUrl . '/rest/v1/dishes?slug=eq.' . urlencode($m[1])
              . '&select=name_fr,description,photo_url,family&limit=1', $headers);
    if ($r) {
        $p     = $r[0];
        $titre = $p['name_fr'] . ' — où en manger à Madagascar · Diako';
        $desc  = extrait($p['description'] ?: ($p['name_fr']
                 . ' : où en manger à Madagascar, avec le prix chez chacun.'));
        if (!empty($p['photo_url'])) $image = $p['photo_url'];
        $type  = 'article';
    }
} elseif (preg_match('#^/post/([0-9a-f\-]{36})$#i', $chemin, $m)) {
    $r = lire($sbUrl . '/rest/v1/posts?id=eq.' . urlencode($m[1])
              . '&status=eq.published&select=body,place,dish,media&limit=1', $headers);
    if ($r) {
        $p     = $r[0];
        $lieu  = $p['place'] ?? null;
        $titre = ($lieu ? $lieu . ' — récit de voyage' : 'Récit de voyage') . ' · Diako';
        $desc  = extrait($p['body'] ?: 'Un récit de voyage à Madagascar.');
        // `media` est un tableau JSON d'objets {url, w, h}.
        if (!empty($p['media'][0]['url'])) $image = $p['media'][0]['url'];
        $type  = 'article';
    }
} elseif ($chemin === '/quand-partir') {
    $titre = 'Quand partir à Madagascar — mois par mois, destination par destination';
    $desc  = "Pour chaque destination, les mois idéaux, corrects et déconseillés — avec la raison. Baleines, pluies, pistes coupées.";
} elseif ($chemin === '/y-aller') {
    $titre = 'Y aller — les temps de route réels à Madagascar';
    $desc  = "46 km/h sur goudron, 23 sur piste, 14 en 4×4. Distances et durées relevées sur le terrain, pas calculées.";
} elseif ($chemin === '/plats') {
    $titre = 'Atlas des plats malgaches — 95 plats et où les trouver';
    $desc  = "Chaque plat avec ses variantes d'orthographe, ses ingrédients, sa famille et sa région.";
} elseif ($chemin === '/explorer') {
    $titre = 'Explorer Madagascar — 178 destinations · Diako';
    $desc  = "Les destinations de Madagascar, avec leur saisonnalité, leurs accès réels et les adresses qui s'y trouvent.";
} elseif ($chemin === '/carte') {
    $titre = 'La carte des hôtels et restaurants de Madagascar · Diako';
    $desc  = "Trouvez sur la carte les adresses de Madagascar, avec leurs tarifs en ariary.";
}

?><!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title><?= $e($titre) ?></title>
<meta name="description" content="<?= $e($desc) ?>" />
<link rel="canonical" href="<?= $e($url) ?>" />

<meta property="og:type" content="<?= $e($type) ?>" />
<meta property="og:site_name" content="Diako" />
<meta property="og:locale" content="fr_FR" />
<meta property="og:url" content="<?= $e($url) ?>" />
<meta property="og:title" content="<?= $e($titre) ?>" />
<meta property="og:description" content="<?= $e($desc) ?>" />
<meta property="og:image" content="<?= $e($image) ?>" />
<?php if ($image === $OG_DEFAUT): /* Dimensions connues seulement pour la bannière. */ ?>
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<?php endif; ?>

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="<?= $e($titre) ?>" />
<meta name="twitter:description" content="<?= $e($desc) ?>" />
<meta name="twitter:image" content="<?= $e($image) ?>" />

<!-- Un humain qui atterrirait ici par accident rejoint le vrai site. -->
<meta http-equiv="refresh" content="0; url=<?= $e($url) ?>" />
</head>
<body>
<h1><?= $e($titre) ?></h1>
<p><?= $e($desc) ?></p>
<p><a href="<?= $e($url) ?>">Ouvrir sur Diako</a></p>
</body>
</html>
