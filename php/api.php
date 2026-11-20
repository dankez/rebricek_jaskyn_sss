<?php
declare(strict_types=1);

// This candidate backend is not part of the production build yet.
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
ini_set('display_errors', '0');
require_once __DIR__ . '/services.php';
require_once __DIR__ . '/gemini.php';
require_once __DIR__ . '/sync.php';

function respond(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function fail(int $status, string $message): never
{
    respond($status, ['error' => $message]);
}

function privateDirectory(): string
{
    $dir = getenv('SSS_PRIVATE_DIR');
    $pointer = __DIR__ . '/private-path.php';
    if (!$dir && is_file($pointer)) {
        $dir = require $pointer;
    }
    if (!is_string($dir) || $dir === '') {
        fail(503, 'Súkromný adresár nie je nakonfigurovaný.');
    }
    $real = realpath($dir);
    $webroot = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
    if ($real === false || $webroot === false || $real === $webroot ||
        str_starts_with($real . DIRECTORY_SEPARATOR, $webroot . DIRECTORY_SEPARATOR)) {
        fail(503, 'Súkromný adresár nie je bezpečne nakonfigurovaný.');
    }
    return $real;
}

function config(): array
{
    $path = privateDirectory() . '/config.php';
    if (!is_file($path)) {
        fail(503, 'Administrácia nie je nakonfigurovaná.');
    }
    $config = require $path;
    if (!is_array($config) || empty($config['username']) || empty($config['password_hash'])) {
        fail(503, 'Administrácia nie je nakonfigurovaná.');
    }
    return $config;
}

function sessionStart(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $config = config();
    $sessionDir = privateDirectory() . '/sessions';
    if (!is_dir($sessionDir) || !is_writable($sessionDir)) {
        fail(503, 'Úložisko prihlásenia nie je dostupné.');
    }
    session_save_path($sessionDir);
    session_name('sss_php_session');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => ($config['secure_cookie'] ?? true) === true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function authenticated(): bool
{
    sessionStart();
    return isset($_SESSION['expires']) && is_int($_SESSION['expires']) && $_SESSION['expires'] > time();
}

function adminRequired(): void
{
    if (!authenticated()) {
        fail(401, 'Vyžaduje sa prihlásenie administrátora.');
    }
}

function login(array $body): void
{
    $settings = config();
    $client = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $lock = @fopen(privateDirectory() . '/login-' . hash('sha256', $client) . '.json', 'c+');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        fail(503, 'Prihlasovanie nie je dostupné.');
    }
    $data = json_decode((string) stream_get_contents($lock), true);
    if (!is_array($data) || !isset($data['until']) || $data['until'] <= time()) {
        $data = ['failures' => 0, 'until' => time() + 900];
    }
    if (($data['failures'] ?? 0) >= 5) {
        header('Retry-After: ' . max(1, $data['until'] - time()));
        flock($lock, LOCK_UN);
        fclose($lock);
        fail(429, 'Priveľa neúspešných prihlásení. Skúste to neskôr.');
    }
    $password = is_string($body['password'] ?? null) ? $body['password'] : '';
    $validPassword = password_verify($password, $settings['password_hash']);
    $valid = is_string($body['username'] ?? null) &&
        hash_equals($settings['username'], $body['username']) && $validPassword;
    $data['failures'] = $valid ? 0 : $data['failures'] + 1;
    $encoded = json_encode($data, JSON_THROW_ON_ERROR);
    rewind($lock);
    $written = ftruncate($lock, 0) && fwrite($lock, $encoded) === strlen($encoded) && fflush($lock);
    flock($lock, LOCK_UN);
    fclose($lock);
    if (!$written) {
        fail(503, 'Prihlasovanie nie je dostupné.');
    }
    if (!$valid) {
        fail(401, 'Neplatné prihlasovacie meno alebo heslo.');
    }
    sessionStart();
    session_regenerate_id(true);
    $_SESSION['expires'] = time() + 8 * 60 * 60;
    respond(200, ['authenticated' => true, 'username' => $settings['username']]);
}

function requestBody(int $limit = 1048576): array
{
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
        fail(415, 'Požiadavka musí obsahovať JSON.');
    }
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) {
        fail(413, 'Požiadavka je príliš veľká.');
    }
    try {
        $input = file_get_contents('php://input', false, null, 0, $limit + 1);
        if ($input === false || strlen($input) > $limit) {
            fail(413, 'Požiadavka je príliš veľká.');
        }
        $body = json_decode($input, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        fail(400, 'Neplatný JSON.');
    }
    if (!is_array($body)) {
        fail(400, 'Neplatné údaje požiadavky.');
    }
    return $body;
}

