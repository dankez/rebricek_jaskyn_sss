<?php
declare(strict_types=1);

function geminiResponse(array $parts, array $schema): array
{
    $settings = config();
    $apiKey = $settings['gemini_api_key'] ?? '';
    if (!is_string($apiKey) || $apiKey === '') {
        fail(503, 'GEMINI_API_KEY nie je nakonfigurovaný pre AI/OCR.');
    }
    if (!function_exists('curl_init')) {
        fail(503, 'Na serveri chýba rozšírenie PHP cURL.');
    }
    $model = $settings['gemini_model'] ?? 'gemini-2.5-flash';
    if (!is_string($model) || !preg_match('/^[a-zA-Z0-9._-]{1,100}$/', $model)) {
        fail(503, 'AI model nie je správne nakonfigurovaný.');
    }
    $payload = json_encode([
        'contents' => [['parts' => $parts]],
        'generationConfig' => [
            'responseMimeType' => 'application/json',
            'responseSchema' => $schema,
        ],
    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    $curl = curl_init("https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent");
    $response = '';
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'x-goog-api-key: ' . $apiKey],
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$response): int {
            if (strlen($response) + strlen($chunk) > 4000000) {
                return 0;
            }
            $response .= $chunk;
            return strlen($chunk);
        },
    ]);
    $success = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    if (!$success || $status !== 200) {
        fail(502, 'AI služba nie je dostupná alebo odmietla požiadavku.');
    }
    try {
        $outer = json_decode($response, true, 512, JSON_THROW_ON_ERROR);
        $text = $outer['candidates'][0]['content']['parts'][0]['text'] ?? '';
        $decoded = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
    } catch (Throwable $exception) {
        fail(502, 'AI služba vrátila neplatnú odpoveď.');
    }
    if (!is_array($decoded)) {
        fail(502, 'AI služba vrátila neplatnú odpoveď.');
    }
    return $decoded;
}

function semanticSearch(string $query): array
{
    $result = lexicalSearch($query);
    $settings = config();
    if (empty($settings['gemini_api_key'])) {
        return $result;
    }
    $caves = readDatabase();
    $digest = array_map(static function ($cave) {
        $latest = end($cave['records']);
        return [
            'id' => $cave['id'],
            'name' => $cave['name'],
            'karstRegion' => $cave['karstRegion'],
            'subUnit' => $cave['subUnit'],
            'latestLengthM' => $latest['lengthM'] ?? null,
            'latestDepthM' => $latest['depthM'] ?? null,
            'history' => array_map(static fn($record) => [
                'year' => $record['year'],
                'lengthM' => $record['lengthM'] ?? null,
                'depthM' => $record['depthM'] ?? null,
                'isUnverified' => $record['isUnverified'] ?? false,
            ], $cave['records']),
        ];
    }, $caves);
    $articles = $result['matchedArticles'];
    $schema = [
        'type' => 'OBJECT',
        'properties' => [
            'answerSummary' => ['type' => 'STRING'],
            'matchedCaves' => ['type' => 'ARRAY', 'items' => [
                'type' => 'OBJECT',
                'properties' => ['caveId' => ['type' => 'STRING'], 'relevanceReason' => ['type' => 'STRING']],
            ]],
            'matchedArticleIds' => ['type' => 'ARRAY', 'items' => [
                'type' => 'OBJECT',
                'properties' => ['id' => ['type' => 'INTEGER'], 'relevanceReason' => ['type' => 'STRING']],
            ]],
        ],
    ];
    $prompt = 'Vyhodnoť relevanciu jaskýň a článkov k dopytu v slovenčine. ' .
        'Nevymýšľaj údaje. Vráť iba identifikátory z priložených dát.' .
        "\nDopyt: " . $query . "\nJaskyne: " . json_encode($digest, JSON_UNESCAPED_UNICODE) .
        "\nČlánky: " . json_encode($articles, JSON_UNESCAPED_UNICODE);
    $answer = geminiResponse([['text' => $prompt]], $schema);
    $caveMap = array_column($digest, null, 'id');
    $articleMap = array_column($articles, null, 'id');
    $matchedCaves = [];
    foreach (($answer['matchedCaves'] ?? []) as $match) {
        if (!is_array($match) || !is_string($match['caveId'] ?? null) || !isset($caveMap[$match['caveId']])) {
            continue;
        }
        $cave = $caveMap[$match['caveId']];
        $matchedCaves[] = [
            'caveId' => $cave['id'],
            'name' => $cave['name'],
            'karstRegion' => $cave['karstRegion'],
            'relevanceReason' => is_string($match['relevanceReason'] ?? null) ? $match['relevanceReason'] : '',
            'latestLengthM' => $cave['latestLengthM'],
            'latestDepthM' => $cave['latestDepthM'],
        ];
    }
    $matchedArticles = [];
    foreach (($answer['matchedArticleIds'] ?? []) as $match) {
        if (!is_array($match) || !isset($match['id'], $articleMap[$match['id']])) {
            continue;
        }
        $article = $articleMap[$match['id']];
        $article['relevanceReason'] = is_string($match['relevanceReason'] ?? null) ? $match['relevanceReason'] : '';
        $matchedArticles[] = $article;
    }
    return [
        'query' => $query,
        'answerSummary' => is_string($answer['answerSummary'] ?? null) ? $answer['answerSummary'] : $result['answerSummary'],
        'matchedCaves' => $matchedCaves,
        'matchedArticles' => $matchedArticles ?: $articles,
    ];
}

