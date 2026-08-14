<?php
/**
 * SITEMAP DE DIAKO — généré depuis la base, pas écrit à la main.
 *
 * ⚠ CE QUE ÇA CORRIGE. sitemap.xml était STATIQUE et ne listait que quatre
 *   URL : l'accueil et trois pages légales. Les 178 destinations et les
 *   54 établissements référencés n'y figuraient pas — donc Google ne savait
 *   pas qu'ils existaient. Pour un annuaire, c'est le pire défaut possible :
 *   tout le travail de saisie reste invisible.
 *
 * Transcrit du sitemap.php de Fonenako, avec trois différences :
 *
 *  ① SITEMAP D'IMAGES. Les récits de voyage portent 4 à 12 photos chacun et
 *    c'est le contenu le plus partageable du site. On les déclare pour Google
 *    Images, qui est un canal d'entrée réel sur une requête « Ampefy ».
 *
 *  ② PAS D'URL SANS CONTENU. Une destination sans établissement NI récit est
 *    une page vide : la soumettre fait baisser la qualité perçue du domaine.
 *    On la garde hors du sitemap jusqu'à ce qu'elle ait quelque chose à dire.
 *    Google la trouvera de toute façon par le maillage interne d'Explorer.
 *
 *  ③ LASTMOD RÉEL. Fonenako met la date du jour sur les pages statiques, ce
 *    qui apprend à Google que la date ne veut rien dire. Ici, les pages fixes
 *    portent leur vraie date de dernière modification.
 *
 * La clé « anon » est publique par nature — elle est déjà dans le bundle du
 * site. La sécurité repose entièrement sur la RLS.
 */

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');

$base     = 'https://diako.fonenako.mg';
$sbUrl    = 'https://eifrwecaszzqrdwjjjbu.supabase.co';
$anonKey  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZnJ3ZWNhc3p6cXJkd2pqamJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTM5OTYsImV4cCI6MjA3MDAyOTk5Nn0.Ks8epc1CiOyj7Y4AYGL9zRHHoZscQJ7_nWbqwMNcVMQ';
$headers  = ['apikey: ' . $anonKey, 'Authorization: Bearer ' . $anonKey];

function lire(string $url, array $headers): array {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ($code === 200 && $res) ? (json_decode($res, true) ?: []) : [];
}

$e = fn(?string $s) => htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8');
$jour = fn(?string $iso) => $iso ? substr($iso, 0, 10) : date('Y-m-d');

/* ── Pages fixes ─────────────────────────────────────────────────────────── */
$fixes = [
    ['/',                 '1.0', 'daily',   '2026-08-01'],
    ['/explorer',         '0.9', 'weekly',  '2026-08-01'],
    ['/recherche',        '0.8', 'weekly',  '2026-08-01'],
    ['/pro',              '0.6', 'monthly', '2026-08-01'],
    ['/mentions',         '0.2', 'yearly',  '2026-07-31'],
    ['/cgu',              '0.2', 'yearly',  '2026-07-31'],
    ['/confidentialite',  '0.2', 'yearly',  '2026-07-31'],
];

/* ── Données réelles ─────────────────────────────────────────────────────── */
$lieux = lire(
    $sbUrl . '/rest/v1/places?select=slug,name_fr,nb_pages,nb_posts,is_touristique'
           . '&is_touristique=eq.true&order=nb_pages.desc&limit=500',
    $headers
);

$fiches = lire(
    $sbUrl . '/rest/v1/pages?select=slug,updated_at,cover_url,name,completeness'
           . '&is_published=eq.true&order=updated_at.desc&limit=5000',
    $headers
);

$recits = lire(
    $sbUrl . '/rest/v1/posts?select=id,body,media,created_at,place'
           . '&status=eq.published&order=created_at.desc&limit=2000',
    $headers
);

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' . "\n";
echo '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' . "\n";

foreach ($fixes as [$url, $prio, $freq, $maj]) {
    echo "  <url>\n";
    echo "    <loc>{$base}{$url}</loc>\n";
    echo "    <lastmod>{$maj}</lastmod>\n";
    echo "    <changefreq>{$freq}</changefreq>\n";
    echo "    <priority>{$prio}</priority>\n";
    echo "  </url>\n";
}

// Destinations — uniquement celles qui ont quelque chose à montrer.
foreach ($lieux as $l) {
    $vide = (int)($l['nb_pages'] ?? 0) === 0 && (int)($l['nb_posts'] ?? 0) === 0;
    if ($vide) continue;
    echo "  <url>\n";
    echo "    <loc>{$base}/explorer?lieu=" . $e($l['slug']) . "</loc>\n";
    echo "    <lastmod>" . date('Y-m-d') . "</lastmod>\n";
    echo "    <changefreq>weekly</changefreq>\n";
    echo "    <priority>0.8</priority>\n";
    echo "  </url>\n";
}

// Établissements — la priorité suit la complétude : une fiche renseignée
// mérite d'être explorée plus souvent qu'un nom et un numéro.
foreach ($fiches as $f) {
    $c = (int)($f['completeness'] ?? 0);
    $prio = $c >= 75 ? '0.9' : ($c >= 50 ? '0.7' : '0.5');
    echo "  <url>\n";
    echo "    <loc>{$base}/p/" . $e($f['slug']) . "</loc>\n";
    echo "    <lastmod>" . $jour($f['updated_at'] ?? null) . "</lastmod>\n";
    echo "    <changefreq>weekly</changefreq>\n";
    echo "    <priority>{$prio}</priority>\n";
    if (!empty($f['cover_url'])) {
        echo "    <image:image>\n";
        echo "      <image:loc>" . $e($f['cover_url']) . "</image:loc>\n";
        echo "      <image:title>" . $e($f['name']) . "</image:title>\n";
        echo "    </image:image>\n";
    }
    echo "  </url>\n";
}

// Récits — avec leurs photos pour Google Images.
foreach ($recits as $r) {
    $medias = is_array($r['media'] ?? null) ? $r['media'] : [];
    $titre  = trim(mb_substr((string)($r['body'] ?? ''), 0, 90));
    if ($titre === '') $titre = 'Récit de voyage' . (!empty($r['place']) ? ' — ' . $r['place'] : '');

    echo "  <url>\n";
    echo "    <loc>{$base}/post/" . $e($r['id']) . "</loc>\n";
    echo "    <lastmod>" . $jour($r['created_at'] ?? null) . "</lastmod>\n";
    echo "    <changefreq>monthly</changefreq>\n";
    echo "    <priority>0.6</priority>\n";
    // Google plafonne à 1 000 images par URL ; on se limite à 8, qui est déjà
    // au-delà de ce qu'il indexe réellement pour une page de ce type.
    foreach (array_slice($medias, 0, 8) as $m) {
        $u = is_array($m) ? ($m['url'] ?? '') : '';
        if (!$u) continue;
        echo "    <image:image>\n";
        echo "      <image:loc>" . $e($u) . "</image:loc>\n";
        echo "      <image:title>" . $e($titre) . "</image:title>\n";
        echo "    </image:image>\n";
    }
    echo "  </url>\n";
}

echo '</urlset>' . "\n";
