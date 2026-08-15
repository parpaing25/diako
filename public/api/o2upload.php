<?php
// public/api/o2upload.php
// Secure upload endpoint — supports:
//   1. Multipart form-data (direct file upload)
//   2. JSON base64 (legacy)
// Auth: Bearer JWT (Supabase) or X-API-Key

// Secrets serveur (O2SWITCH_UPLOAD_API_KEY...) depuis ~/.env_diako (variable serveur, JAMAIS dans le depot)
require_once __DIR__ . '/env.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(200);
  echo json_encode(['ok' => true]);
  exit;
}

function respond($status, $payload) {
  http_response_code($status);
  echo json_encode($payload);
  exit;
}

// Génère une miniature WebP (max $maxDim px) à partir de $src vers $dst. Best-effort.
function fnk_generate_thumb($src, $dst, $maxDim = 480, $quality = 72) {
  if (!function_exists('imagewebp')) return false;
  $info = @getimagesize($src);
  if (!$info) return false;
  list($w, $h) = $info;
  $type = $info[2];
  if ($type === IMAGETYPE_JPEG)      $img = @imagecreatefromjpeg($src);
  elseif ($type === IMAGETYPE_PNG)   $img = @imagecreatefrompng($src);
  elseif ($type === IMAGETYPE_WEBP && function_exists('imagecreatefromwebp')) $img = @imagecreatefromwebp($src);
  else return false;
  if (!$img) return false;

  $scale = min(1, $maxDim / max($w, $h));
  $nw = max(1, (int)round($w * $scale));
  $nh = max(1, (int)round($h * $scale));
  $thumb = imagecreatetruecolor($nw, $nh);
  imagealphablending($thumb, false);
  imagesavealpha($thumb, true);
  imagecopyresampled($thumb, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
  imagedestroy($img);
  $ok = @imagewebp($thumb, $dst, $quality);
  imagedestroy($thumb);
  if ($ok) @chmod($dst, 0644);
  return $ok;
}

// ── Auth: vérifier API key OU JWT Supabase ──
$authenticated = false;
// Renseigné UNIQUEMENT pour l'auth JWT : l'ID de l'utilisateur connecté.
// Sert à verrouiller le chemin d'écriture (anti-IDOR) ; l'API key, elle,
// est un secret serveur → pleine confiance, pas de restriction de préfixe.
$jwtUserId = null;

// Méthode 1: API Key
$providedKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
$expectedKey = getenv('O2SWITCH_UPLOAD_API_KEY') ?: '';
if ($expectedKey && $providedKey && hash_equals($expectedKey, $providedKey)) {
  $authenticated = true;
}

// Méthode 2: Bearer JWT (Supabase)
if (!$authenticated) {
  $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
  if (preg_match('/Bearer\s+(.+)$/i', $authHeader, $matches)) {
    $jwt = $matches[1];
    // Vérifier le JWT via Supabase
    $supabaseUrl = getenv('SUPABASE_URL') ?: 'https://eifrwecaszzqrdwjjjbu.supabase.co';
    $anonKey = getenv('SUPABASE_ANON_KEY') ?: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZnJ3ZWNhc3p6cXJkd2pqamJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTM5OTYsImV4cCI6MjA3MDAyOTk5Nn0.Ks8epc1CiOyj7Y4AYGL9zRHHoZscQJ7_nWbqwMNcVMQ';
    
    if ($jwt) {
      $ch = curl_init($supabaseUrl . '/auth/v1/user');
      curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => [
          'apikey: ' . $anonKey,
          'Authorization: Bearer ' . $jwt,
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 5,
      ]);
      $response = curl_exec($ch);
      $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
      curl_close($ch);
      
      if ($code === 200) {
        $user = json_decode($response, true);
        if (!empty($user['id'])) {
          $authenticated = true;
          $jwtUserId = $user['id'];
        }
      }
    }
  }
}

if (!$authenticated) {
  respond(403, ['error' => 'Unauthorized']);
}

// ── Déterminer le mode d'upload ──
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';

if (strpos($contentType, 'multipart/form-data') !== false) {
  // ── Mode Multipart (upload direct) ──
  if (empty($_FILES['file'])) {
    respond(400, ['error' => 'No file uploaded']);
  }
  
  $uploadedFile = $_FILES['file'];
  if ($uploadedFile['error'] !== UPLOAD_ERR_OK) {
    respond(400, ['error' => 'Upload error code: ' . $uploadedFile['error']]);
  }
  
  $filename = $_POST['filename'] ?? '';
  $folder = $_POST['folder'] ?? '';
  $binary = file_get_contents($uploadedFile['tmp_name']);
  
} else {
  // ── Mode JSON base64 (legacy) ──
  $raw = file_get_contents('php://input');
  $body = json_decode($raw, true);
  if (!is_array($body)) {
    respond(400, ['error' => 'Invalid JSON']);
  }
  
  $file = $body['file'] ?? '';
  $filename = $body['filename'] ?? '';
  $folder = $body['folder'] ?? '';
  
  if (!$file) {
    respond(400, ['error' => 'Missing file data']);
  }
  
  // Decode base64
  if (strpos($file, 'base64,') !== false) {
    $file = explode('base64,', $file, 2)[1];
  }
  $binary = base64_decode($file, true);
  if ($binary === false) {
    respond(400, ['error' => 'Invalid base64 data']);
  }
}

