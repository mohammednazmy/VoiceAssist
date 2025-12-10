<?php
/**
 * Nextcloud routes for voiceassist-admin
 *
 * This is a placeholder; real routes will be added in later phases.
 */
return [
  'routes' => [
    ['name' => 'proxy#status', 'url' => '/api/status', 'verb' => 'GET'],
    ['name' => 'proxy#calendar', 'url' => '/api/calendar', 'verb' => 'GET'],
    ['name' => 'proxy#files', 'url' => '/api/files', 'verb' => 'GET'],
    ['name' => 'proxy#contacts', 'url' => '/api/contacts', 'verb' => 'GET'],
    ['name' => 'proxy#email', 'url' => '/api/email', 'verb' => 'GET'],
  ],
];
