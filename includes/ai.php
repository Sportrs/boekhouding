<?php
/* =====================================================================
 *  BV BOEKHOUDING — includes/ai.php
 *  PDF-facturen laten uitlezen door Claude (Anthropic Messages-API).
 *  Vereist ANTHROPIC_API_KEY in config.php. Stuurt de PDF als base64
 *  'document'-block mee en vraagt om een JSON-object terug.
 * ===================================================================== */

// API-sleutel: eerst de in-app instelling (DB), anders de config-constante.
function ai_api_key(): string {
    try {
        $q = db()->prepare("SELECT waarde FROM instellingen WHERE sleutel = 'anthropicApiKey' LIMIT 1");
        $q->execute();
        $w = (string) ($q->fetchColumn() ?: '');
        if ($w !== '') return $w;
    } catch (Throwable $e) {
        // instellingen-tabel bestaat mogelijk nog niet — val terug op config.
    }
    return defined('ANTHROPIC_API_KEY') ? (string) ANTHROPIC_API_KEY : '';
}

function ai_beschikbaar(): bool {
    return ai_api_key() !== '';
}

function ai_model(): string {
    return (defined('BOEKHOUDING_AI_MODEL') && BOEKHOUDING_AI_MODEL)
        ? BOEKHOUDING_AI_MODEL
        : 'claude-haiku-4-5-20251001';
}

/* Lees een base64-gecodeerde PDF uit. Geeft een associatieve array terug
 * met factuurvelden, of gooit een Exception bij een fout. */
function ai_lees_factuur(string $base64_pdf): array {
    if (!ai_beschikbaar()) {
        throw new RuntimeException('Geen Anthropic API-sleutel ingesteld. Vul deze in bij Instellingen.');
    }

    $prompt = "Lees deze factuur en retourneer ALLEEN een JSON-object (geen markdown):\n"
        . "{\n"
        . "  \"leverancier\": \"naam leverancier\",\n"
        . "  \"factuurNummer\": \"factuurnummer\",\n"
        . "  \"factuurDatum\": \"YYYY-MM-DD\",\n"
        . "  \"omschrijving\": \"korte omschrijving van de dienst/het product\",\n"
        . "  \"bedragExBTW\": 0.00,\n"
        . "  \"btwBedrag\": 0.00,\n"
        . "  \"btwPercentage\": 21\n"
        . "}\n"
        . "Als er geen BTW is, zet btwBedrag en btwPercentage op 0.";

    $payload = [
        'model'      => ai_model(),
        'max_tokens' => 512,
        'messages'   => [[
            'role'    => 'user',
            'content' => [
                [
                    'type'   => 'document',
                    'source' => [
                        'type'       => 'base64',
                        'media_type' => 'application/pdf',
                        'data'       => $base64_pdf,
                    ],
                ],
                ['type' => 'text', 'text' => $prompt],
            ],
        ]],
    ];

    $endpoint = 'https://api.anthropic.com/v1/messages';
    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => [
            'content-type: application/json',
            'x-api-key: ' . ai_api_key(),
            'anthropic-version: 2023-06-01',
        ],
        CURLOPT_POSTFIELDS     => json_encode($payload),
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($res === false) {
        $err = curl_error($ch);
        error_log('Anthropic-call mislukt: ' . $err);
        throw new RuntimeException('Kon de AI niet bereiken: ' . $err);
    }
    if ($code < 200 || $code >= 300) {
        error_log('Anthropic-fout ' . $code . ': ' . substr((string) $res, 0, 500));
        throw new RuntimeException('AI gaf een fout (' . $code . ').');
    }

    $d = json_decode($res, true);
    $tekst = '';
    foreach ($d['content'] ?? [] as $blok) {
        if (($blok['type'] ?? '') === 'text') $tekst .= $blok['text'];
    }

    return ai_parse_factuur_json($tekst);
}

/* Parse het JSON-object uit de AI-tekst, ook met markdown-fences eromheen. */
function ai_parse_factuur_json(string $tekst): array {
    $ruw = trim($tekst);
    if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $ruw, $m)) {
        $ruw = trim($m[1]);
    }
    if (substr($ruw, 0, 1) !== '{') {
        $start = strpos($ruw, '{');
        $eind  = strrpos($ruw, '}');
        if ($start !== false && $eind !== false && $eind > $start) {
            $ruw = substr($ruw, $start, $eind - $start + 1);
        }
    }
    $data = json_decode($ruw, true);
    if (!is_array($data)) {
        throw new RuntimeException('Kon de factuurdata niet uitlezen (ongeldige AI-respons).');
    }

    $num = function ($v): float {
        if (is_numeric($v)) return (float) $v;
        if (is_string($v)) return (float) str_replace(',', '.', $v);
        return 0.0;
    };
    $str = fn($v) => is_string($v) ? $v : '';

    return [
        'leverancier'   => $str($data['leverancier']  ?? ''),
        'factuurNummer' => $str($data['factuurNummer'] ?? ''),
        'factuurDatum'  => $str($data['factuurDatum']  ?? ''),
        'omschrijving'  => $str($data['omschrijving']  ?? ''),
        'bedragExBTW'   => $num($data['bedragExBTW']   ?? 0),
        'btwBedrag'     => $num($data['btwBedrag']     ?? 0),
        'btwPercentage' => $num($data['btwPercentage'] ?? 0),
    ];
}
