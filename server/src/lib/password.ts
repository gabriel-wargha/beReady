import { hash, verify } from '@node-rs/argon2';

// Argon2id is the library default. It is slow on purpose, which makes guessing expensive.
export const hashPassword = (password: string): Promise<string> => hash(password);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false; // a malformed hash counts as "wrong password", not a crash
  }
}

/**
 * A real hash of a random password. When someone logs in with an unknown email we still
 * verify against this, so the response takes the same time whether the email exists or not.
 */
let dummyHash: Promise<string> | undefined;
export const getDummyHash = (): Promise<string> =>
  (dummyHash ??= hashPassword(`dummy-${Math.random()}-${Date.now()}`));