function readDatabase(): array
{
    $path = privateDirectory() . '/caves-db.json';
    $raw = @file_get_contents($path);
    if ($raw === false) {
        fail(503, 'Databáza jaskýň nie je dostupná.');
    }
    try {
        $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        fail(500, 'Databáza jaskýň je poškodená.');
    }
    if (!is_array($data) || !array_is_list($data) || count($data) === 0) {
        fail(500, 'Databáza jaskýň je neplatná.');
    }
    return $data;
}

function writeDatabase(array $caves): void
{
    $directory = privateDirectory();
    $json = json_encode($caves, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $temp = tempnam($directory, '.caves-');
    if ($temp === false || file_put_contents($temp, $json) !== strlen($json) ||
        !chmod($temp, 0600) || !rename($temp, $directory . '/caves-db.json')) {
        if ($temp !== false && is_file($temp)) {
            unlink($temp);
        }
        fail(500, 'Uloženie databázy zlyhalo.');
    }
}

function publicCaves(array $caves): array
{
    foreach ($caves as &$cave) {
        unset($cave['lat'], $cave['lon'], $cave['elevationM']);
    }
    return $caves;
}

function normalizeName(string $value): string
{
    $value = strtr(mb_strtolower($value, 'UTF-8'), [
        'á' => 'a', 'ä' => 'a', 'č' => 'c', 'ď' => 'd', 'é' => 'e', 'ě' => 'e',
        'í' => 'i', 'ĺ' => 'l', 'ľ' => 'l', 'ň' => 'n', 'ó' => 'o', 'ô' => 'o',
        'ŕ' => 'r', 'ř' => 'r', 'š' => 's', 'ť' => 't', 'ú' => 'u', 'ů' => 'u',
        'ý' => 'y', 'ž' => 'z',
    ]);
    $transliterated = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
    $value = $transliterated === false ? $value : $transliterated;
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $value));
}

function findCave(array $caves, array $row): ?int
{
    $id = $row['caveId'] ?? null;
    if (is_string($id) && $id !== '') {
        foreach ($caves as $index => $cave) {
            if (($cave['id'] ?? null) === $id) {
                return $index;
            }
        }
        return null;
    }
    $name = normalizeName((string) $row['name']);
    $matches = [];
    foreach ($caves as $index => $cave) {
        if (normalizeName((string) ($cave['name'] ?? '')) === $name) {
            $matches[$index] = true;
        }
        foreach (($cave['aliases'] ?? []) as $alias) {
            if (normalizeName((string) $alias) === $name) {
                $matches[$index] = true;
            }
        }
    }
    return count($matches) > 1 ? -1 : (count($matches) === 1 ? array_key_first($matches) : null);
}

