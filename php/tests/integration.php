<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/services.php';

$issues = spravodajIssues('<a href="/wp-content/uploads/Spravodaj_1_2025.pdf">Spravodaj SSS 1/2025</a><a href="https://other.invalid/file_1_2024.pdf">Other</a>');
if (count($issues) !== 1 || $issues[0]['year'] !== 2025 || $issues[0]['issue'] !== '1') {
    throw new RuntimeException('Issue parser failed.');
}

$private = sys_get_temp_dir() . '/sss-php-test-' . bin2hex(random_bytes(8));
mkdir($private, 0700);
mkdir($private . '/sessions', 0700);
$fixture = [[
    'id' => 'test-cave',
    'name' => 'Test Cave',
    'karstRegion' => 'Test',
    'subUnit' => 'Test',
    'lat' => 1.0,
    'lon' => 2.0,
    'elevationM' => 3,
    'description' => '',
    'records' => [[
        'year' => 2025,
        'statusDate' => '31. 3. 2025',
        'lengthM' => 100,
        'depthM' => 50,
        'sourceIssue' => 'Test',
        'sourcePdfUrl' => 'https://sss.sk/',
    ]],
]];
file_put_contents($private . '/caves-db.json', json_encode($fixture, JSON_THROW_ON_ERROR));
file_put_contents($private . '/bibliography-cache.json', json_encode([[
    'id' => 1,
    'title' => 'Test Cave',
    'abstract' => 'Cave research',
    'authors' => ['Test'],
    'caves' => ['Test Cave'],
    'tags' => [],
    'year' => 2025,
]], JSON_THROW_ON_ERROR));
file_put_contents($private . '/config.php', '<?php return ' . var_export([
    'username' => 'test',
    'password_hash' => password_hash('test-password', PASSWORD_DEFAULT),
    'secure_cookie' => false,
], true) . ';');

$socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
if ($socket === false) {
    throw new RuntimeException($error);
}
$address = stream_socket_get_name($socket, false);
fclose($socket);
$root = dirname(__DIR__);
$distMode = getenv('SSS_TEST_DIST') === '1';
$serverRoot = $distMode ? dirname($root) . '/dist' : $root;
$router = $distMode ? $root . '/tests/router.php' : $root . '/api.php';
$process = proc_open([PHP_BINARY, '-S', $address, '-t', $serverRoot, $router], [
    0 => ['pipe', 'r'],
    1 => ['file', $private . '/server.log', 'a'],
    2 => ['file', $private . '/server.log', 'a'],
], $pipes, $root, array_merge($_ENV, [
    'SSS_PRIVATE_DIR' => $private,
    'SSS_BROWSER_TEST' => getenv('SSS_BROWSER_TEST') ?: '0',
]));
if (!is_resource($process)) {
    throw new RuntimeException('PHP server failed to start.');
}
fclose($pipes[0]);

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function callApi(string $path, string $method = 'GET', ?array $payload = null, ?string $origin = null): array
{
    global $address, $private;
    $curl = curl_init("http://$address$path");
    $headers = [];
    if ($payload !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($payload, JSON_THROW_ON_ERROR));
    }
    if ($origin !== null) {
        $headers[] = "Origin: $origin";
    }
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIEFILE => $private . '/cookies',
        CURLOPT_COOKIEJAR => $private . '/cookies',
        CURLOPT_TIMEOUT => 3,
    ]);
    $response = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    return [$status, json_decode((string) $response, true)];
}

