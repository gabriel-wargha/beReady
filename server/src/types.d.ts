import type { UserRow } from './db/schema';

declare global {
  namespace Express {
    interface Request {
      /** Set by the requestId middleware on every request. */
      requestId: string;
      /** Set by requireAuth. */
      user?: UserRow;
      /** The raw session token from the cookie, when requireAuth accepted it. */
      sessionToken?: string;
    }
  }
}
export {};
