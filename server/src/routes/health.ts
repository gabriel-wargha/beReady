import { Router } from 'express';
import { sql } from 'drizzle-orm';
import type { Health } from '@beready/shared';
import type { Db } from '../db/client';

export function healthRoutes(db: Db): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    await db.execute(sql`select 1`); // throws if the database is not reachable
    const body: Health = {
      status: 'ok',
      database: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
    };
    res.json(body);
  });
  return router;
}
