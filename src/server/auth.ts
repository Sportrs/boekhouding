import type { Request, Response, NextFunction } from 'express';

const COOKIE_NAME = 'boekhouding_session';

/** Middleware die verifieert of er een geldige (ondertekende) sessiecookie is. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.signedCookies?.[COOKIE_NAME] === 'ok') {
    return next();
  }
  return res.status(401).json({ error: 'Niet ingelogd' });
}

/** Verwerkt een login: vergelijkt met ADMIN_PASSWORD en zet de sessiecookie. */
export function login(req: Request, res: Response) {
  const { password } = req.body ?? {};
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD is niet ingesteld op de server.' });
  }
  if (typeof password !== 'string' || password !== expected) {
    return res.status(401).json({ error: 'Onjuist wachtwoord' });
  }

  res.cookie(COOKIE_NAME, 'ok', {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 dagen
  });
  return res.json({ ok: true });
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME);
  return res.json({ ok: true });
}

/** Geeft aan of de huidige request is ingelogd (voor GET /api/auth/me). */
export function me(req: Request, res: Response) {
  return res.json({ authenticated: req.signedCookies?.[COOKIE_NAME] === 'ok' });
}
