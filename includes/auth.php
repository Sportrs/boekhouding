<?php
/* =====================================================================
 *  BV BOEKHOUDING — includes/auth.php
 *  Eenvoudige single-user login via PHP-sessie. Wachtwoord uit config.php
 *  (ADMIN_WACHTWOORD). De sessiecookie is same-origin en httponly.
 * ===================================================================== */

function sessie_start(): void {
    if (session_status() === PHP_SESSION_NONE) {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'httponly' => true,
            'secure'   => $https,
            'samesite' => 'Lax',
        ]);
        session_name('boekhouding_sessie');
        session_start();
    }
}

function is_ingelogd(): bool {
    sessie_start();
    return !empty($_SESSION['ingelogd']);
}

// Stopt met 401 als er geen geldige sessie is.
function vereis_auth(): void {
    if (!is_ingelogd()) {
        json_response(['fout' => 'Niet ingelogd'], 401);
    }
}

function auth_login(): void {
    $in  = lees_input();
    $ww  = (string) ($in['wachtwoord'] ?? '');
    if (!defined('ADMIN_WACHTWOORD') || ADMIN_WACHTWOORD === '' || ADMIN_WACHTWOORD === 'CHANGE_ME') {
        json_response(['fout' => 'ADMIN_WACHTWOORD is niet ingesteld in config.php'], 500);
    }
    // Constante-tijd vergelijking tegen timing-aanvallen.
    if (!hash_equals(ADMIN_WACHTWOORD, $ww)) {
        json_response(['fout' => 'Onjuist wachtwoord'], 401);
    }
    sessie_start();
    session_regenerate_id(true);
    $_SESSION['ingelogd'] = true;
    json_response(['ok' => true]);
}

function auth_logout(): void {
    sessie_start();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    json_response(['ok' => true]);
}

function auth_me(): void {
    json_response(['authenticated' => is_ingelogd()]);
}
