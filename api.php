<?php
/* =====================================================================
 *  BV BOEKHOUDING — api.php
 *  JSON-API. Dispatch op ?actie=... (GET voor reads, POST voor writes).
 *  Auth via PHP-sessie (single-user, wachtwoord uit config.php).
 * ===================================================================== */

ini_set('display_errors', '0');
ini_set('log_errors', '1');

require __DIR__ . '/config.php';
require __DIR__ . '/includes/auth.php';
require __DIR__ . '/includes/boekhouding.php';
require __DIR__ . '/includes/ai.php';
require __DIR__ . '/includes/import.php';
require __DIR__ . '/includes/bank.php';
require __DIR__ . '/includes/deelnemingen.php';
require __DIR__ . '/includes/ib.php';
require __DIR__ . '/includes/prive.php';
require __DIR__ . '/includes/csv_ing.php';
require __DIR__ . '/includes/xaf.php';

set_exception_handler(function (Throwable $e): void {
    error_log('Boekhouding fout: ' . $e->getMessage());
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['fout' => 'Serverfout: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
});

$in    = lees_input();
// Actie staat in de query (?actie=); voor POST met JSON-body is dat de bron.
$actie = (string) ($_GET['actie'] ?? ($in['actie'] ?? ''));

$GELDIGE_TYPES = ['actief', 'passief', 'kosten', 'opbrengsten'];

// ---- Publieke acties (geen auth) -----------------------------------
switch ($actie) {
    case 'login':  auth_login();  // stopt zelf
    case 'logout': auth_logout();
    case 'me':     auth_me();
}

// ---- Vanaf hier: auth vereist --------------------------------------
vereis_auth();
bh_ensure_systeem();

switch ($actie) {

    // ---------------- Instellingen ----------------
    case 'instellingen': {
        $configKey = defined('ANTHROPIC_API_KEY') && ANTHROPIC_API_KEY;
        json_response([
            'bedrijfsnaam'     => bh_instelling('bedrijfsnaam', ''),
            'boekjaar'         => bh_boekjaar(),
            'apiKeyConfigured' => ai_beschikbaar(),
            'apiKeyFromConfig' => (bool) $configKey,
        ]);
    }

    case 'instellingen_opslaan': {
        if (isset($in['bedrijfsnaam'])) bh_instelling_zet('bedrijfsnaam', (string) $in['bedrijfsnaam']);
        if (isset($in['boekjaar']) && preg_match('/^\d{4}$/', (string) $in['boekjaar'])) {
            bh_instelling_zet('boekjaar', (string) $in['boekjaar']);
        }
        json_response(['ok' => true]);
    }

    case 'apikey_opslaan': {
        $key = trim((string) ($in['apiKey'] ?? ''));
        bh_instelling_zet('anthropicApiKey', $key);
        json_response(['ok' => true]);
    }

    // ---------------- Rekeningen ----------------
    case 'rekeningen':
        json_response(bh_rekeningen());

    case 'rekening_opslaan': {
        $nieuw  = !empty($in['nieuw']);
        $nummer = trim((string) ($in['nummer'] ?? ''));
        $naam   = trim((string) ($in['naam'] ?? ''));
        $type   = (string) ($in['type'] ?? '');
        $opening = centen((float) ($in['openingSaldo'] ?? 0));
        $isBank = (!empty($in['isBank']) && $type === 'actief') ? 1 : 0;

        if ($nummer === '') json_response(['fout' => 'Rekeningnummer is verplicht'], 422);
        if ($naam === '')   json_response(['fout' => 'Naam is verplicht'], 422);
        if (!in_array($type, $GELDIGE_TYPES, true)) json_response(['fout' => 'Ongeldig type'], 422);

        $bestaand = db()->prepare("SELECT nummer, type, systeem FROM rekeningen WHERE nummer = :nr LIMIT 1");
        $bestaand->execute([':nr' => $nummer]);
        $rij = $bestaand->fetch();

        if ($nieuw) {
            if ($rij) json_response(['fout' => 'Er bestaat al een rekening met dit nummer'], 409);
            db()->prepare("INSERT INTO rekeningen (nummer, naam, type, systeem, is_bank, opening_saldo)
                           VALUES (:nr, :naam, :type, 0, :ib, :o)")
                ->execute([':nr' => $nummer, ':naam' => $naam, ':type' => $type, ':ib' => $isBank, ':o' => $opening]);
        } else {
            if (!$rij) json_response(['fout' => 'Rekening niet gevonden'], 404);
            if ((int) $rij['systeem'] === 1 && $type !== $rij['type']) {
                json_response(['fout' => 'Type van een systeemrekening kan niet wijzigen'], 422);
            }
            db()->prepare("UPDATE rekeningen SET naam = :naam, type = :type, is_bank = :ib, opening_saldo = :o WHERE nummer = :nr")
                ->execute([':naam' => $naam, ':type' => $type, ':ib' => $isBank, ':o' => $opening, ':nr' => $nummer]);
        }
        json_response(['ok' => true]);
    }

    case 'rekening_verwijder': {
        $nummer = trim((string) ($in['nummer'] ?? ''));
        $rij = db()->prepare("SELECT systeem FROM rekeningen WHERE nummer = :nr LIMIT 1");
        $rij->execute([':nr' => $nummer]);
        $r = $rij->fetch();
        if (!$r) json_response(['fout' => 'Rekening niet gevonden'], 404);
        if ((int) $r['systeem'] === 1) json_response(['fout' => 'Systeemrekeningen kunnen niet worden verwijderd'], 422);

        $inGebruik = db()->prepare("SELECT COUNT(*) FROM transactie_regels WHERE rekening = :nr");
        $inGebruik->execute([':nr' => $nummer]);
        if ((int) $inGebruik->fetchColumn() > 0) {
            json_response(['fout' => 'Rekening is in gebruik in boekingen en kan niet worden verwijderd'], 422);
        }
        db()->prepare("DELETE FROM rekeningen WHERE nummer = :nr")->execute([':nr' => $nummer]);
        json_response(['ok' => true]);
    }

    // ---------------- Transacties ----------------
    case 'transacties': {
        $from = isset($in['from']) && $in['from'] !== '' ? (string) $in['from'] : null;
        $to   = isset($in['to'])   && $in['to']   !== '' ? (string) $in['to']   : null;
        json_response(bh_transacties($from, $to));
    }

    case 'boeking': {
        $datum = (string) ($in['datum'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $datum)) json_response(['fout' => 'Geldige datum (YYYY-MM-DD) is verplicht'], 422);
        $omschrijving = trim((string) ($in['omschrijving'] ?? ''));
        if ($omschrijving === '') json_response(['fout' => 'Omschrijving is verplicht'], 422);
        $type = (string) ($in['type'] ?? '');
        if ($type !== 'inkoop' && $type !== 'verkoop') json_response(['fout' => 'Type moet inkoop of verkoop zijn'], 422);
        $excl = centen((float) ($in['bedragExBTW'] ?? 0));
        if (!($excl > 0)) json_response(['fout' => 'Bedrag excl. BTW moet groter dan 0 zijn'], 422);
        $regime = (string) ($in['btwPercentage'] ?? '');
        $geenBtw = ($regime === 'geen');           // buitenland: geen NL BTW, niet in aangifte
        $verlegd = ($regime === 'verlegd');        // BTW verlegd (EU): rubriek 4b + voorbelasting 5b, saldeert naar 0
        $pct = $verlegd ? 21 : ($geenBtw ? 0 : (int) $regime);
        if (!$geenBtw && !$verlegd && !in_array($pct, [21, 9, 0], true)) json_response(['fout' => 'BTW moet 21, 9, 0, geen of verlegd zijn'], 422);
        $grootboek = (string) ($in['grootboekrekening'] ?? '');
        $betaal    = (string) ($in['betaalRekening'] ?? '');
        if ($grootboek === '' || $betaal === '') json_response(['fout' => 'Grootboek- en betaalrekening zijn verplicht'], 422);

        $check = db()->prepare("SELECT COUNT(*) FROM rekeningen WHERE nummer IN (:a, :b)");
        $check->execute([':a' => $grootboek, ':b' => $betaal]);
        if ((int) $check->fetchColumn() !== 2) json_response(['fout' => 'Onbekende grootboek- of betaalrekening'], 422);

        $btwBedrag = $geenBtw ? 0.0 : centen($excl * $pct / 100);
        // Bij verlegde BTW betaalt de bank alleen het excl-bedrag (BTW saldeert intern).
        $totaal    = centen($excl + ($verlegd ? 0.0 : $btwBedrag));
        $btwCode   = $geenBtw ? null : (string) $pct;

        $regels = [];
        $richting = null;
        if ($type === 'inkoop') {
            $regels[] = [$grootboek, $excl, 0];
            if ($verlegd) {
                $regels[] = ['1810', $btwBedrag, 0];   // voorbelasting (rubriek 5b)
                $regels[] = ['1910', 0, $btwBedrag];   // verschuldigde verlegde BTW (rubriek 4b)
                $richting = 'verlegd';
            } else {
                if ($btwBedrag > 0) $regels[] = ['1810', $btwBedrag, 0];
                $richting = $geenBtw ? null : 'vordering';
            }
            $regels[] = [$betaal, 0, $totaal];
        } else {
            $regels[] = [$betaal, $totaal, 0];
            $regels[] = [$grootboek, 0, $excl];
            if ($geenBtw || $verlegd) { $btwBedrag = 0.0; $btwCode = null; $richting = null; }
            else { if ($btwBedrag > 0) $regels[] = ['1910', 0, $btwBedrag]; $richting = 'afdracht'; }
        }

        db()->beginTransaction();
        db()->prepare(
            "INSERT INTO transacties (datum, omschrijving, factuur_nummer, btw_grondslag, btw_bedrag, btw_code, btw_richting)
             VALUES (:d, :o, :f, :g, :b, :c, :r)"
        )->execute([
            ':d' => $datum, ':o' => $omschrijving,
            ':f' => ($in['factuurNummer'] ?? '') !== '' ? trim((string) $in['factuurNummer']) : null,
            ':g' => $excl, ':b' => $btwBedrag, ':c' => $btwCode, ':r' => $richting,
        ]);
        $tid = (int) db()->lastInsertId();
        $rq = db()->prepare("INSERT INTO transactie_regels (transactie_id, rekening, debet, credit) VALUES (:t, :rek, :deb, :cred)");
        foreach ($regels as [$rek, $deb, $cred]) {
            $rq->execute([':t' => $tid, ':rek' => $rek, ':deb' => centen((float) $deb), ':cred' => centen((float) $cred)]);
        }
        db()->commit();
        json_response(['ok' => true, 'id' => $tid], 201);
    }

    case 'transactie_verwijder': {
        $id = (int) ($in['id'] ?? 0);
        db()->prepare("DELETE FROM transacties WHERE id = :id")->execute([':id' => $id]);
        json_response(['ok' => true]);
    }

    // Memoriaalboeking: vrije journaalpost (DR/CR), moet in balans, zonder BTW.
    case 'memoriaal': {
        $datum = (string) ($in['datum'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $datum)) json_response(['fout' => 'Geldige datum is verplicht'], 422);
        $omschrijving = trim((string) ($in['omschrijving'] ?? ''));
        if ($omschrijving === '') json_response(['fout' => 'Omschrijving is verplicht'], 422);
        $regels = is_array($in['regels'] ?? null) ? $in['regels'] : [];
        $norm = [];
        foreach ($regels as $r) {
            $rek = trim((string) ($r['rekening'] ?? ''));
            if ($rek === '') continue;
            $deb = centen((float) (is_string($r['debet'] ?? 0) ? str_replace(',', '.', $r['debet']) : ($r['debet'] ?? 0)));
            $cred = centen((float) (is_string($r['credit'] ?? 0) ? str_replace(',', '.', $r['credit']) : ($r['credit'] ?? 0)));
            if ($deb == 0.0 && $cred == 0.0) continue;
            $norm[] = [$rek, $deb, $cred];
        }
        if (count($norm) < 2) json_response(['fout' => 'Minimaal 2 regels met een bedrag'], 422);
        $totDeb = centen(array_sum(array_column($norm, 1)));
        $totCred = centen(array_sum(array_column($norm, 2)));
        if (abs($totDeb - $totCred) > 0.005) {
            json_response(['fout' => 'Debet en credit zijn niet in balans (' . number_format($totDeb, 2) . ' vs ' . number_format($totCred, 2) . ')'], 422);
        }
        $nrs = array_values(array_unique(array_column($norm, 0)));
        $ph = implode(',', array_fill(0, count($nrs), '?'));
        $chk = db()->prepare("SELECT COUNT(DISTINCT nummer) FROM rekeningen WHERE nummer IN ($ph)");
        $chk->execute($nrs);
        if ((int) $chk->fetchColumn() !== count($nrs)) json_response(['fout' => 'Onbekende rekening in de regels'], 422);

        db()->beginTransaction();
        db()->prepare("INSERT INTO transacties (datum, omschrijving) VALUES (:d, :o)")->execute([':d' => $datum, ':o' => $omschrijving]);
        $tid = (int) db()->lastInsertId();
        $rq = db()->prepare("INSERT INTO transactie_regels (transactie_id, rekening, debet, credit) VALUES (:t,:rek,:deb,:cred)");
        foreach ($norm as [$rek, $deb, $cred]) $rq->execute([':t' => $tid, ':rek' => $rek, ':deb' => $deb, ':cred' => $cred]);
        db()->commit();
        json_response(['ok' => true, 'id' => $tid], 201);
    }

    // ---------------- AI-factuurlezer ----------------
    case 'factuur_lezen': {
        $pdf = (string) ($in['pdf'] ?? '');
        if (strlen($pdf) < 100) json_response(['fout' => 'Geen geldige PDF (base64) ontvangen'], 422);
        try {
            json_response(ai_lees_factuur($pdf));
        } catch (Throwable $e) {
            json_response(['fout' => $e->getMessage()], 502);
        }
    }

    // ---------------- Import jaarrekening (fase 1) ----------------
    case 'jaarrekening_lezen': {
        $pdf = (string) ($in['pdf'] ?? '');
        if (strlen($pdf) < 100) json_response(['fout' => 'Geen geldige PDF (base64) ontvangen'], 422);
        try {
            json_response(ai_lees_jaarrekening($pdf));
        } catch (Throwable $e) {
            json_response(['fout' => $e->getMessage()], 502);
        }
    }

    case 'jaarrekening_importeren':
        json_response(import_jaarrekening_commit($in));

    case 'jaarcijfers':
        json_response(jaarcijfers_ophalen());

    case 'toelichtingen':
        json_response(toelichtingen_ophalen());

    case 'grootboek':
        json_response(bh_grootboek());

    // ---------------- Bank (MT940) + afletteren ----------------
    case 'bank_import': {
        $inhoud = (string) ($in['bestand'] ?? '');
        if (strlen($inhoud) < 20) json_response(['fout' => 'Geen bestand ontvangen'], 422);
        try {
            json_response(bank_importeer($inhoud));
        } catch (Throwable $e) {
            json_response(['fout' => $e->getMessage()], 422);
        }
    }

    case 'bank_lijst':
        json_response(bank_lijst(($in['status'] ?? '') !== '' ? (string) $in['status'] : null));

    case 'bank_suggesties':
        json_response(bank_suggesties((int) ($in['id'] ?? 0)));

    case 'bank_koppel':
        bank_koppel((int) ($in['id'] ?? 0), (int) ($in['transactieId'] ?? 0));
        json_response(['ok' => true]);

    case 'bank_ontkoppel':
        bank_ontkoppel((int) ($in['id'] ?? 0));
        json_response(['ok' => true]);

    case 'bank_status':
        bank_status((int) ($in['id'] ?? 0), (string) ($in['status'] ?? 'open'));
        json_response(['ok' => true]);

    case 'bank_leverancier':
        bank_leverancier_zet((int) ($in['id'] ?? 0), (int) ($in['leverancierId'] ?? 0) ?: null);
        json_response(['ok' => true]);

    // ---------------- Leveranciers ----------------
    case 'leveranciers':
        json_response(leveranciers_lijst());

    case 'leverancier_opslaan':
        json_response(leverancier_opslaan($in));

    case 'leverancier_verwijder':
        leverancier_verwijder((int) ($in['id'] ?? 0));
        json_response(['ok' => true]);

    // ---------------- Deelnemingen ----------------
    case 'deelnemingen':
        json_response(deelnemingen_lijst());

    case 'deelneming_opslaan':
        json_response(deelneming_opslaan($in));

    case 'deelneming_verwijder':
        deelneming_verwijder((int) ($in['id'] ?? 0));
        json_response(['ok' => true]);

    // ---------------- Inkomstenbelasting (privé) ----------------
    case 'ib': {
        $jaar = (int) ($in['jaar'] ?? 0) ?: (int) bh_boekjaar();
        json_response(ib_ophalen($jaar));
    }

    case 'ib_opslaan': {
        $jaar = (int) ($in['jaar'] ?? 0) ?: (int) bh_boekjaar();
        json_response(ib_opslaan($jaar, is_array($in['gegevens'] ?? null) ? $in['gegevens'] : []));
    }

    // ---------------- Privéboekhouding ----------------
    case 'prive_overzicht': {
        $jaar = (int) ($in['jaar'] ?? 0) ?: (int) date('Y');
        $from = (isset($in['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $in['from'])) ? (string) $in['from'] : $jaar . '-01-01';
        $to   = (isset($in['to'])   && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $in['to']))   ? (string) $in['to']   : $jaar . '-12-31';
        json_response(prive_overzicht($from, $to));
    }

    case 'prive_rekeningen':
        json_response(prive_rekeningen_lijst());

    case 'prive_rekening_opslaan':
        json_response(prive_rekening_opslaan($in));

    case 'prive_rekening_verwijder':
        prive_rekening_verwijder((int) ($in['id'] ?? 0));
        json_response(['ok' => true]);

    case 'prive_bank_import': {
        $rek = (int) ($in['rekeningId'] ?? 0);
        $inhoud = (string) ($in['bestand'] ?? '');
        if (strlen($inhoud) < 20) json_response(['fout' => 'Geen bestand ontvangen'], 422);
        try { json_response(prive_bank_import($rek, $inhoud)); }
        catch (RuntimeException $e) { json_response(['fout' => $e->getMessage()], 422); }
    }

    case 'prive_categorieen':
        json_response(prive_categorieen_lijst());

    case 'prive_categorie_opslaan':
        json_response(prive_categorie_opslaan($in));

    case 'prive_categorie_verwijder':
        prive_categorie_verwijder((int) ($in['id'] ?? 0));
        json_response(['ok' => true]);

    case 'prive_transacties':
        json_response(prive_transacties_lijst([
            'rekening' => $in['rekening'] ?? null, 'from' => $in['from'] ?? null, 'to' => $in['to'] ?? null,
            'categorie' => $in['categorie'] ?? null, 'ongecategoriseerd' => $in['ongecategoriseerd'] ?? null,
            'gecategoriseerd' => $in['gecategoriseerd'] ?? null,
        ]));

    case 'prive_transacties_tellingen':
        json_response(prive_transacties_tellingen());

    case 'prive_transactie_opslaan':
        json_response(prive_transactie_opslaan($in));

    case 'prive_transactie_categorie':
        json_response(prive_transactie_categorie((int) ($in['id'] ?? 0), (int) ($in['categorieId'] ?? 0) ?: null, !empty($in['onthoud'])));

    case 'prive_transactie_verwijder':
        prive_transactie_verwijder((int) ($in['id'] ?? 0));
        json_response(['ok' => true]);

    case 'prive_overboeking':
        json_response(prive_overboeking($in));

    case 'prive_transactie_koppel_rekening':
        json_response(prive_transactie_koppel_rekening((int) ($in['id'] ?? 0), (int) ($in['doelRekeningId'] ?? 0)));

    case 'prive_posten':
        json_response(prive_posten_lijst());

    case 'prive_post_opslaan':
        json_response(prive_post_opslaan($in));

    case 'prive_post_status':
        prive_post_status((int) ($in['id'] ?? 0), (string) ($in['status'] ?? 'open'));
        json_response(['ok' => true]);

    case 'prive_post_verwijder':
        prive_post_verwijder((int) ($in['id'] ?? 0));
        json_response(['ok' => true]);

    case 'prive_regels':
        json_response(prive_regels_lijst());

    case 'prive_regel_opslaan':
        json_response(prive_regel_opslaan($in));

    case 'prive_regel_verwijder':
        prive_regel_verwijder((int) ($in['id'] ?? 0));
        json_response(['ok' => true]);

    case 'prive_regels_toepassen':
        json_response(prive_regels_toepassen());

    case 'prive_maandcijfers': {
        $jaar = (int) ($in['jaar'] ?? 0) ?: (int) date('Y');
        json_response(prive_maandcijfers($jaar));
    }

    case 'grootboekkaart': {
        $nr = trim((string) ($in['nummer'] ?? ''));
        if ($nr === '') json_response(['fout' => 'nummer vereist'], 422);
        try {
            json_response(bh_grootboekkaart($nr));
        } catch (Throwable $e) {
            json_response(['fout' => $e->getMessage()], 404);
        }
    }

    // ---------------- Rapporten ----------------
    case 'dashboard':
        json_response(bh_dashboard());

    case 'balans': {
        $boekjaar = bh_boekjaar();
        $date = (isset($in['date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $in['date']))
            ? (string) $in['date'] : $boekjaar . '-12-31';
        json_response(bh_balans($date));
    }

    case 'wenv': {
        $boekjaar = bh_boekjaar();
        $from = (isset($in['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $in['from'])) ? (string) $in['from'] : $boekjaar . '-01-01';
        $to   = (isset($in['to'])   && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $in['to']))   ? (string) $in['to']   : $boekjaar . '-12-31';
        json_response(bh_wenv($from, $to));
    }

    case 'btw': {
        $kwartaal = (int) ($in['quarter'] ?? 0);
        $jaar     = (int) ($in['year'] ?? bh_boekjaar());
        if (!in_array($kwartaal, [1, 2, 3, 4], true)) json_response(['fout' => 'quarter moet 1-4 zijn'], 422);
        json_response(bh_btw($kwartaal, $jaar));
    }

    // ---------------- Reset ----------------
    // XAF-import (auditbestand van de accountant): vervangt de BV-administratie.
    case 'xaf_importeren': {
        if (($in['bevestig'] ?? '') !== 'XAF') json_response(['fout' => 'Bevestiging ontbreekt'], 422);
        $xml = (string) ($in['bestand'] ?? '');
        if (strlen($xml) < 100) json_response(['fout' => 'Geen bestand ontvangen'], 422);
        $cutoff = (isset($in['cutoff']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $in['cutoff'])) ? (string) $in['cutoff'] : '2026-07-01';
        try {
            json_response(xaf_importeer($xml, $cutoff));
        } catch (RuntimeException $e) {
            json_response(['fout' => $e->getMessage()], 422);
        }
    }

    case 'prive_reset': {
        if (($in['bevestig'] ?? '') !== 'PRIVE') json_response(['fout' => 'Bevestiging ontbreekt'], 422);
        json_response(prive_reset());
    }

    case 'reset': {
        if (($in['bevestig'] ?? '') !== 'RESET') json_response(['fout' => 'Bevestiging ontbreekt'], 422);
        db()->exec("DELETE FROM transactie_regels");
        db()->exec("DELETE FROM transacties");
        db()->exec("DELETE FROM rekeningen WHERE systeem = 0");
        db()->exec("DELETE FROM instellingen WHERE sleutel = 'bedrijfsnaam'");
        json_response(['ok' => true]);
    }

    default:
        json_response(['fout' => 'Onbekende actie'], 404);
}
