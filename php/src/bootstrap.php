<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use WinsiBot\Routes;

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$routes = new Routes();
$routes->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI']);