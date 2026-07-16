<?php
/* =====================================================================
 *  BV BOEKHOUDING — includes/import.php
 *  Jaarrekening-PDF uitlezen (AI) -> beginbalansen + rekeningschema +
 *  vergelijkende jaarcijfers + toelichtingen (verloopschema's) +
 *  deelnemingen (met status). Fase 1 van de meerjarige basis.
 * ===================================================================== */

/* Lees een jaarrekening-PDF (base64) uit tot een gestructureerd voorstel. */
function ai_lees_jaarrekening(string $base64_pdf): array {
    $schema = <<<TXT
Je krijgt een Nederlandse jaarrekening (samenstellingsverklaring) van een BV.
Retourneer ALLEEN een JSON-object (geen markdown, geen uitleg) met exact deze structuur:

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
  "toelichtingen": [
    {"rekeningnummer":"0100","post":"Inventaris","regels":[
      {"label":"Stand per 1 januari","bedrag":4918},
      {"label":"Investeringen","bedrag":3060},
      {"label":"Afschrijvingen","bedrag":-2503},
      {"label":"Stand per 31 december","bedrag":5475}
    ]}
  ],
  "deelnemingen": [
    {"naam":"ClubCows B.V.","rekeningnummer":"0300","aandeel":"25%","status":"In 2025 opgericht; nog geen activiteiten","verloop":[
      {"label":"Stand per 1 januari","bedrag":0},
      {"label":"Investeringen","bedrag":250},
      {"label":"Stand per 31 december","bedrag":250}
    ]}
  ],
  "compensabeleVerliezen": 0
}

REGELS:
- "balans": alleen detail-/eindposten (GEEN subtotalen/totalen); activa-posten tellen op tot
  het balanstotaal, passiva-posten idem. "type"/"sectie": actief/activa of passief/passiva.
- "wenv": alleen detail-opbrengst- en kostenposten (GEEN subtotalen/resultaatregels).
- Bedragen als getal in hele euro's (geen punten/komma's/valutateken). Aftrekposten negatief.
- "bedragHuidig" = boekjaar, "bedragVorig" = vergelijkingsjaar.
- "rekeningnummer": stel een logisch Nederlands grootboeknummer voor (activa 0000–1999,
  passiva 0500–0999/1600–1999, kosten 4000–4999, opbrengsten 8000–8999). Gebruik 1810 voor
  "BTW/omzetbelasting te vorderen" en 1910 voor "BTW/omzetbelasting te betalen".
- "toelichtingen": voor balansposten die in de toelichting een verloop hebben (o.a. materiële
  vaste activa, leningen, eigen vermogen), het verloop van het BOEKJAAR: Stand 1-1, mutaties
  (investeringen, afschrijvingen, aflossingen, dotaties, onttrekkingen), Stand 31-12.
- "deelnemingen": ALLE genoemde deelnemingen/participaties (ook opgeheven/failliete), met
  "aandeel" (percentage of "-"), een korte "status" (bv opgericht/afgewaardeerd/failliet/
  opgeheven en in welk jaar), en het "verloop" van het boekjaar.
- "compensabeleVerliezen": totaal nog te verrekenen fiscaal verlies indien vermeld, anders 0.
TXT;

    $tekst = ai_call([
        ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => $base64_pdf]],
        ['type' => 'text', 'text' => $schema],
    ], 16000, ai_model_import());

    return normaliseer_jaarrekening(ai_json($tekst));
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
    $regels = function ($arr) use ($num): array {
        $out = [];
        foreach ((is_array($arr) ? $arr : []) as $reg) {
            if (!is_array($reg)) continue;
            $out[] = ['label' => (string) ($reg['label'] ?? ''), 'bedrag' => $num($reg['bedrag'] ?? 0)];
        }
        return $out;
    };
    $toel = [];
    foreach ((is_array($d['toelichtingen'] ?? null) ? $d['toelichtingen'] : []) as $t) {
        if (!is_array($t)) continue;
        $toel[] = [
            'rekeningnummer' => trim((string) ($t['rekeningnummer'] ?? '')),
            'post'           => (string) ($t['post'] ?? ''),
            'regels'         => $regels($t['regels'] ?? []),
        ];
    }
    $deeln = [];
    foreach ((is_array($d['deelnemingen'] ?? null) ? $d['deelnemingen'] : []) as $x) {
        if (!is_array($x)) continue;
        $deeln[] = [
            'naam'           => (string) ($x['naam'] ?? ''),
            'rekeningnummer' => trim((string) ($x['rekeningnummer'] ?? '')),
            'aandeel'        => (string) ($x['aandeel'] ?? ''),
            'status'         => (string) ($x['status'] ?? ''),
            'verloop'        => $regels($x['verloop'] ?? []),
        ];
    }
    return [
        'bedrijfsnaam'         => (string) ($d['bedrijfsnaam'] ?? ''),
        'boekjaar'             => (int) ($d['boekjaar'] ?? 0),
        'vergelijkingsjaar'    => (int) ($d['vergelijkingsjaar'] ?? 0),
        'balans'               => array_map($post, array_filter($d['balans'] ?? [], 'is_array')),
        'wenv'                 => array_map($post, array_filter($d['wenv'] ?? [], 'is_array')),
        'toelichtingen'        => $toel,
        'deelnemingen'         => $deeln,
        'compensabeleVerliezen'=> $num($d['compensabeleVerliezen'] ?? 0),
    ];
}

