<?php
declare(strict_types=1);

$base = sys_get_temp_dir() . '/sss-setup-test-' . bin2hex(random_bytes(8));
mkdir($base, 0700);
mkdir("$base/web", 0700);
mkdir("$base/web/api", 0700);
mkdir("$base/private", 0700);
foreach (['api.php' => 'index.php', 'services.php' => 'services.php', 'gemini.php' => 'gemini.php', 'sync.php' => 'sync.php'] as $source => $target) {
    copy(dirname(__DIR__) . '/' . $source, "$base/web/api/$target");
}
file_put_contents("$base/source.json", '[{"id":"test","records":[]}]');

function runSetup(array $args): array
{
    $script = dirname(__DIR__) . '/setup.php';
    $process = proc_open(array_merge([PHP_BINARY, $script], $args), [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $pipes);
    if (!is_resource($process)) {
        throw new RuntimeException('Setup process failed.');
    }
    fwrite($pipes[0], "admin\nlong-test-password\n");
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    return [proc_close($process), $stdout, $stderr];
}

try {
    [$status] = runSetup(["$base/web", "$base/private", "$base/source.json"]);
    $config = require "$base/private/config.php";
    if ($status !== 0 || !password_verify('long-test-password', $config['password_hash']) ||
        file_get_contents("$base/private/caves-db.json") !== file_get_contents("$base/source.json") ||
        (require "$base/web/api/private-path.php") !== "$base/private") {
        throw new RuntimeException('Setup failed to initialize private storage.');
    }
    $reader = proc_open([PHP_BINARY, __DIR__ . '/read-pointer.php', "$base/web"], [
        0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w'],
    ], $pipes);
    if (!is_resource($reader)) {
        throw new RuntimeException('Pointer test failed to start.');
    }
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    if (proc_close($reader) !== 0 || $stdout !== '') {
        throw new RuntimeException("Pointer test failed: $stdout $stderr");
    }
    [$status] = runSetup(["$base/web", "$base/private", "$base/source.json"]);
    if ($status === 0) {
        throw new RuntimeException('Setup overwrote existing data.');
    }
    [$status] = runSetup(["$base/web", "$base/web", "$base/source.json"]);
    if ($status === 0) {
        throw new RuntimeException('Setup accepted public storage.');
    }
    echo "PHP setup checks passed.\n";
} finally {
    foreach (glob("$base/private/*") ?: [] as $path) {
        is_dir($path) ? rmdir($path) : unlink($path);
    }
    unlink("$base/source.json");
    foreach (glob("$base/web/api/*") ?: [] as $path) {
        unlink($path);
    }
    rmdir("$base/web/api");
    rmdir("$base/private");
    rmdir("$base/web");
    rmdir($base);
}
