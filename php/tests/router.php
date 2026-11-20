<?php
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if ($path === '/__test_complete' && getenv('SSS_BROWSER_TEST') === '1') {
    file_put_contents(getenv('SSS_PRIVATE_DIR') . '/browser-finished', 'done');
    return true;
}
if (str_starts_with($path, '/api/')) {
    require $_SERVER['DOCUMENT_ROOT'] . '/api/index.php';
    return true;
}
return false;
