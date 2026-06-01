<?php
declare(strict_types=1);

// servir panel.html en la raiz
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($uri === '/' || $uri === '') {
    header('Location: /panel.html');
    exit;
}

// para archivos estaticos que existen, servirlos directo
$file = __DIR__ . $uri;
if (file_exists($file) && is_file($file)) {
    return false; // PHP built-in server lo sirve solo
}

// cargar el router principal
require_once __DIR__ . '/../src/bootstrap.php';