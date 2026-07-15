<?php
/* =====================================================================
 *  BV BOEKHOUDING — includes/csv_ing.php
 *  Parser voor ING CSV-export ("Kommagescheiden"). Kolommen:
 *    Datum, Naam / Omschrijving, Rekening, Tegenrekening, Code,
 *    Af Bij, Bedrag (EUR), Mutatiesoort, Mededelingen
 *  Levert dezelfde regel-vorm als de MT940-parser, zodat de import
 *  beide formaten uniform kan verwerken.
 * ===================================================================== */

/* Herkent dit een ING CSV-export? */
function ing_csv_is(string $inhoud): bool {
    $kop = mb_strtolower(mb_substr($inhoud, 0, 400));
    return str_contains($kop, 'naam / omschrijving') || (str_contains($kop, '"datum"') && str_contains($kop, 'af bij'));
}

function ing_csv_parse(string $inhoud): array {
    $inhoud = str_replace(["\r\n", "\r"], "\n", $inhoud);
    // BOM verwijderen
    $inhoud = preg_replace('/^\xEF\xBB\xBF/', '', $inhoud);

    $fh = fopen('php://temp', 'r+');
    fwrite($fh, $inhoud);
    rewind($fh);

    $idx = null;
    $iban = '';
    $regels = [];
    while (($row = fgetcsv($fh, 0, ',', '"', '')) !== false) {
        if ($row === null || (count($row) === 1 && ($row[0] === null || trim((string) $row[0]) === ''))) continue;
        if ($idx === null) {
            $idx = [];
            foreach ($row as $i => $h) $idx[mb_strtolower(trim((string) $h))] = $i;
            continue;
        }
        $get = function (string $naam) use ($row, $idx) {
            return isset($idx[$naam], $row[$idx[$naam]]) ? trim((string) $row[$idx[$naam]]) : '';
        };

        $datum = ing_csv_datum($get('datum'));
        if ($datum === '') continue;
        $bedragTekst = $get('bedrag (eur)') !== '' ? $get('bedrag (eur)') : $get('bedrag');
        $bedrag = ing_csv_bedrag($bedragTekst);
        $afbij = mb_strtolower($get('af bij')) === 'af' ? 'af' : 'bij';
        if ($iban === '') $iban = $get('rekening');

        $regels[] = [
            'datum'              => $datum,
            'bedrag'             => $bedrag,
            'afbij'              => $afbij,
            'code'               => $get('code'),
            'tegenrekening_iban' => $get('tegenrekening'),
            'tegenrekening_naam' => $get('naam / omschrijving'),
            'omschrijving'       => $get('mededelingen') !== '' ? $get('mededelingen') : $get('naam / omschrijving'),
            'ruw'                => implode(' | ', array_map(fn($v) => (string) $v, $row)),
        ];
    }
    fclose($fh);
    return ['iban' => $iban, 'beginsaldo' => null, 'eindsaldo' => null, 'regels' => $regels];
}

/* ING-datum: 'YYYYMMDD', of 'DD-MM-YYYY' / 'YYYY-MM-DD'. */
function ing_csv_datum(string $s): string {
    $s = trim($s);
    if (preg_match('/^(\d{4})(\d{2})(\d{2})$/', $s, $m)) return "$m[1]-$m[2]-$m[3]";
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s)) return $s;
    if (preg_match('/^(\d{2})-(\d{2})-(\d{4})$/', $s, $m)) return "$m[3]-$m[2]-$m[1]";
    return '';
}

/* '1.234,56' of '1234,56' of '45.20' -> float (positief). */
function ing_csv_bedrag(string $s): float {
    $s = trim($s);
    if (str_contains($s, ',')) {
        $s = str_replace('.', '', $s);   // duizendtalpunten weg
        $s = str_replace(',', '.', $s);  // decimaalkomma
    }
    return round(abs((float) $s), 2);
}