function saveYear(array $body): array
{
    $year = $body['year'] ?? null;
    $metric = $body['metric'] ?? null;
    $rows = $body['rows'] ?? null;
    if (!is_int($year) || $year < 1900 || $year > 2100 ||
        !in_array($metric, ['length', 'depth'], true) ||
        !is_array($rows) || !array_is_list($rows) || count($rows) < 1 || count($rows) > 1000) {
        fail(400, 'Neplatné údaje pre uloženie ročníka.');
    }
    foreach (['statusDate', 'author', 'footnote', 'sourceIssue', 'sourcePdfUrl'] as $fieldName) {
        if (isset($body[$fieldName]) && !is_string($body[$fieldName])) {
            fail(400, 'Neplatné údaje pre uloženie ročníka.');
        }
    }
    foreach ($rows as $row) {
        if (!is_array($row) || !is_string($row['name'] ?? null) ||
            trim($row['name']) === '' || !is_numeric($row['valueM'] ?? null) ||
            !is_finite((float) $row['valueM']) || (float) $row['valueM'] <= 0 ||
            !is_int($row['rank'] ?? null) || $row['rank'] <= 0) {
            fail(400, 'Ročník obsahuje neplatný riadok.');
        }
    }

    $directory = privateDirectory();
    $lock = @fopen($directory . '/caves-db.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        fail(503, 'Databázu sa nepodarilo uzamknúť.');
    }
    try {
        $caves = readDatabase();
        $field = $metric === 'depth' ? 'depthM' : 'lengthM';
        foreach ($rows as $row) {
            $index = findCave($caves, $row);
            if ($index === -1) {
                fail(409, 'Názov jaskyne nie je jednoznačný; vyberte konkrétnu lokalitu.');
            }
            if ($index === null) {
                if (!empty($row['caveId'])) {
                    fail(400, 'Identifikátor jaskyne neexistuje.');
                }
                continue;
            }
            $previous = null;
            foreach ($caves[$index]['records'] as $record) {
                if ($record['year'] < $year && ($previous === null || $record['year'] > $previous['year'])) {
                    $previous = $record;
                }
            }
            if ($previous !== null && isset($previous[$field]) && $row['valueM'] < $previous[$field]) {
                fail(400, 'Chyba validácie: hodnota je nižšia ako v predchádzajúcom ročníku.');
            }
        }
        $created = 0;
        foreach ($rows as $row) {
            $index = findCave($caves, $row);
            if ($index === null) {
                $id = str_replace(' ', '-', normalizeName($row['name']));
                if ($id === '' || array_search($id, array_column($caves, 'id'), true) !== false) {
                    fail(400, 'Nepodarilo sa jednoznačne určiť jaskyňu.');
                }
                $caves[] = [
                    'id' => $id,
                    'name' => trim($row['name']),
                    'karstRegion' => trim((string) ($row['karstRegion'] ?? '')) ?: 'Slovensko',
                    'subUnit' => trim((string) ($row['subUnit'] ?? '')),
                    'description' => "Lokalita pridaná cez admin rozhranie SSS pre ročník $year.",
                    'sssUrl' => 'https://sss.sk/category/rebricky-jaskyn/',
                    'records' => [],
                ];
                $index = count($caves) - 1;
                $created++;
            }
            $recordIndex = null;
            foreach ($caves[$index]['records'] as $i => $record) {
                if ($record['year'] === $year) {
                    $recordIndex = $i;
                    break;
                }
            }
            if ($recordIndex === null) {
                $caves[$index]['records'][] = [
                    'year' => $year,
                    'statusDate' => ($body['statusDate'] ?? '') ?: "31. 3. $year",
                    'lengthM' => null,
                    'depthM' => null,
                    'sourceIssue' => ($body['sourceIssue'] ?? '') ?: "Spravodaj SSS 1/$year",
                    'sourcePdfUrl' => ($body['sourcePdfUrl'] ?? '') ?: 'https://sss.sk/spravodaj/',
                    'author' => ($body['author'] ?? '') ?: 'Ján Tencer',
                ];
                $recordIndex = count($caves[$index]['records']) - 1;
            }
            $record = &$caves[$index]['records'][$recordIndex];
            $record['statusDate'] = ($body['statusDate'] ?? '') ?: $record['statusDate'];
            $record['author'] = ($body['author'] ?? '') ?: ($record['author'] ?? 'Ján Tencer');
            $record[$field] = (float) $row['valueM'];
            $record[$metric === 'depth' ? 'rankDepth' : 'rankLength'] = $row['rank'];
            $record[$metric === 'depth' ? 'isBoldDepth' : 'isBoldLength'] = (bool) ($row['isBoldChanged'] ?? false);
            $record['isUnverified'] = (bool) ($row['isUnverified'] ?? false);
            if (!empty($row['secondaryNote'])) {
                $record['secondarySurveyNote'] = trim((string) $row['secondaryNote']);
            } else {
                unset($record['secondarySurveyNote']);
            }
            if ($record['isUnverified'] && !empty($body['footnote'])) {
                $record['unverifiedNote'] = $body['footnote'];
            }
            unset($record);
        }
        $changed = array_map(fn($row) => findCave($caves, $row), $rows);
        foreach (array_unique($changed) as $index) {
            $cave = &$caves[$index];
            usort($cave['records'], static fn($a, $b) => $a['year'] <=> $b['year']);
            foreach ($cave['records'] as $i => &$record) {
                if ($i === 0 || ($record['year'] !== $year && $cave['records'][$i - 1]['year'] !== $year)) {
                    continue;
                }
                $prev = $cave['records'][$i - 1];
                foreach (['length', 'depth'] as $kind) {
                    $measure = $kind . 'M';
                    if (isset($record[$measure], $prev[$measure])) {
                        $record['delta' . ucfirst($kind) . 'M'] = round($record[$measure] - $prev[$measure], 1);
                    }
                }
            }
            unset($record);
            unset($cave);
        }
        writeDatabase($caves);
        return ['savedCount' => count($rows), 'newCaves' => $created, 'caves' => publicCaves($caves)];
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

if (defined('SSS_API_TEST')) {
    return;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'POST' && isset($_SERVER['HTTP_ORIGIN'])) {
    $settings = config();
    $scheme = ($settings['secure_cookie'] ?? true) === true ? 'https://' : 'http://';
    $expectedOrigin = $scheme . ($_SERVER['HTTP_HOST'] ?? '');
    if (strcasecmp($_SERVER['HTTP_ORIGIN'], $expectedOrigin) !== 0) {
        fail(403, 'Nepovolený pôvod požiadavky.');
    }
}
if ($path === '/api/caves' && $method === 'GET') {
    $caves = readDatabase();
    $modified = @filemtime(privateDirectory() . '/caves-db.json');
    respond(200, [
        'caves' => publicCaves($caves),
        'updatedAt' => $modified === false ? null : gmdate('c', $modified),
    ]);
}
if ($path === '/api/bibliography' && $method === 'GET') {
    $query = is_string($_GET['q'] ?? null) ? trim($_GET['q']) : '';
    $limit = filter_var($_GET['limit'] ?? 40, FILTER_VALIDATE_INT);
    $limit = $limit === false ? 40 : max(1, min(100, $limit));
    if (strlen($query) > 1000) {
        fail(400, 'Vyhľadávací dopyt je príliš dlhý.');
    }
    if ($path === '/api/sss/issues' && $method === 'GET') {
        respond(200, getSpravodajIssues());
    }
    if ($path === '/api/sss/sync-rankings' && $method === 'POST') {
        adminRequired();
        respond(200, syncRankings());
    }
    respond(200, searchArticles(bibliography(), $query, $limit));
}
if ($path === '/api/search/semantic' && $method === 'POST') {
    $body = requestBody();
    $query = is_string($body['query'] ?? null) ? trim($body['query']) : '';
    if ($query === '' || strlen($query) > 1000) {
        fail(400, 'Zadajte platný vyhľadávací dopyt.');
    }
    respond(200, semanticSearch($query));
}
if ($path === '/api/auth/session' && $method === 'GET') {
    $valid = authenticated();
    respond(200, $valid ? ['authenticated' => true, 'username' => config()['username']] : ['authenticated' => false]);
}
if ($path === '/api/auth/login' && $method === 'POST') {
    login(requestBody());
}
if ($path === '/api/auth/logout' && $method === 'POST') {
    sessionStart();
    $_SESSION = [];
    session_destroy();
    $cookie = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 3600,
        'path' => $cookie['path'],
        'secure' => $cookie['secure'],
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    respond(200, ['authenticated' => false]);
}
if ($path === '/api/admin/save-year' && $method === 'POST') {
    adminRequired();
    respond(200, saveYear(requestBody()));
}
if ($path === '/api/extract/pdf' && $method === 'POST') {
    adminRequired();
    respond(200, ['extraction' => extractPdf(requestBody(35 * 1024 * 1024))]);
}
if ($path === '/api/caves/import-extraction' && $method === 'POST') {
    adminRequired();
    $body = requestBody();
    $extraction = $body['extraction'] ?? null;
    if (!is_array($extraction) || !is_array($extraction['rows'] ?? null) ||
        !in_array($extraction['tableType'] ?? null, ['length', 'depth'], true)) {
        fail(400, 'Chýbajú platné extrahované riadky na uloženie.');
    }
    $url = $extraction['sourceUrl'] ?? 'https://sss.sk/spravodaj/';
    $parsed = is_string($url) ? parse_url($url) : false;
    if (!is_array($parsed) || ($parsed['scheme'] ?? '') !== 'https' ||
        !in_array(strtolower($parsed['host'] ?? ''), ['sss.sk', 'www.sss.sk'], true)) {
        fail(400, 'Neplatný zdroj extrakcie.');
    }
    $footnotes = $extraction['footnotes'] ?? [];
    if (!is_array($footnotes) || count(array_filter($footnotes, 'is_string')) !== count($footnotes)) {
        fail(400, 'Neplatné poznámky extrakcie.');
    }
    $saved = saveYear([
        'year' => $extraction['year'] ?? null,
        'metric' => $extraction['tableType'],
        'rows' => $extraction['rows'],
        'statusDate' => $extraction['statusDate'] ?? '',
        'author' => $extraction['author'] ?? '',
        'footnote' => implode(' ', $footnotes),
        'sourceIssue' => $extraction['issueLabel'] ?? '',
        'sourcePdfUrl' => $url,
    ]);
    respond(200, ['importedRows' => $saved['savedCount'], 'newCaves' => $saved['newCaves'], 'caves' => $saved['caves']]);
}
fail(404, 'API cesta neexistuje.');
