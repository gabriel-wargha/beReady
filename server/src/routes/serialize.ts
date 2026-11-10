import type { User } from '@beready/shared';
import type { UserRow } from '../db/schema';

/** The only way a user row leaves the API. The password hash is never included. */
export const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  isDemo: row.isDemo,
  createdAt: row.createdAt.toISOString(),
});
