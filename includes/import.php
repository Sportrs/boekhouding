<?php
/* =====================================================================
 *  BV BOEKHOUDING — includes/import.php
 *  Jaarrekening-PDF uitlezen (AI) -> beginbalansen + rekeningschema +
 *  vergelijkende jaarcijfers. Fase 1 van de meerjarige basis.
 * ===================================================================== */

/* Lees een jaarrekening-PDF (base64) uit tot een gestructureerd voorstel.
 * Geeft: boekjaar, vergelijkingsjaar, balans[], wenv[], compensabeleVerliezen. */
function ai_lees_jaarrekening(string $base64_pdf): array {
    $schema = <<<TXT
Je krijgt een Nederlandse jaarrekening (samenstellingsverklaring) van een BV.
Haal de balans en de winst-en-verliesrekening eruit en retourneer ALLEEN een
JSON-object (geen markdown, geen uitleg) met exact deze structuur:

{
  "bedrijfsnaam": "…",
  "boekjaar": 2025,
  "vergelijkingsjaar": 2024,
  "balans": [
    {"sectie":"activa","omschrijving":"Inventaris","rekeningnummer":"0100","type":"actief","bedragHuidig":5475,"bedragVorig":4918}
  ],
  "wenv": [
    {"sectie":"opbrengsten","omschrijving":"Netto-omzet","rekeningnummer":"8000","type":"opbrengsten","bedragHuidig":52737,"bedragVorig":10129},
    {"sectie":"kosten","omschrijving":"Kosten uitbesteed werk","rekeningnummer":"4000","type":"kosten","bedragHuidig":9479,"bedragVorig":8064}
  ],
  "compensabeleVerliezen": 0
}

REGELS:
- Neem in "balans" alleen de detail-/eindposten op (GEEN subtotalen of totalen),
  zodat de activa-posten optellen tot het balanstotaal en de passiva-posten ook.
  "type" is "actief" of "passief"; "sectie" idem "activa"/"passiva".
- Neem in "wenv" alleen de detail-opbrengst- en kostenposten op (GEEN subtotalen,
  bedrijfsresultaat of resultaat-regels). "type"/"sectie": opbrengsten of kosten.
- "bedragHuidig" = bedrag in het boekjaar, "bedragVorig" = vergelijkingsjaar.
  Alle bedragen als getal in hele euro's (geen punten/komma's, geen valutateken).
  Een bedrag dat als negatief/aftrekpost telt geef je als negatief getal.
- "rekeningnummer": stel een logisch Nederlands grootboeknummer voor
  (balans-activa 0000–1999, balans-passiva 0500–0999/1600–1999, kosten 4000–4999,
  omzet/opbrengsten 8000–8999). Gebruik 1810 voor "BTW/omzetbelasting te vorderen"
  en 1910 voor "BTW/omzetbelasting te betalen".
- "compensabeleVerliezen": het totaal nog te verrekenen fiscale verlies indien vermeld, anders 0.
TXT;

    $tekst = ai_call([
        ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => $base64_pdf]],
        ['type' => 'text', 'text' => $schema],
    ], 8000, ai_model_import());

    $d = ai_json($tekst);
    return normaliseer_jaarrekening($d);
}

function normaliseer_jaarrekening(array $d): array {
    $num = function ($v): float {
        if (is_numeric($v)) return round((float) $v, 2);
        if (is_string($v)) return round((float) str_replace([',', ' ', '.'], ['.', '', ''], $v), 2);
        return 0.0;
    };
    $post = function (array $r) use ($num): array {
        return [
            'sectie'        => (string) ($r['sectie'] ?? ''),
            'omschrijving'  => (string) ($r['omschrijving'] ?? ''),
            'rekeningnummer'=> trim((string) ($r['rekeningnummer'] ?? '')),
            'type'          => (string) ($r['type'] ?? ''),
            'bedragHuidig'  => $num($r['bedragHuidig'] ?? 0),
            'bedragVorig'   => $num($r['bedragVorig'] ?? 0),
        ];
    };
    return [
        'bedrijfsnaam'         => (string) ($d['bedrijfsnaam'] ?? ''),
        'boekjaar'             => (int) ($d['boekjaar'] ?? 0),
        'vergelijkingsjaar'    => (int) ($d['vergelijkingsjaar'] ?? 0),
        'balans'               => array_map($post, array_filter($d['balans'] ?? [], 'is_array')),
        'wenv'                 => array_map($post, array_filter($d['wenv'] ?? [], 'is_array')),
        'compensabeleVerliezen'=> $num($d['compensabeleVerliezen'] ?? 0),
    ];
}

/* Sla de (door de gebruiker gecontroleerde) jaarrekening op:
 * - jaarcijfers voor boekjaar + vergelijkingsjaar (vergelijkende cijfers)
 * - rekeningen: beginbalans (opening_saldo = boekjaar-bedrag) + rekeningschema
 * - compensabele verliezen als instelling. */
