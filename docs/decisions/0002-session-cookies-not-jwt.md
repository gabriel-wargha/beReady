# 2. Server-side sessions in a cookie, not JWTs

**Status:** accepted · **Date:** 2026-11-09

## Context

Users log in with email and password. The React app and the API share one address.

## Decision

Keep sessions in a `sessions` table. The browser holds a random token in an httpOnly,
SameSite=Lax cookie. The table stores only the SHA-256 hash of that token.

## Why

- **Revocation is instant.** Logging out or changing a password deletes rows. A JWT stays valid
  until it expires unless you add a blocklist, which is a session table by another name.
- **JavaScript cannot read the cookie**, so a script injected into the page cannot steal it.
  A JWT kept in localStorage can be read by any script.
- **Same origin.** There is no second domain or mobile app that would need a bearer token.
- **The database never holds a usable credential.** Passwords are Argon2id hashes and session
  tokens are SHA-256 hashes.

## Trade-offs

- One database read per request. It is a primary-key lookup, so it is fast.
- Cookies need protection against cross-site requests. SameSite=Lax plus an Origin header check
  on every POST, PATCH and DELETE covers it.
