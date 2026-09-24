import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { InstagramMobileLogin, InstagramMobileLoginError } from '../services/instagram-mobile-login';

/** Mounted after requireAuth. One exact user ID is intentional while Matrix identity is shared. */
export function instagramMobileLoginRouter(login: InstagramMobileLogin) {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (process.env.INSTAGRAM_MOBILE_LOGIN_ENABLED !== 'true'
      || req.user.id !== process.env.INSTAGRAM_MOBILE_LOGIN_USER_ID) {
      return res.status(404).json({ error: 'Mobile Instagram sign-in is not available for this account yet.' });
    }
    return next();
  });
  const handle = (work: (req: Request) => unknown) => async (req: Request, res: Response) => {
    try { return res.json(await work(req)); }
    catch (error) {
      // Deliberately do not forward upstream error objects to logging/Sentry.
      return res.status(error instanceof InstagramMobileLoginError ? error.status : 502).json({
        error: error instanceof InstagramMobileLoginError ? error.message : 'Instagram sign-in is temporarily unavailable.',
      });
    }
  };
  router.get('/capabilities', handle(async () => ({ available: await login.available() })));
  const startLimit = rateLimit({ windowMs: 15 * 60_000, limit: 5, keyGenerator: req => req.user!.id,
    standardHeaders: true, legacyHeaders: false, message: { error: 'Too many sign-in attempts. Wait a while before trying again.' } });
  router.post('/start', startLimit, handle(req => login.start(req.user!.id)));
  router.get('/:id', handle(req => login.status(req.user!.id, req.params.id)));
  router.post('/:id/advance', handle(req => login.advance(req.user!.id, req.params.id, req.body?.revision, req.body?.input)));
  router.post('/:id/cancel', handle(async req => { await login.cancel(req.user!.id, req.params.id); return { cancelled: true }; }));
  return router;
}