function extractPdf(array $body): array
{
    $preference = $body['tablePreference'] ?? 'auto';
    if (!in_array($preference, ['auto', 'length', 'depth'], true)) {
        fail(400, 'Neplatný typ tabuľky.');
    }
    $instruction = 'Zo slovenského Spravodaja SSS extrahuj tabuľku najdlhších alebo najhlbších jaskýň. ' .
        'Preferencia: ' . $preference . '. Uveď rok, zdroj, autora a všetky riadky. ' .
        'Pre každý riadok uveď poradie, názov, krasovú oblasť, podcelok, hodnotu v metroch, ' .
        'prípadnú poznámku v zátvorke, hviezdičku a tučné zvýraznenie. ' .
        'Nevymýšľaj údaje; ak je hodnota nečitateľná, riadok vynechaj.';
    $parts = [['text' => $instruction]];
    $sourceUrl = 'https://sss.sk/spravodaj/';
    if (is_string($body['rawText'] ?? null) && strlen(trim($body['rawText'])) > 20) {
        $parts[] = ['text' => $body['rawText']];
    } elseif (is_string($body['pdfBase64'] ?? null) && $body['pdfBase64'] !== '') {
        $base64 = preg_replace('/^data:application\/pdf;base64,/', '', $body['pdfBase64']);
        $decoded = base64_decode($base64, true);
        if ($decoded === false || strlen($decoded) > 24 * 1024 * 1024 || !str_starts_with($decoded, '%PDF-')) {
            fail(400, 'Neplatný PDF súbor alebo súbor väčší ako 24 MB.');
        }
        $parts[] = ['inlineData' => ['mimeType' => 'application/pdf', 'data' => base64_encode($decoded)]];
    } elseif (is_string($body['pdfUrl'] ?? null) && $body['pdfUrl'] !== '') {
        $url = $body['pdfUrl'];
        $parsed = parse_url($url);
        if (($parsed['scheme'] ?? '') !== 'https' ||
            !in_array(strtolower($parsed['host'] ?? ''), ['sss.sk', 'www.sss.sk'], true) ||
            !str_starts_with($parsed['path'] ?? '', '/wp-content/uploads/') ||
            !preg_match('/\.pdf$/i', $parsed['path'] ?? '') ||
            isset($parsed['user']) || isset($parsed['pass']) || isset($parsed['port'])) {
            fail(400, 'PDF URL musí viesť do archívu sss.sk.');
        }
        try {
            $pdf = fetchExternal($url, 24 * 1024 * 1024);
        } catch (Throwable $exception) {
            fail(502, 'PDF z archívu SSS sa nepodarilo stiahnuť.');
        }
        if (!str_starts_with($pdf, '%PDF-')) {
            fail(502, 'Zdroj neobsahuje platný PDF súbor.');
        }
        $sourceUrl = $url;
        $parts[] = ['inlineData' => ['mimeType' => 'application/pdf', 'data' => base64_encode($pdf)]];
    } else {
        fail(400, 'Zadajte PDF URL, nahrajte PDF súbor alebo vložte text tabuľky.');
    }

    $schema = [
        'type' => 'OBJECT',
        'properties' => [
            'tableType' => ['type' => 'STRING'],
            'year' => ['type' => 'INTEGER'],
            'issueLabel' => ['type' => 'STRING'],
            'statusDate' => ['type' => 'STRING'],
            'author' => ['type' => 'STRING'],
            'footnotes' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
            'rawSummary' => ['type' => 'STRING'],
            'rows' => ['type' => 'ARRAY', 'items' => [
                'type' => 'OBJECT',
                'properties' => [
                    'rank' => ['type' => 'INTEGER'],
                    'name' => ['type' => 'STRING'],
                    'karstRegion' => ['type' => 'STRING'],
                    'subUnit' => ['type' => 'STRING'],
                    'valueM' => ['type' => 'NUMBER'],
                    'secondaryNote' => ['type' => 'STRING'],
                    'isBoldChanged' => ['type' => 'BOOLEAN'],
                    'isUnverified' => ['type' => 'BOOLEAN'],
                ],
                'required' => ['rank', 'name', 'valueM'],
            ]],
        ],
        'required' => ['tableType', 'year', 'rows'],
    ];
    $extraction = geminiResponse($parts, $schema);
    if (!in_array($extraction['tableType'] ?? null, ['length', 'depth'], true) ||
        !is_int($extraction['year'] ?? null) || !is_array($extraction['rows'] ?? null) ||
        count($extraction['rows']) > 1000) {
        fail(502, 'AI vrátila neplatnú tabuľku.');
    }
    $extraction['sourceUrl'] = $sourceUrl;
    $extraction['validationWarnings'] = [];
    $caves = readDatabase();
    foreach ($extraction['rows'] as &$row) {
        if (!is_array($row) || !is_string($row['name'] ?? null) ||
            !is_numeric($row['valueM'] ?? null) || !is_int($row['rank'] ?? null)) {
            fail(502, 'AI vrátila neplatný riadok tabuľky.');
        }
        $index = findCave($caves, $row);
        if ($index === null || $index === -1) {
            continue;
        }
        $previous = null;
        foreach ($caves[$index]['records'] as $record) {
            if ($record['year'] < $extraction['year'] && ($previous === null || $record['year'] > $previous['year'])) {
                $previous = $record;
            }
        }
        $field = $extraction['tableType'] === 'depth' ? 'depthM' : 'lengthM';
        if (isset($previous[$field])) {
            $row['prevValueM'] = $previous[$field];
            if ($row['valueM'] < $previous[$field]) {
                $message = $row['name'] . ': extrahovaná hodnota je nižšia než v predchádzajúcom ročníku.';
                $row['validationWarning'] = $message;
                $extraction['validationWarnings'][] = $message;
            }
        }
    }
    unset($row);
    return $extraction;
}