try {
    $ready = false;
    for ($i = 0; $i < 50; $i++) {
        $connection = @stream_socket_client("tcp://$address", $errno, $error, 0.1);
        if ($connection !== false) {
            fclose($connection);
            $ready = true;
            break;
        }
        usleep(100000);
    }
    expect($ready, 'PHP server did not start.');
    if ($distMode) {
        $curl = curl_init("http://$address/");
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        $html = curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);
        expect($status === 200 && is_string($html) && str_contains($html, '<div id="root">'), 'Built frontend unavailable.');
        expect(is_file($serverRoot . '/.htaccess'), 'Apache rewrite configuration missing.');
        [$status, $snapshot] = callApi('/data/caves.json');
        expect($status === 200 && count($snapshot['caves']) > 0, 'Public snapshot missing.');
        foreach ($snapshot['caves'] as $cave) {
            foreach (['lat', 'lon', 'elevationM'] as $field) {
                expect(!array_key_exists($field, $cave), 'Location leaked in snapshot.');
            }
        }
    }
    [$status, $response] = callApi('/api/caves');
    expect($status === 200 && count($response['caves']) === 1, 'Public caves unavailable.');
    expect(isset($response['updatedAt']) && strtotime($response['updatedAt']) === filemtime($private . '/caves-db.json'), 'Database update timestamp is invalid.');
    foreach (['lat', 'lon', 'elevationM'] as $field) {
        expect(!array_key_exists($field, $response['caves'][0]), 'Location leaked.');
    }
    [$status, $response] = callApi('/api/bibliography?q=cave&limit=1');
    expect($status === 200 && $response['total'] === 1 && count($response['articles']) === 1, 'Bibliography search failed.');
    [$status, $response] = callApi('/api/search/semantic', 'POST', ['query' => 'Test Cave']);
    expect($status === 200 && count($response['matchedCaves']) === 1 && count($response['matchedArticles']) === 1, 'Lexical search failed.');
    [$status] = callApi('/api/admin/save-year', 'POST', []);
    expect($status === 401, 'Unauthenticated update was not rejected.');
    [$status] = callApi('/api/auth/login', 'POST', ['username' => 'test', 'password' => 'wrong']);
    expect($status === 401, 'Invalid login accepted.');
    [$status] = callApi('/api/auth/login', 'POST', ['username' => 'test', 'password' => 'test-password'], 'https://other.invalid');
    expect($status === 403, 'Cross-origin login accepted.');
    [$status] = callApi('/api/auth/login', 'POST', ['username' => 'test', 'password' => 'test-password']);
    expect($status === 200, 'Valid login rejected.');
    [$status] = callApi('/api/extract/pdf', 'POST', ['rawText' => 'A sample table containing more than twenty characters.']);
    expect($status === 503, 'Missing AI configuration was not reported.');
    [$status] = callApi('/api/extract/pdf', 'POST', ['pdfUrl' => 'https://example.com/file.pdf']);
    expect($status === 400, 'External PDF URL was not rejected.');
    $body = [
        'year' => 2026,
        'metric' => 'length',
        'rows' => [[
            'rank' => 1,
            'caveId' => 'test-cave',
            'name' => 'Test Cave',
            'valueM' => 120,
        ]],
    ];
    [$status, $response] = callApi('/api/admin/save-year', 'POST', $body);
    expect($status === 200 && $response['savedCount'] === 1, 'Valid update failed.');
    expect($response['caves'][0]['records'][1]['deltaLengthM'] === 20, 'Incorrect length delta.');
    $saved = json_decode(file_get_contents($private . '/caves-db.json'), true, 512, JSON_THROW_ON_ERROR);
    expect($saved[0]['lat'] == 1 && $saved[0]['records'][1]['lengthM'] === 120, 'Private data was not preserved.');
    $body['rows'][0]['valueM'] = 90;
    [$status] = callApi('/api/admin/save-year', 'POST', $body);
    expect($status === 400, 'Invalid shrinking update accepted.');
    $after = json_decode(file_get_contents($private . '/caves-db.json'), true, 512, JSON_THROW_ON_ERROR);
    expect($after === $saved, 'Rejected update changed the database.');
    [$status, $response] = callApi('/api/caves/import-extraction', 'POST', ['extraction' => [
        'year' => 2027,
        'tableType' => 'depth',
        'issueLabel' => 'Test issue',
        'sourceUrl' => 'https://sss.sk/spravodaj/',
        'rows' => [['rank' => 1, 'name' => 'Test Cave', 'valueM' => 60]],
    ]]);
    expect($status === 200 && $response['importedRows'] === 1 && $response['caves'][0]['records'][2]['depthM'] === 60, 'Extraction import failed.');
    [$status] = callApi('/api/auth/logout', 'POST');
    expect($status === 200, 'Logout failed.');
    [$status] = callApi('/api/admin/save-year', 'POST', $body);
    expect($status === 401, 'Logged-out session retained access.');
    for ($i = 0; $i < 5; $i++) {
        [$status] = callApi('/api/auth/login', 'POST', ['username' => 'test', 'password' => 'wrong']);
        expect($status === 401, 'Failed login not rejected.');
    }
    [$status] = callApi('/api/auth/login', 'POST', ['username' => 'test', 'password' => 'test-password']);
    expect($status === 429, 'Login rate limit was not enforced.');
    define('SSS_API_TEST', true);
    $_SERVER['DOCUMENT_ROOT'] = $serverRoot;
    putenv('SSS_PRIVATE_DIR=' . $private);
    require $root . '/api.php';
    $locale = setlocale(LC_CTYPE, 0);
    setlocale(LC_CTYPE, 'C');
    expect(normalizeName('Štefanová') === 'stefanova', 'Slovak name normalization failed in C locale.');
    setlocale(LC_CTYPE, $locale);
    $html = '<div data-tab="tab-2026"><table><tr><td>1.</td><td>Test Cave</td><td>Test</td><td>Test</td><td>100</td></tr></table></div>' .
        '<div data-tab="tab-2028"><table><tr><td>1.</td><td>Test Cave</td><td>Test</td><td>Test</td><td><strong>130</strong></td></tr></table></div>';
    $rows = parseRankings($html, 'length', 'https://sss.sk/example/');
    expect(count($rows) === 2 && $rows[1]['isBoldChanged'], 'Ranking parser failed.');
    $summary = mergeRankings($rows);
    expect($summary['updatedCount'] === 1, 'Synchronization overwrote an existing value or failed to add a missing one.');
    $again = mergeRankings($rows);
    expect($again['updatedCount'] === 0, 'Synchronization is not idempotent.');
    $afterSync = readDatabase();
    expect($afterSync[0]['records'][1]['lengthM'] === 120, 'Synchronization overwrote corrected data.');
    $duplicates = [
        ['id' => 'first', 'name' => 'Rovnaká jaskyňa'],
        ['id' => 'second', 'name' => 'Rovnaká jaskyňa'],
    ];
    expect(findCave($duplicates, ['name' => 'Rovnaká jaskyňa']) === -1, 'Ambiguous cave was matched.');
    expect(findCave($duplicates, ['name' => 'Rovnaká jaskyňa', 'caveId' => 'second']) === 1, 'Explicit cave ID was not preferred.');
    if (getenv('SSS_TEST_LIVE') === '1') {
        $live = syncRankings();
        expect($live['updatedCount'] > 0 && count($live['parsedYears']) >= 1, 'Live rankings sync failed.');
        $repeated = syncRankings();
        expect($repeated['updatedCount'] === 0, 'Live rankings sync is not idempotent.');
    }
    if ($distMode && getenv('SSS_BROWSER_TEST') === '1') {
        foreach (glob($private . '/login-*.json') ?: [] as $loginFile) {
            unlink($loginFile);
        }
        echo "BROWSER_URL=http://$address/\n";
        flush();
        $deadline = time() + 90;
        while (!is_file($private . '/browser-finished') && time() < $deadline) {
            usleep(100000);
        }
        expect(is_file($private . '/browser-finished'), 'Browser test did not finish.');
    }
    echo "PHP API integration checks passed.\n";
} finally {
    proc_terminate($process);
    proc_close($process);
    foreach (glob($private . '/sessions/*') ?: [] as $file) {
        unlink($file);
    }
    rmdir($private . '/sessions');
    foreach (glob($private . '/*') ?: [] as $file) {
        unlink($file);
    }
    rmdir($private);
}
