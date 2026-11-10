import { randomBytes } from 'node:crypto';

// The full list is in docs/API.md under Conventions. Prefixes are added as each phase needs them.
export type IdPrefix = 'usr' | 'req';

/** Random, unguessable ID with a readable type prefix, for example usr_3fK9... */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}
