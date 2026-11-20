<?php
declare(strict_types=1);
define('SSS_API_TEST', true);
$_SERVER['DOCUMENT_ROOT'] = $argv[1];
putenv('SSS_PRIVATE_DIR');
require $argv[1] . '/api/index.php';
$database = readDatabase();
if (($database[0]['id'] ?? null) !== 'test') {
    throw new RuntimeException('Private path did not load the database.');
}
