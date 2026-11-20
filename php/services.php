<?php
declare(strict_types=1);

function fetchExternal(string $url, int $maxBytes = 12000000): string
{
    if (!function_exists('curl_init')) {
        fail(503, 'Na serveri chýba rozšírenie PHP cURL.');
    }
    $result = '';
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_USERAGENT => 'SSS-Speleo-Atlas/1.0',
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$result, $maxBytes): int {
            if (strlen($result) + strlen($chunk) > $maxBytes) {
                return 0;
            }
            $result .= $chunk;
            return strlen($chunk);
        },
    ]);
    $success = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    if (!$success || $status !== 200) {
        throw new RuntimeException('External service unavailable.');
    }
    return $result;
}

function bibliography(): array
{
    $cache = privateDirectory() . '/bibliography-cache.json';
    if (is_file($cache) && filemtime($cache) > time() - 6 * 3600) {
        $data = json_decode((string) file_get_contents($cache), true);
        if (is_array($data) && array_is_list($data)) {
            return $data;
        }
    }
    try {
        $raw = fetchExternal('https://bibliografia.sss.sk/data/articles.json');
        $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($data) || !array_is_list($data)) {
            throw new RuntimeException('Invalid bibliography.');
        }
        $temp = tempnam(privateDirectory(), '.bibliography-');
        if ($temp !== false) {
            if (file_put_contents($temp, $raw) === strlen($raw)) {
                chmod($temp, 0600);
                rename($temp, $cache);
            } else {
                unlink($temp);
            }
        }
        return $data;
    } catch (Throwable $exception) {
        if (is_file($cache)) {
            $data = json_decode((string) file_get_contents($cache), true);
            if (is_array($data) && array_is_list($data)) {
                return $data;
            }
        }
        fail(503, 'Bibliografický archív nie je dostupný.');
    }
}

function searchArticles(array $articles, string $query, int $limit): array
{
    if ($query === '') {
        return ['total' => count($articles), 'articles' => array_slice($articles, 0, $limit)];
    }
    $query = normalizeName($query);
    $tokens = array_filter(explode(' ', $query), static fn($token) => strlen($token) > 1);
    $matches = [];
    foreach ($articles as $article) {
        $text = normalizeName(implode(' ', [
            $article['title'] ?? '',
            $article['abstract'] ?? '',
            implode(' ', $article['caves'] ?? []),
            implode(' ', $article['tags'] ?? []),
            implode(' ', $article['authors'] ?? []),
        ]));
        $score = $query !== '' && str_contains($text, $query) ? 10 : 0;
        foreach ($tokens as $token) {
            $score += str_contains($text, $token) ? 2 : 0;
        }
        if ($score > 0) {
            $matches[] = ['article' => $article, 'score' => $score];
        }
    }
    usort($matches, static fn($a, $b) =>
        ($b['score'] <=> $a['score']) ?: (($b['article']['year'] ?? 0) <=> ($a['article']['year'] ?? 0)));
    return [
        'total' => count($matches),
        'articles' => array_column(array_slice($matches, 0, $limit), 'article'),
    ];
}

function lexicalSearch(string $query): array
{
    $articles = searchArticles(bibliography(), $query, 10)['articles'];
    $tokens = array_filter(explode(' ', normalizeName($query)), static fn($token) => strlen($token) > 2);
    $matched = [];
    foreach (readDatabase() as $cave) {
        $text = normalizeName(implode(' ', [
            $cave['name'] ?? '',
            $cave['karstRegion'] ?? '',
            $cave['subUnit'] ?? '',
            $cave['description'] ?? '',
        ]));
        foreach ($tokens as $token) {
            if (str_contains($text, $token)) {
                $latest = end($cave['records']);
                $matched[] = [
                    'caveId' => $cave['id'],
                    'name' => $cave['name'],
                    'karstRegion' => $cave['karstRegion'],
                    'relevanceReason' => 'Zhoda v názve, oblasti alebo popise lokality.',
                    'latestLengthM' => $latest['lengthM'] ?? null,
                    'latestDepthM' => $latest['depthM'] ?? null,
                ];
                break;
            }
        }
        if (count($matched) === 8) {
            break;
        }
    }
    return [
        'query' => $query,
        'answerSummary' => 'Výsledky sú zoradené podľa textovej zhody v databáze jaskýň SSS a v archíve bibliografia.sss.sk.',
        'matchedCaves' => $matched,
        'matchedArticles' => $articles,
    ];
}

