<?php
// public/api/env.php
// Chargeur d'environnement commun aux scripts API de Diako.
//
// Sur o2switch (mutualise), getenv() ne voit que les SetEnv Apache — et on ne
// veut AUCUN secret ni dans .htaccess ni dans le depot (qui est PUBLIC).
// Les secrets vivent donc dans /home2/<login>/.env_diako : hors webroot, hors
// git, et il survit aux deploiements FTP qui n'ecrasent que le docroot.
//
// Format : une ligne CLE=VALEUR par secret. Lignes vides et # ignores.
// Usage   : require_once __DIR__ . '/env.php';  (avant tout appel a getenv)

function dk_load_env(): void {
  static $loaded = false;
  if ($loaded) return;
  $loaded = true;

  // Candidats : $HOME/.env_diako, sinon le parent du docroot
  // (docroot = /home2/<login>/diako.fonenako.mg → parent = /home2/<login>).
  $candidates = [];
  $home = getenv('HOME');
  if ($home) $candidates[] = rtrim($home, '/') . '/.env_diako';
  $candidates[] = dirname(dirname(__DIR__)) . '/.env_diako';

  foreach ($candidates as $path) {
    if (!is_readable($path)) continue;
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) continue;
    foreach ($lines as $line) {
      $line = trim($line);
      if ($line === '' || $line[0] === '#') continue;
      $pos = strpos($line, '=');
      if ($pos === false) continue;
      $key = trim(substr($line, 0, $pos));
      $val = trim(substr($line, $pos + 1));
      // Retirer d'eventuels guillemets autour de la valeur.
      if (strlen($val) >= 2 && ($val[0] === '"' || $val[0] === "'") && substr($val, -1) === $val[0]) {
        $val = substr($val, 1, -1);
      }
      if ($key === '') continue;
      // Ne jamais ecraser une variable deja definie (SetEnv prioritaire).
      if (getenv($key) === false || getenv($key) === '') {
        putenv($key . '=' . $val);
        $_ENV[$key] = $val;
      }
    }
    return; // premier fichier lisible trouve = le bon
  }
}

dk_load_env();
