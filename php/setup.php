<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli' || $argc !== 4) {
    fwrite(STDERR, "Použitie: php setup.php WEBROOT SÚKROMNÝ_ADRESÁR ZDROJ_DATABÁZY\n");
    exit(1);
}
umask(0077);

$webroot = realpath($argv[1]);
$private = realpath($argv[2]);
$source = realpath($argv[3]);
$apiDir = $webroot === false ? false : realpath($webroot . '/api');
if ($webroot === false || $private === false || $source === false ||
    $apiDir === false || !str_starts_with($apiDir . '/', $webroot . '/') ||
    !is_dir($webroot) || !is_dir($private) || !is_file($source) ||
    $private === $webroot || str_starts_with($private . '/', $webroot . '/') ||
    $source === $webroot || str_starts_with($source, $webroot . '/')) {
    fwrite(STDERR, "Adresáre musia existovať a súkromné súbory musia byť mimo webrootu.\n");
    exit(1);
}
if (file_exists($private . '/config.php') || file_exists($private . '/caves-db.json') ||
    file_exists($apiDir . '/private-path.php')) {
    fwrite(STDERR, "Konfigurácia, databáza alebo cesta už existuje; nič neprepisujem.\n");
    exit(1);
}
$raw = file_get_contents($source);
try {
    $data = json_decode((string) $raw, true, 512, JSON_THROW_ON_ERROR);
} catch (JsonException $exception) {
    fwrite(STDERR, "Zdrojová databáza nie je platný JSON.\n");
    exit(1);
}
if (!is_array($data) || !array_is_list($data) || count($data) === 0) {
    fwrite(STDERR, "Zdrojová databáza je prázdna alebo neplatná.\n");
    exit(1);
}
$username = trim((string) fgets(STDIN));
$password = rtrim((string) fgets(STDIN), "\r\n");
if ($username === '' || strlen($username) > 128 || strlen($password) < 12 ||
    ($username === 'jan' && $password === 'tencer')) {
    fwrite(STDERR, "Zadajte meno a heslo s najmenej 12 bajtmi.\n");
    exit(1);
}
if (!is_dir($private . '/sessions') && !mkdir($private . '/sessions', 0700)) {
    fwrite(STDERR, "Nepodarilo sa vytvoriť adresár relácií.\n");
    exit(1);
}
$settings = [
    'username' => $username,
    'password_hash' => password_hash($password, PASSWORD_DEFAULT),
    'secure_cookie' => true,
    'gemini_api_key' => '',
    'gemini_model' => 'gemini-2.5-flash',
];
$config = "<?php\nreturn " . var_export($settings, true) . ";\n";
$databaseFile = fopen($private . '/caves-db.json', 'x');
if ($databaseFile === false) {
    fwrite(STDERR, "Nepodarilo sa vytvoriť databázu.\n");
    exit(1);
}
chmod($private . '/caves-db.json', 0600);
$written = fwrite($databaseFile, $raw);
fclose($databaseFile);
if ($written !== strlen($raw)) {
    fwrite(STDERR, "Zápis databázy zlyhal; skontrolujte súkromný adresár.\n");
    exit(1);
}
$configFile = fopen($private . '/config.php', 'x');
if ($configFile === false) {
    fwrite(STDERR, "Konfiguráciu sa nepodarilo vytvoriť; skontrolujte súkromný adresár.\n");
    exit(1);
}
chmod($private . '/config.php', 0600);
$written = fwrite($configFile, $config);
fclose($configFile);
if ($written !== strlen($config)) {
    fwrite(STDERR, "Zápis konfigurácie zlyhal; skontrolujte súkromný adresár.\n");
    exit(1);
}
$pointer = "<?php\nreturn " . var_export($private, true) . ";\n";
$pointerFile = fopen($apiDir . '/private-path.php', 'x');
if ($pointerFile === false) {
    fwrite(STDERR, "Cestu k databáze sa nepodarilo vytvoriť; skontrolujte práva k webrootu.\n");
    exit(1);
}
chmod($apiDir . '/private-path.php', 0644);
$written = fwrite($pointerFile, $pointer);
fclose($pointerFile);
if ($written !== strlen($pointer)) {
    fwrite(STDERR, "Zápis cesty k databáze zlyhal; skontrolujte webroot.\n");
    exit(1);
}
echo "Súkromná databáza a administrácia sú pripravené. Zdrojová databáza zostala nezmenená.\n";
