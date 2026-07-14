<?php
/* =====================================================================
 *  BV BOEKHOUDING — includes/mt940.php
 *  MT940-parser (o.a. bunq .sta export). Leest bankregels uit:
 *    :25: rekening (IBAN)     :60F:/:62F: begin-/eindsaldo
 *    :61: bedrag/datum/af-bij :86: tegenrekening + naam + omschrijving
 * ===================================================================== */

function mt940_parse(string $inhoud): array {
    $inhoud = str_replace(["\r\n", "\r"], "\n", $inhoud);

    $iban = '';
    if (preg_match('/:25:([^\n]+)/', $inhoud, $m)) {
        $iban = trim(preg_replace('/\s+EUR.*$/', '', trim($m[1])));
    }
    $beginsaldo = mt940_saldo($inhoud, '60F');
    $eindsaldo  = mt940_saldo($inhoud, '62F');

    $regels = [];
    if (preg_match_all('/:61:(.+?)\n:86:(.*?)(?=\n:61:|\n:62[FM]:|\n:64:|\n:65:|$)/s', $inhoud, $mm, PREG_SET_ORDER)) {
        foreach ($mm as $blk) {
            $tx = mt940_parse_61(trim($blk[1]));
            if (!$tx) continue;
            $info = mt940_parse_86(trim($blk[2]));
            $regels[] = array_merge($tx, $info, ['ruw' => trim($blk[0])]);
        }
    }
    return ['iban' => $iban, 'beginsaldo' => $beginsaldo, 'eindsaldo' => $eindsaldo, 'regels' => $regels];
}

function mt940_saldo(string $inhoud, string $tag): ?float {
    if (preg_match('/:' . $tag . ':([CD])(\d{6})[A-Z]{3}([0-9,]+)/', $inhoud, $m)) {
        $bedrag = (float) str_replace(',', '.', $m[3]);
        return round($m[1] === 'D' ? -$bedrag : $bedrag, 2);
    }
    return null;
}

/* :61: YYMMDD[MMDD]{D|C|RD|RC}amount N/F+code ... */
function mt940_parse_61(string $s): ?array {
    if (!preg_match('/^(\d{6})(\d{4})?(RC|RD|C|D)([0-9,]+)([A-Z][A-Z0-9]{3})/', $s, $m)) {
        return null;
    }
    $datum = '20' . substr($m[1], 0, 2) . '-' . substr($m[1], 2, 2) . '-' . substr($m[1], 4, 2);
    $bedrag = round((float) str_replace(',', '.', $m[4]), 2);
    $afbij = in_array($m[3], ['D', 'RC'], true) ? 'af' : 'bij';
    return ['datum' => $datum, 'bedrag' => $bedrag, 'afbij' => $afbij, 'code' => $m[5]];
}

/* :86: gestructureerd: /IBAN/.../NAME/.../REMI/...  (NAME mag zelf '/' bevatten) */
function mt940_parse_86(string $s): array {
    $iban = $naam = $remi = '';
    if (preg_match('#/IBAN/(.*?)(?=/NAME/|/REMI/|$)#s', $s, $m)) $iban = trim($m[1]);
    if (preg_match('#/NAME/(.*?)(?=/REMI/|$)#s', $s, $m)) $naam = trim($m[1]);
    if (preg_match('#/REMI/(.*)$#s', $s, $m)) $remi = trim($m[1]);
    if ($iban === '' && $naam === '' && $remi === '') $remi = $s;

    $schoon = fn($t) => trim(preg_replace('/\s+/', ' ', $t));
    return [
        'tegenrekening_iban' => $schoon($iban),
        'tegenrekening_naam' => $schoon($naam),
        'omschrijving'       => $schoon($remi),
    ];
}
