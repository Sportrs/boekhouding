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

        if ($nummer === '') json_response(['fout' => 'Rekeningnummer is verplicht'], 422);
        if ($naam === '')   json_response(['fout' => 'Naam is verplicht'], 422);
        if (!in_array($type, $GELDIGE_TYPES, true)) json_response(['fout' => 'Ongeldig type'], 422);

        $bestaand = db()->prepare("SELECT nummer, type, systeem FROM rekeningen WHERE nummer = :nr LIMIT 1");
        $bestaand->execute([':nr' => $nummer]);
        $rij = $bestaand->fetch();

        if ($nieuw) {
            if ($rij) json_response(['fout' => 'Er bestaat al een rekening met dit nummer'], 409);
            db()->prepare("INSERT INTO rekeningen (nummer, naam, type, systeem, opening_saldo)
                           VALUES (:nr, :naam, :type, 0, :o)")
                ->execute([':nr' => $nummer, ':naam' => $naam, ':type' => $type, ':o' => $opening]);
        } else {
            if (!$rij) json_response(['fout' => 'Rekening niet gevonden'], 404);
            if ((int) $rij['systeem'] === 1 && $type !== $rij['type']) {
                json_response(['fout' => 'Type van een systeemrekening kan niet wijzigen'], 422);
            }
            db()->prepare("UPDATE rekeningen SET naam = :naam, type = :type, opening_saldo = :o WHERE nummer = :nr")
                ->execute([':naam' => $naam, ':type' => $type, ':o' => $opening, ':nr' => $nummer]);
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
        $pct = $geenBtw ? 0 : (int) $regime;
        if (!$geenBtw && !in_array($pct, [21, 9, 0], true)) json_response(['fout' => 'BTW moet 21, 9, 0 of "geen" zijn'], 422);
        $grootboek = (string) ($in['grootboekrekening'] ?? '');
        $betaal    = (string) ($in['betaalRekening'] ?? '');
        if ($grootboek === '' || $betaal === '') json_response(['fout' => 'Grootboek- en betaalrekening zijn verplicht'], 422);

        $check = db()->prepare("SELECT COUNT(*) FROM rekeningen WHERE nummer IN (:a, :b)");
        $check->execute([':a' => $grootboek, ':b' => $betaal]);
        if ((int) $check->fetchColumn() !== 2) json_response(['fout' => 'Onbekende grootboek- of betaalrekening'], 422);

        $btwBedrag = $geenBtw ? 0.0 : centen($excl * $pct / 100);
        $totaal    = centen($excl + $btwBedrag);
        $btwCode   = $geenBtw ? null : (string) $pct;

        $regels = [];
        if ($type === 'inkoop') {
            $regels[] = [$grootboek, $excl, 0];
            if ($btwBedrag > 0) $regels[] = ['1810', $btwBedrag, 0];
            $regels[] = [$betaal, 0, $totaal];
            $richting = $geenBtw ? null : 'vordering';
        } else {
            $regels[] = [$betaal, $totaal, 0];
            $regels[] = [$grootboek, 0, $excl];
            if ($btwBedrag > 0) $regels[] = ['1910', 0, $btwBedrag];
            $richting = $geenBtw ? null : 'afdracht';
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
