<?php

/**
 * @file
 * Settings for the Upsun environment. Included by settings.php only when
 * running on Upsun, so local DDEV development is unaffected.
 */

// Database: the "database" relationship in .upsun/config.yaml.
$relationships = json_decode(base64_decode(getenv('PLATFORM_RELATIONSHIPS') ?: ''), TRUE);
if (!empty($relationships['database'][0])) {
  $db = $relationships['database'][0];
  $databases['default']['default'] = [
    'driver' => 'mysql',
    'database' => $db['path'],
    'username' => $db['username'],
    'password' => $db['password'],
    'host' => $db['host'],
    'port' => $db['port'],
    'prefix' => '',
    'init_commands' => [
      'isolation_level' => 'SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED',
    ],
  ];
}

// One stable secret per Upsun project.
if (getenv('PLATFORM_PROJECT_ENTROPY')) {
  $settings['hash_salt'] = getenv('PLATFORM_PROJECT_ENTROPY');
}

// Writable directories are mounts (see .upsun/config.yaml).
$settings['file_private_path'] = $app_root . '/../private';
$settings['file_temp_path'] = '/tmp';

// Only answer for the hosts this environment is routed to.
$settings['trusted_host_patterns'] = [];
$routes = json_decode(base64_decode(getenv('PLATFORM_ROUTES') ?: ''), TRUE) ?: [];
foreach (array_keys($routes) as $url) {
  $host = parse_url($url, PHP_URL_HOST);
  if ($host) {
    $settings['trusted_host_patterns'][] = '^' . preg_quote($host) . '$';
  }
}

// Production CORS (the local services.yml only allows localhost).
$settings['container_yamls'][] = $app_root . '/../config/services.upsun.yml';

// The presenter key is read from the FUN_ROOM_PRESENTER_KEY variable.
// Never allow the update script without logging in.
$settings['update_free_access'] = FALSE;
