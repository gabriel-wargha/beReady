import { Router } from 'express';
import multer from 'multer';
import { githubImportSchema, githubQuerySchema, importBodySchema } from '@beready/shared';
import type { Db } from '../db/client';
import type { Env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { forUser, parse } from '../services/factBank';
import { commitImport, importView } from '../services/imports';
import type { GitHubClient } from '../services/github';
import { enqueue, usage } from '../tasks/runner';
import { MAX_UPLOAD, parseUpload } from '../parsers/upload';
import { ProblemError } from '../lib/problem';

export function importRoutes(db: Db, env: Env, github: GitHubClient) {
  const r = Router();
  r.use(['/imports', '/tasks', '/github', '/me/usage'], requireAuth(db, env.NODE_ENV === 'production'));
  const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: MAX_UPLOAD, files: 1, fields: 2, fieldSize: 1000}}).single('file');
  r.get('/me/usage', async (req, res) => res.json(await usage(db, req.user!.id, req.user!.isDemo ? 5 : env.AI_DAILY_LIMIT)));
  r.get('/tasks/:id', async (req, res) => {
    const t = await forUser(db, req.user!.id).task(String(req.params.id));
    res.json({id: t.id, type: t.type, status: t.status, result: t.result, error: t.error, createdAt: t.createdAt.toISOString(), finishedAt: t.finishedAt?.toISOString() ?? null});
  });
  r.get('/github/repos', async (req, res) => {const q = parse(githubQuerySchema, req.query); res.json({data: await github.repos(q.username, q.includeForks === 'true')});});
  r.post('/imports/github', async (req, res) => {
    const body = parse(githubImportSchema, req.body);
    const task = await enqueue(db, env, req.user!.id, {kind: 'github', label: `GitHub: ${body.username}`, text: '', ...body}, req.get('Idempotency-Key'));
    res.status(202).location(`/api/v1/tasks/${task.id}`).json({taskId: task.id, status: task.status});
  });
  r.post('/imports', (req, res, next) => {
    if (!req.is('multipart/form-data')) return next();
    upload(req, res, error => {
      if (error instanceof multer.MulterError) return next(new ProblemError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'validation_failed', error.code === 'LIMIT_FILE_SIZE' ? 'Files must be 5 MB or smaller.' : 'Upload one file in the file field.'));
      next(error);
    });
  }, async (req, res) => {
    let source: {kind: 'pasted' | 'pdf' | 'docx'; text: string; label: string};
    if (req.file) source = {...await parseUpload(req.file.buffer), label: req.file.originalname.replace(/[\x00-\x1f]/g, '').slice(0, 200) || 'Uploaded file'};
    else source = {kind: 'pasted', ...parse(importBodySchema, req.body)};
    const task = await enqueue(db, env, req.user!.id, source, req.get('Idempotency-Key'));
    res.status(202).location(`/api/v1/tasks/${task.id}`).json({taskId: task.id, status: task.status});
  });
  r.get('/imports/:id', async (req, res) => res.json(await importView(db, req.user!.id, String(req.params.id))));
  r.post('/imports/:id/commit', async (req, res) => res.status(201).json(await commitImport(db, req.user!.id, String(req.params.id), req.body)));
  return r;
}