function import_jaarrekening_commit(array $in): array {
    $boekjaar = (int) ($in['boekjaar'] ?? 0);
    $vorig    = (int) ($in['vergelijkingsjaar'] ?? ($boekjaar - 1));
    if ($boekjaar < 2000) throw new RuntimeException('Ongeldig boekjaar.');

    $balans = is_array($in['balans'] ?? null) ? $in['balans'] : [];
    $wenv   = is_array($in['wenv'] ?? null) ? $in['wenv'] : [];

    $geldigType = ['actief', 'passief', 'kosten', 'opbrengsten'];
    $num = fn($v) => round((float) (is_string($v) ? str_replace(',', '.', $v) : $v), 2);

    db()->beginTransaction();

    // 1) Vergelijkende jaarcijfers vervangen voor deze twee jaren.
    db()->prepare("DELETE FROM jaarcijfers WHERE jaar IN (:a, :b)")->execute([':a' => $boekjaar, ':b' => $vorig]);
    $jc = db()->prepare(
        "INSERT INTO jaarcijfers (jaar, soort, sectie, omschrijving, rekeningnummer, bedrag, volgorde)
         VALUES (:jaar, :soort, :sectie, :oms, :nr, :bedrag, :vol)"
    );
    $vol = 0;
    foreach ([['balans', $balans], ['wenv', $wenv]] as [$soort, $lijst]) {
        foreach ($lijst as $p) {
            $oms = trim((string) ($p['omschrijving'] ?? ''));
            if ($oms === '') continue;
            $nr = trim((string) ($p['rekeningnummer'] ?? ''));
            $sectie = (string) ($p['sectie'] ?? '');
            $jc->execute([':jaar' => $boekjaar, ':soort' => $soort, ':sectie' => $sectie, ':oms' => $oms, ':nr' => $nr ?: null, ':bedrag' => $num($p['bedragHuidig'] ?? 0), ':vol' => $vol]);
            $jc->execute([':jaar' => $vorig,    ':soort' => $soort, ':sectie' => $sectie, ':oms' => $oms, ':nr' => $nr ?: null, ':bedrag' => $num($p['bedragVorig'] ?? 0),  ':vol' => $vol]);
            $vol++;
        }
    }

    // 2) Rekeningschema + beginbalansen. Balansposten -> opening_saldo; W&V -> 0.
    $ins = db()->prepare(
        "INSERT INTO rekeningen (nummer, naam, type, systeem, opening_saldo)
         VALUES (:nr, :naam, :type, 0, :saldo)
         ON DUPLICATE KEY UPDATE naam = VALUES(naam), opening_saldo = VALUES(opening_saldo)"
    );
    $aangemaakt = 0;
    foreach ([['balans', $balans, true], ['wenv', $wenv, false]] as [$soort, $lijst, $isBalans]) {
        foreach ($lijst as $p) {
            $nr   = trim((string) ($p['rekeningnummer'] ?? ''));
            $naam = trim((string) ($p['omschrijving'] ?? ''));
            $type = (string) ($p['type'] ?? '');
            if ($nr === '' || $naam === '' || !in_array($type, $geldigType, true)) continue;

            // Systeemrekeningen (1810/1910): alleen beginsaldo bijwerken, type/naam met rust laten.
            $bestaand = db()->prepare("SELECT systeem FROM rekeningen WHERE nummer = :nr LIMIT 1");
            $bestaand->execute([':nr' => $nr]);
            $rij = $bestaand->fetch();
            $saldo = $isBalans ? $num($p['bedragHuidig'] ?? 0) : 0;

            if ($rij && (int) $rij['systeem'] === 1) {
                db()->prepare("UPDATE rekeningen SET opening_saldo = :s WHERE nummer = :nr")
                    ->execute([':s' => $saldo, ':nr' => $nr]);
            } else {
                $ins->execute([':nr' => $nr, ':naam' => $naam, ':type' => $type, ':saldo' => $saldo]);
            }
            $aangemaakt++;
        }
    }

    db()->commit();

    // 3) Memo's als instellingen.
    if (isset($in['compensabeleVerliezen'])) {
        bh_instelling_zet('compensabeleVerliezen', (string) $num($in['compensabeleVerliezen']));
    }
    if (($in['bedrijfsnaam'] ?? '') !== '' && bh_instelling('bedrijfsnaam', '') === '') {
        bh_instelling_zet('bedrijfsnaam', (string) $in['bedrijfsnaam']);
    }

    return ['ok' => true, 'rekeningen' => $aangemaakt, 'boekjaar' => $boekjaar, 'vergelijkingsjaar' => $vorig];
}

/* Opgeslagen vergelijkende cijfers ophalen, gegroepeerd per jaar/soort. */
function jaarcijfers_ophalen(): array {
    $rows = db()->query("SELECT jaar, soort, sectie, omschrijving, rekeningnummer, bedrag, volgorde
                         FROM jaarcijfers ORDER BY jaar DESC, soort, volgorde")->fetchAll();
    foreach ($rows as &$r) { $r['jaar'] = (int) $r['jaar']; $r['bedrag'] = (float) $r['bedrag']; }
    return $rows;
}
