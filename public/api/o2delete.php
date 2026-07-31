<?php
// public/api/o2delete.php
// Secure file deletion endpoint for cleaning up o2switch files

// Secrets serveur (O2SWITCH_UPLOAD_API_KEY...) depuis ~/.env_fonenako
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

// ── Auth : API key (pleine confiance) OU Bearer JWT Supabase (limité au
//    dossier de l'utilisateur — nettoyage des photos de SES brouillons). ──
$authenticated = false;
$jwtUserId = null; // renseigné uniquement pour l'auth JWT (anti-IDOR)

$providedKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
$expectedKey = getenv('O2SWITCH_UPLOAD_API_KEY') ?: '';
if ($expectedKey && $providedKey && hash_equals($expectedKey, $providedKey)) {
  $authenticated = true;
}

if (!$authenticated) {
  $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
  if (preg_match('/Bearer\s+(.+)$/i', $authHeader, $matches)) {
    $jwt = $matches[1];
    $supabaseUrl = getenv('SUPABASE_URL') ?: 'https://yusboprhuzhonedulinw.supabase.co';
    $anonKey = getenv('SUPABASE_ANON_KEY') ?: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1c2JvcHJodXpob25lZHVsaW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1OTY5MzIsImV4cCI6MjA3MzE3MjkzMn0.x4aEvXDqpFexztmqqwqitsFusDaboCJop16wVMyv0_Y';
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

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
  respond(400, ['error' => 'Invalid JSON']);
}

$urls = $body['urls'] ?? [];

if (!is_array($urls) || empty($urls)) {
  respond(400, ['error' => 'Missing urls array']);
}

$siteRoot = dirname(__DIR__);
$uploadRoot = $siteRoot . '/uploads';
$deletedCount = 0;
$failedCount = 0;
$errors = [];

foreach ($urls as $url) {
  // Extract path from URL (e.g., https://fonenako.mg/uploads/listings/user-id/file.jpg)
  // We want to get: listings/user-id/file.jpg
  
  if (!is_string($url) || empty($url)) {
    $failedCount++;
    $errors[] = 'Invalid URL format';
    continue;
  }
  
  // Parse URL to get path after /uploads/
  if (preg_match('#/uploads/(.+)$#', $url, $matches)) {
    $relativePath = $matches[1];
    
    // Security: prevent directory traversal
    if (strpos($relativePath, '..') !== false) {
      $failedCount++;
      $errors[] = 'Invalid path: ' . $relativePath;
      continue;
    }

    // Auth JWT : l'utilisateur ne peut supprimer QUE dans SON dossier
    // (uploads/<folder>/<userId>/...) — anti-IDOR.
    if ($jwtUserId !== null && !preg_match('#^[a-z0-9_-]+/' . preg_quote($jwtUserId, '#') . '/#i', $relativePath)) {
      $failedCount++;
      $errors[] = 'Forbidden path: ' . basename($relativePath);
      continue;
    }

    $filePath = $uploadRoot . '/' . $relativePath;

    // Check if file exists and is within upload root
    $realPath = realpath($filePath);
    $realUploadRoot = realpath($uploadRoot);

    if ($realPath && $realUploadRoot && strpos($realPath, $realUploadRoot) === 0) {
      if (file_exists($realPath) && is_file($realPath)) {
        if (unlink($realPath)) {
          $deletedCount++;
          // Supprimer aussi la vignette associée (photo.jpg -> photo.thumb.webp)
          $thumbPath = preg_replace('/\.(jpe?g|png|webp)$/i', '.thumb.webp', $realPath);
          if ($thumbPath !== $realPath && is_file($thumbPath)) {
            @unlink($thumbPath);
          }
        } else {
          $failedCount++;
          $errors[] = 'Failed to delete: ' . basename($relativePath);
        }
      } else {
        $failedCount++;
        $errors[] = 'File not found: ' . basename($relativePath);
      }
    } else {
      $failedCount++;
      $errors[] = 'Invalid file path: ' . basename($relativePath);
    }
  } else {
    $failedCount++;
    $errors[] = 'Could not extract path from URL: ' . $url;
  }
}

respond(200, [
  'success' => true,
  'deleted' => $deletedCount,
  'failed' => $failedCount,
  'errors' => $errors,
]);
