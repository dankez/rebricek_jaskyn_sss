<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/services.php';
require_once dirname(__DIR__) . '/sync.php';
define('SSS_API_TEST', true);
require_once dirname(__DIR__) . '/api.php';

foreach ([
    'length' => 'https://sss.sk/tabulka-najdlhsich-jaskyn-na-slovensku/',
    'depth' => 'https://sss.sk/tabulka-najhlbsich-jaskyn-na-slovensku/',
] as $metric => $url) {
    $rows = parseRankings(fetchExternal($url, 4000000), $metric, $url);
    if (count($rows) < 20 || count(array_unique(array_column($rows, 'year'))) < 1) {
        throw new RuntimeException("Unable to parse live $metric rankings.");
    }
    echo "$metric: " . count($rows) . " rows parsed.\n";
}
$issues = spravodajIssues(fetchExternal('https://sss.sk/spravodaj/', 4000000));
if (!$issues) {
    throw new RuntimeException('Unable to parse live Spravodaj issues.');
}
echo 'issues: ' . count($issues) . " parsed.\n";
$articles = json_decode(fetchExternal('https://bibliografia.sss.sk/data/articles.json'), true, 512, JSON_THROW_ON_ERROR);
if (!is_array($articles) || count($articles) < 100) {
    throw new RuntimeException('Bibliography response is invalid.');
}
$result = searchArticles($articles, 'Demänovský', 6);
if ($result['total'] < 1) {
    throw new RuntimeException('Bibliography search did not match.');
}
echo 'bibliography: ' . count($articles) . " articles parsed.\n";
