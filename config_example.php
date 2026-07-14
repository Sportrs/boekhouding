<?php
/* =====================================================================
 *  BV BOEKHOUDING — config.php
 *  DB-verbinding + gedeelde helpers. Kopieer dit bestand naar config.php
 *  en vul de waarden in. config.php staat in .gitignore en wordt door de
 *  deploy NOOIT overschreven (server-only geheimen).
 *  A2/cPanel + LiteSpeed: PDO native prepares, utf8mb4, unieke placeholders.
 * ===================================================================== */

// ---- DB-credentials (vul in per omgeving) ---------------------------
define('DB_HOST', 'localhost');
define('DB_NAME', 'CHANGE_ME');   // bijv. sportrsn_boekhouding
define('DB_USER', 'CHANGE_ME');
define('DB_PASS', 'CHANGE_ME');

// ---- Login (single-user) --------------------------------------------
define('ADMIN_WACHTWOORD', 'CHANGE_ME');   // wachtwoord om in te loggen

// ---- Anthropic (AI-factuurlezer) ------------------------------------
define('ANTHROPIC_API_KEY', '');           // sk-ant-... (leeg = uitlezen uit)
define('BOEKHOUDING_AI_MODEL', 'claude-haiku-4-5-20251001');

// ---------------------------------------------------------------------
// PDO-verbinding (singleton)
// ---------------------------------------------------------------------
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

// ---------------------------------------------------------------------
// JSON-respons + input
// ---------------------------------------------------------------------
function json_response($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Body uitlezen: JSON-body eerst, val terug op form/query.
function lees_input(): array {
    $ruw  = file_get_contents('php://input');
    $json = json_decode($ruw, true);
    if (is_array($json)) return $json;
    return array_merge($_GET, $_POST);
}

// Afronden op centen (Float-ruis vermijden).
function centen(float $n): float {
    return round($n, 2);
}