function spravodajIssues(string $html): array
{
    preg_match_all('~<a\b[^>]*\bhref\s*=\s*(["\'])(.*?)\1[^>]*>(.*?)</a\s*>~is', $html, $links, PREG_SET_ORDER);
    $issues = [];
    $seen = [];
    foreach ($links as $link) {
        $url = html_entity_decode($link[2], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if (str_starts_with($url, '/')) {
            $url = 'https://sss.sk' . $url;
        }
        $parts = parse_url($url);
        if (($parts['scheme'] ?? '') !== 'https' ||
            !in_array(strtolower($parts['host'] ?? ''), ['sss.sk', 'www.sss.sk'], true) ||
            !preg_match('/\.pdf$/i', $parts['path'] ?? '') || isset($seen[$url])) {
            continue;
        }
        $filename = basename($parts['path']);
        if (preg_match('/(19[7-9]\d|20[0-3]\d)/', $filename, $match)) {
            $year = (int) $match[1];
            $rest = str_replace($match[1], '', $filename);
            $issue = preg_match('/(?:^|[_-])([1-4](?:-[2-4])?)(?:[_.-]|$)/', $rest, $number) ? $number[1] : '1';
        } elseif (preg_match('/^(?:sp)?(\d{2})([1-4])\.pdf$/i', $filename, $match)) {
            $year = (int) $match[1] + ((int) $match[1] >= 70 ? 1900 : 2000);
            $issue = $match[2];
        } else {
            continue;
        }
        $seen[$url] = true;
        $title = trim(html_entity_decode(strip_tags($link[3]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $issues[] = [
            'id' => $year . '-' . $issue . '-' . count($issues),
            'year' => $year,
            'issue' => $issue,
            'title' => mb_strlen($title) > 3 && mb_strlen($title) < 60 ? $title : "Spravodaj SSS $issue/$year",
            'pdfUrl' => $url,
            'likelyContainsRankings' => in_array($issue, ['1', '2', '1-2'], true),
        ];
    }
    usort($issues, static fn($a, $b) => ($b['year'] <=> $a['year']) ?: strcmp($a['issue'], $b['issue']));
    return $issues;
}

function getSpravodajIssues(): array
{
    $fallback = [
        ['id' => '2026-1', 'year' => 2026, 'issue' => '1', 'title' => 'Spravodaj SSS 1/2026', 'pdfUrl' => 'https://sss.sk/wp-content/uploads/2026/06/Spravodaj_1_2026_vnutro_NET_web.pdf', 'likelyContainsRankings' => true],
        ['id' => '2025-1', 'year' => 2025, 'issue' => '1', 'title' => 'Spravodaj SSS 1/2025', 'pdfUrl' => 'https://sss.sk/wp-content/uploads/2025/06/Spravodaj_SSS_1_2025_NET.pdf', 'likelyContainsRankings' => true],
        ['id' => '2024-1', 'year' => 2024, 'issue' => '1', 'title' => 'Spravodaj SSS 1/2024', 'pdfUrl' => 'https://sss.sk/wp-content/uploads/2024/05/Spravodaj_1-2024_155x227.pdf', 'likelyContainsRankings' => true],
    ];
    try {
        $issues = spravodajIssues(fetchExternal('https://sss.sk/spravodaj/', 4000000));
        if ($issues) {
            return ['issues' => $issues, 'source' => 'live'];
        }
    } catch (Throwable $exception) {
        // The curated links keep the admin panel usable during a source outage.
    }
    return ['issues' => $fallback, 'source' => 'cache'];
}
