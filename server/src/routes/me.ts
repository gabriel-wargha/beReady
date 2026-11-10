import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { updateMeBodySchema, type UpdateMeBody } from '@beready/shared';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from '../lib/password';
import { ProblemError } from '../lib/problem';
import { createSession, deleteUserSessions } from '../lib/sessions';
import { requireAuth, setSessionCookie } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { toUser } from './serialize';

export function meRoutes(db: Db, secureCookies: boolean): Router {
  const router = Router();
  const auth = requireAuth(db, secureCookies);

  router.get('/me', auth, (req, res) => {
    res.json(toUser(req.user!));
  });

  router.patch('/me', auth, validateBody(updateMeBodySchema), async (req, res) => {
    const body = req.body as UpdateMeBody;
    const user = req.user!;
    const changes: { name?: string; passwordHash?: string } = {};

    if (body.name !== undefined) changes.name = body.name;

    if (body.newPassword !== undefined) {
      const ok = await verifyPassword(user.passwordHash, body.currentPassword ?? '');
      if (!ok) {
        throw new ProblemError(400, 'validation_failed', '1 field is invalid.', [
          { path: 'currentPassword', message: 'Current password is wrong' },
        ]);
      }
      changes.passwordHash = await hashPassword(body.newPassword);
    }

    await db.update(users).set(changes).where(eq(users.id, user.id));

    if (changes.passwordHash) {
      // A password change logs out every device, then gives this one a fresh session.
      await deleteUserSessions(db, user.id);
      const session = await createSession(db, user.id);
      setSessionCookie(res, session.token, session.expiresAt, secureCookies);
    }

    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    res.json(toUser(updated!));
  });

  return router;
}