// ── Validation commune ──
if (!$filename || !in_array($folder, ['profiles', 'posts', 'pages'], true)) {
  respond(400, ['error' => 'Missing or invalid fields (filename, folder)']);
}

// Sanitize
$filename = str_replace('\\', '/', $filename);
$filename = ltrim($filename, '/');
if (strpos($filename, '..') !== false) {
  respond(400, ['error' => 'Invalid filename']);
}

// ── SÉCURITÉ (SEC-3) : n'accepter QUE des images ──
// 1) Jeu de caractères strict (aucun caractère de contrôle, pas d'espaces).
if (!preg_match('#^[A-Za-z0-9._/-]+$#', $filename)) {
  respond(400, ['error' => 'Invalid filename characters']);
}
// 2) Whitelist d'extension sur le dernier segment.
if (!preg_match('/\.(jpe?g|png|webp)$/i', $filename)) {
  respond(400, ['error' => 'Only jpg, jpeg, png, webp images are allowed']);
}
// 2bis) ANTI-IDOR : un utilisateur authentifié par JWT ne peut écrire QUE dans
// SON dossier (le client envoie déjà filename = "<user_id>/<nom>.jpg" —
// o2switchUpload.ts). Sans ce verrou, n'importe quel compte connecté pouvait
// écraser les photos d'un autre utilisateur en forgeant le préfixe.
if ($jwtUserId !== null && strpos($filename, $jwtUserId . '/') !== 0) {
  respond(403, ['error' => 'Forbidden: path outside your user folder']);
}
// 3) Le CONTENU doit vraiment être une image du bon type (magic bytes),
//    pas seulement l'extension — empêche l'upload de .js/.html déguisés.
$info = @getimagesizefromstring($binary);
$allowedTypes = [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP];
if ($info === false || !in_array($info[2], $allowedTypes, true)) {
  respond(400, ['error' => 'File content is not a valid image']);
}

// Vérifier la taille (max 10MB)
if (strlen($binary) > 10 * 1024 * 1024) {
  respond(400, ['error' => 'File too large (max 10MB)']);
}

// ── Écriture du fichier ──
$siteRoot = dirname(__DIR__);
$uploadRoot = $siteRoot . '/uploads';
$targetPath = $uploadRoot . '/' . $folder . '/' . $filename;
$targetDir = dirname($targetPath);

if (!is_dir($targetDir)) {
  if (!mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
    respond(500, ['error' => 'Failed to create directory']);
  }
}

if (file_put_contents($targetPath, $binary) === false) {
  respond(500, ['error' => 'Failed to write file']);
}

@chmod($targetPath, 0644);

// ── TROIS TAILLES WEBP, pas une ─────────────────────────────────────────────
//
// 🔴 CE QUE ÇA CORRIGE. Il n'existait qu'UNE vignette, à 480 px. Entre elle et
//    l'original (jusqu'à 2000 px), rien. Conséquence sur le site : une carte de
//    grille fait ~390 px et prenait la vignette — nette. Mais une couverture de
//    fiche fait 800 px et devait prendre l'ORIGINAL, soit ~730 Ko pour occuper
//    800 px. C'est de là que venaient à la fois la lenteur ET le flou : trop
//    petit ou beaucoup trop gros, jamais la bonne taille.
//
// ⚠ 480 / 960 / 1600 couvrent les trois usages réels : vignette de grille,
//   couverture de fiche, et plein écran sur un portable en 2x. Au-delà de
//   1600, on sert l'original — il n'y a plus d'écran malgache pour le voir.
//
// ⚠ QUALITÉ CROISSANTE AVEC LA TAILLE. Une vignette supporte 72 : elle est vue
//   petite. Une image plein écran à 72 montre ses artefacts dans les ciels et
//   les dégradés — exactement ce que produit une photo de plage malgache.
//
// ⚠ BEST-EFFORT, JAMAIS BLOQUANT. Si `imagewebp` manque ou si une taille
//   échoue, l'envoi réussit quand même : perdre la photo parce qu'une variante
//   n'a pas pu être écrite serait absurde.
$thumbUrl = null;
$variantes = [];
if (preg_match('/\.(jpe?g|png|webp)$/i', $filename)) {
  $schemeT = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
  $hostT = $_SERVER['HTTP_HOST'] ?? 'fonenako.mg';

  foreach ([[480, 72, '.thumb.webp'], [960, 80, '.w960.webp'], [1600, 84, '.w1600.webp']] as $v) {
    list($dim, $q, $suffixe) = $v;
    $vPath = preg_replace('/\.(jpe?g|png|webp)$/i', $suffixe, $targetPath);
    $vRel  = preg_replace('/\.(jpe?g|png|webp)$/i', $suffixe, $filename);
    if (@fnk_generate_thumb($targetPath, $vPath, $dim, $q)) {
      $url = $schemeT . '://' . $hostT . '/uploads/' . $folder . '/' . $vRel;
      $variantes[(string)$dim] = $url;
      if ($dim === 480) $thumbUrl = $url;
    }
  }
}

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'fonenako.mg';
$publicUrl = $scheme . '://' . $host . '/uploads/' . $folder . '/' . $filename;

respond(200, [
  'success' => true,
  'url' => $publicUrl,
  'thumb_url' => $thumbUrl,
  // ⚠ Les trois tailles, pour que le client puisse composer un `srcset` sans
  //   deviner les noms de fichiers. Deviner marcherait aujourd'hui et casserait
  //   le jour ou le suffixe change.
  'variants' => $variantes,
  'path' => $targetPath,
]);