/* Sla de (gecontroleerde) jaarrekening op. */
function import_jaarrekening_commit(array $in): array {
    $boekjaar = (int) ($in['boekjaar'] ?? 0);
    $vorig    = (int) ($in['vergelijkingsjaar'] ?? ($boekjaar - 1));
    if ($boekjaar < 2000) throw new RuntimeException('Ongeldig boekjaar.');
    // Alleen vergelijkende cijfers: rekeningschema + beginbalans niet aanraken
    // (bv. wanneer die al uit een XAF-import komen).
    $alleenVergelijkend = !empty($in['alleenVergelijkend']);

    $balans = is_array($in['balans'] ?? null) ? $in['balans'] : [];
    $wenv   = is_array($in['wenv'] ?? null) ? $in['wenv'] : [];
    $toel   = is_array($in['toelichtingen'] ?? null) ? $in['toelichtingen'] : [];
    $deeln  = is_array($in['deelnemingen'] ?? null) ? $in['deelnemingen'] : [];

    $geldigType = ['actief', 'passief', 'kosten', 'opbrengsten'];
    $num = fn($v) => round((float) (is_string($v) ? str_replace(',', '.', $v) : $v), 2);

    db()->beginTransaction();

    // 1) Vergelijkende jaarcijfers.
    db()->prepare("DELETE FROM jaarcijfers WHERE jaar IN (:a, :b)")->execute([':a' => $boekjaar, ':b' => $vorig]);
    $jc = db()->prepare("INSERT INTO jaarcijfers (jaar, soort, sectie, omschrijving, rekeningnummer, bedrag, volgorde)
                         VALUES (:jaar, :soort, :sectie, :oms, :nr, :bedrag, :vol)");
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

    // 2) Rekeningschema + beginbalansen.
    //    De jaarrekening is de enige bron van de beginbalans: wis eerst alle
    //    oude beginsaldi, zodat een her-import geen dubbele posten oplevert.
    $aangemaakt = 0;
    if (!$alleenVergelijkend) {
    db()->exec("UPDATE rekeningen SET opening_saldo = 0");
    $ins = db()->prepare("INSERT INTO rekeningen (nummer, naam, type, systeem, opening_saldo)
                          VALUES (:nr, :naam, :type, 0, :saldo)
                          ON DUPLICATE KEY UPDATE naam = VALUES(naam), opening_saldo = VALUES(opening_saldo)");
    $importedNrs = [];
    foreach ([['balans', $balans, true], ['wenv', $wenv, false]] as [$soort, $lijst, $isBalans]) {
        foreach ($lijst as $p) {
            $nr   = trim((string) ($p['rekeningnummer'] ?? ''));
            $naam = trim((string) ($p['omschrijving'] ?? ''));
            $type = (string) ($p['type'] ?? '');
            if ($nr === '' || $naam === '' || !in_array($type, $geldigType, true)) continue;
            $bestaand = db()->prepare("SELECT systeem FROM rekeningen WHERE nummer = :nr LIMIT 1");
            $bestaand->execute([':nr' => $nr]);
            $rij = $bestaand->fetch();
            $saldo = $isBalans ? $num($p['bedragHuidig'] ?? 0) : 0;
            if ($rij && (int) $rij['systeem'] === 1) {
                db()->prepare("UPDATE rekeningen SET opening_saldo = :s WHERE nummer = :nr")->execute([':s' => $saldo, ':nr' => $nr]);
            } else {
                $ins->execute([':nr' => $nr, ':naam' => $naam, ':type' => $type, ':saldo' => $saldo]);
            }
            $importedNrs[] = $nr;
            $aangemaakt++;
        }
    }

    // Ruim wees-rekeningen op: niet-systeem, zonder beginsaldo, niet in deze
    // jaarrekening én zonder boekingen (bv. dubbelingen uit een eerdere import).
    if ($importedNrs) {
        $ph = implode(',', array_fill(0, count($importedNrs), '?'));
        db()->prepare(
            "DELETE FROM rekeningen
             WHERE systeem = 0 AND opening_saldo = 0
               AND nummer NOT IN ($ph)
               AND nummer NOT IN (SELECT rekening FROM transactie_regels)"
        )->execute($importedNrs);
    }

    // Markeer bank-/kasrekeningen (liquide middelen) automatisch, zodat het
    // banksaldo en "betaald via" ze herkennen ook zonder "bank" in de naam.
    db()->exec("UPDATE rekeningen SET is_bank = 1 WHERE type = 'actief' AND (naam LIKE '%bank%' OR naam LIKE '%bunq%' OR naam LIKE '%ING%' OR naam LIKE '%liquide%' OR naam LIKE '%kas%' OR naam LIKE '%giro%')");
    } // einde !$alleenVergelijkend

    // 3) Toelichtingen (verloop) + deelnemingen — vervang voor het boekjaar.
    db()->prepare("DELETE FROM toelichtingen WHERE jaar = :j")->execute([':j' => $boekjaar]);
    $ti = db()->prepare("INSERT INTO toelichtingen (jaar, soort, rekeningnummer, post, label, bedrag, tekst, volgorde)
                         VALUES (:jaar, :soort, :nr, :post, :label, :bedrag, :tekst, :vol)");
    foreach ($toel as $t) {
        $post = trim((string) ($t['post'] ?? ''));
        if ($post === '') continue;
        $nr = trim((string) ($t['rekeningnummer'] ?? ''));
        $v = 0;
        foreach ((is_array($t['regels'] ?? null) ? $t['regels'] : []) as $reg) {
            $ti->execute([':jaar' => $boekjaar, ':soort' => 'verloop', ':nr' => $nr ?: null, ':post' => $post,
                          ':label' => (string) ($reg['label'] ?? ''), ':bedrag' => $num($reg['bedrag'] ?? 0), ':tekst' => null, ':vol' => $v++]);
        }
    }
    foreach ($deeln as $x) {
        $naam = trim((string) ($x['naam'] ?? ''));
        if ($naam === '') continue;
        $nr = trim((string) ($x['rekeningnummer'] ?? ''));
        $v = 0;
        if (($x['aandeel'] ?? '') !== '') {
            $ti->execute([':jaar' => $boekjaar, ':soort' => 'deelneming', ':nr' => $nr ?: null, ':post' => $naam, ':label' => 'Aandeel', ':bedrag' => null, ':tekst' => (string) $x['aandeel'], ':vol' => $v++]);
        }
        if (($x['status'] ?? '') !== '') {
            $ti->execute([':jaar' => $boekjaar, ':soort' => 'deelneming', ':nr' => $nr ?: null, ':post' => $naam, ':label' => 'Status', ':bedrag' => null, ':tekst' => (string) $x['status'], ':vol' => $v++]);
        }
        foreach ((is_array($x['verloop'] ?? null) ? $x['verloop'] : []) as $reg) {
            $ti->execute([':jaar' => $boekjaar, ':soort' => 'deelneming', ':nr' => $nr ?: null, ':post' => $naam, ':label' => (string) ($reg['label'] ?? ''), ':bedrag' => $num($reg['bedrag'] ?? 0), ':tekst' => null, ':vol' => $v++]);
        }
    }

    db()->commit();

    // Seed het (zelf beheerde) deelnemingenregister; bestaande regels blijven staan.
    require_once __DIR__ . '/deelnemingen.php';
    deelnemingen_seed($deeln);

    if (isset($in['compensabeleVerliezen'])) bh_instelling_zet('compensabeleVerliezen', (string) $num($in['compensabeleVerliezen']));
    if (($in['bedrijfsnaam'] ?? '') !== '' && bh_instelling('bedrijfsnaam', '') === '') bh_instelling_zet('bedrijfsnaam', (string) $in['bedrijfsnaam']);

    return ['ok' => true, 'rekeningen' => $aangemaakt, 'boekjaar' => $boekjaar, 'vergelijkingsjaar' => $vorig,
            'toelichtingen' => count($toel), 'deelnemingen' => count($deeln)];
}

/* Opgeslagen vergelijkende cijfers ophalen. */
function jaarcijfers_ophalen(): array {
    $rows = db()->query("SELECT jaar, soort, sectie, omschrijving, rekeningnummer, bedrag, volgorde
                         FROM jaarcijfers ORDER BY jaar DESC, soort, volgorde")->fetchAll();
    foreach ($rows as &$r) { $r['jaar'] = (int) $r['jaar']; $r['bedrag'] = (float) $r['bedrag']; }
    return $rows;
}

/* Toelichtingen (verloop + deelnemingen) ophalen. */
function toelichtingen_ophalen(): array {
    $rows = db()->query("SELECT jaar, soort, rekeningnummer, post, label, bedrag, tekst, volgorde
                         FROM toelichtingen ORDER BY soort, post, volgorde")->fetchAll();
    foreach ($rows as &$r) {
        $r['jaar'] = (int) $r['jaar'];
        $r['bedrag'] = $r['bedrag'] === null ? null : (float) $r['bedrag'];
    }
    return $rows;
}
