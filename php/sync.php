<?php
declare(strict_types=1);

function parseRankings(string $html, string $metric, string $url): array
{
    preg_match_all('~<div\b[^>]*data-tab=["\']tab-(20\d{2})["\'][^>]*>.*?<table\b[^>]*>(.*?)</table>~is', $html, $tables, PREG_SET_ORDER);
    $result = [];
    foreach (array_slice($tables, 0, 2) as $table) {
        $year = (int) $table[1];
        preg_match_all('~<tr\b[^>]*>(.*?)</tr>~is', $table[2], $rows);
        foreach ($rows[1] as $row) {
            preg_match_all('~<td\b[^>]*>(.*?)</td>~is', $row, $cells);
            if (count($cells[1]) < 5) {
                continue;
            }
            $text = array_map(static fn($cell) => trim(preg_replace('/\s+/u', ' ',
                html_entity_decode(strip_tags($cell), ENT_QUOTES | ENT_HTML5, 'UTF-8'))), $cells[1]);
            if (!preg_match('/^\d+/', $text[0], $rank) ||
                !preg_match('/^([0-9][0-9\s\x{00a0}\x{202f}]*(?:[.,]\d+)?)/u', $text[4], $value)) {
                continue;
            }
            $number = (float) str_replace(',', '.', preg_replace('/[\s\x{00a0}\x{202f}]/u', '', $value[1]));
            if ($number <= 0 || $text[1] === '') {
                continue;
            }
            $result[] = [
                'year' => $year,
                'metric' => $metric,
                'rank' => (int) $rank[0],
                'name' => $text[1],
                'karstRegion' => $text[2],
                'subUnit' => $text[3],
                'valueM' => $number,
                'isBoldChanged' => (bool) preg_match('~<(?:strong|b)\b~i', $cells[1][1] . $cells[1][4]),
                'isUnverified' => str_contains($text[4], '*'),
                'sourceUrl' => $url,
            ];
        }
    }
    return $result;
}

function syncRankings(): array
{
    $sources = [
        'length' => 'https://sss.sk/tabulka-najdlhsich-jaskyn-na-slovensku/',
        'depth' => 'https://sss.sk/tabulka-najhlbsich-jaskyn-na-slovensku/',
    ];
    $rows = [];
    foreach ($sources as $metric => $url) {
        try {
            $parsed = parseRankings(fetchExternal($url, 4000000), $metric, $url);
        } catch (Throwable $exception) {
            fail(502, 'Rebríčky SSS sa nepodarilo načítať; databáza sa nezmenila.');
        }
        if (!$parsed) {
            fail(502, 'Rebríček SSS nemá očakávaný formát; databáza sa nezmenila.');
        }
        $rows = array_merge($rows, $parsed);
    }
    return mergeRankings($rows);
}

function mergeRankings(array $rows): array
{
    $lock = @fopen(privateDirectory() . '/caves-db.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        fail(503, 'Databázu sa nepodarilo uzamknúť.');
    }
    try {
        $caves = readDatabase();
        $updated = 0;
        $created = 0;
        $years = [];
        foreach ($rows as $row) {
            $year = $row['year'];
            $years[$year] = true;
            $index = findCave($caves, $row);
            if ($index === -1) {
                continue;
            }
            if ($index === null) {
                $id = str_replace(' ', '-', normalizeName($row['name']));
                if ($id === '' || in_array($id, array_column($caves, 'id'), true)) {
                    continue;
                }
                $caves[] = [
                    'id' => $id,
                    'name' => $row['name'],
                    'karstRegion' => $row['karstRegion'],
                    'subUnit' => $row['subUnit'],
                    'description' => 'Lokalita evidovaná v oficiálnom rebríčku SSS.',
                    'sssUrl' => $row['sourceUrl'],
                    'records' => [],
                ];
                $index = count($caves) - 1;
                $created++;
            }
            $field = $row['metric'] === 'depth' ? 'depthM' : 'lengthM';
            $recordIndex = null;
            foreach ($caves[$index]['records'] as $i => $record) {
                if ($record['year'] === $year) {
                    $recordIndex = $i;
                    break;
                }
            }
            if ($recordIndex !== null && isset($caves[$index]['records'][$recordIndex][$field])) {
                continue;
            }
            // Do not fill a gap if it contradicts a neighbouring measurement.
            $conflict = false;
            foreach ($caves[$index]['records'] as $record) {
                if (!isset($record[$field])) {
                    continue;
                }
                if (($record['year'] < $year && $record[$field] > $row['valueM']) ||
                    ($record['year'] > $year && $record[$field] < $row['valueM'])) {
                    $conflict = true;
                    break;
                }
            }
            if ($conflict) {
                continue;
            }
            if ($recordIndex === null) {
                $caves[$index]['records'][] = [
                    'year' => $year,
                    'statusDate' => "31. 3. $year",
                    'lengthM' => null,
                    'depthM' => null,
                    'sourceIssue' => "Rebríček SSS ($year)",
                    'sourcePdfUrl' => $row['sourceUrl'],
                    'author' => 'Ján Tencer',
                ];
                $recordIndex = count($caves[$index]['records']) - 1;
            }
            $record = &$caves[$index]['records'][$recordIndex];
            $record[$field] = $row['valueM'];
            $record[$row['metric'] === 'depth' ? 'rankDepth' : 'rankLength'] = $row['rank'];
            $record[$row['metric'] === 'depth' ? 'isBoldDepth' : 'isBoldLength'] = $row['isBoldChanged'];
            if ($row['isUnverified']) {
                $record['isUnverified'] = true;
            }
            unset($record);
            usort($caves[$index]['records'], static fn($a, $b) => $a['year'] <=> $b['year']);
            $updated++;
        }
        if ($updated) {
            writeDatabase($caves);
        }
        $parsedYears = array_map('intval', array_keys($years));
        rsort($parsedYears);
        return ['updatedCount' => $updated, 'createdCount' => $created, 'parsedYears' => $parsedYears, 'caves' => publicCaves($caves)];
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
