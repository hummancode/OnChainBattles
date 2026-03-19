# Authentication & Security Roadmap

Future security features needed before economy launch (Tier 2 with real money).
Current state: email/password + wallet login works, no email verification.

---

## Phase 1: Email Verification (Pre-Launch Must-Have)

### Problem
Anyone can register with a fake email. No proof of ownership.

### Solution
1. **On register**: set `email_verified = 0` in players table, generate a 6-digit verification code, store with 15min expiry
2. **Send verification email** via transactional email service (SendGrid, Resend, or AWS SES — all have free tiers)
3. **New endpoint**: `POST /api/auth/verify-email { code }` — marks `email_verified = 1`
4. **Tier gating**: Unverified email users can still play (Tier 1) but cannot:
   - Link wallet (blocks path to Tier 2 / economy)
   - Enter crypto matches
   - Trade on marketplace
5. **Resend endpoint**: `POST /api/auth/resend-verification` — rate limited to 1/minute

### Dev Environment
- Use `nodemailer` with `ethereal.email` (fake SMTP) for local testing — emails captured in a web inbox, no real sending
- Or: skip email sending in dev, log the code to console: `console.log('[DEV] Verification code:', code)`
- Toggle via `process.env.NODE_ENV === 'development'`

### DB Change
```sql
ALTER TABLE players ADD COLUMN email_verified INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN verify_code TEXT;
ALTER TABLE players ADD COLUMN verify_expires DATETIME;
```

---

## Phase 2: Password Reset (Pre-Launch Must-Have)

1. `POST /api/auth/forgot-password { email }` — send reset link/code
2. `POST /api/auth/reset-password { code, newPassword }` — verify code, update hash
3. Reset codes expire in 1 hour, single-use
4. Rate limit: 3 reset requests per email per hour

---

## Phase 3: Two-Factor Authentication (2FA) (Post-Launch, Before Economy)

### Why
Players with NFT cards worth real money need account protection beyond passwords.

### Options (in order of recommendation)
1. **TOTP (Time-based One-Time Password)** — Google Authenticator, Authy
   - Library: `otplib` (npm)
   - Store `totp_secret` in players table (encrypted)
   - On login: after password check, require 6-digit TOTP code
   - Recovery codes: generate 10 one-time backup codes at setup

2. **WebAuthn / Passkeys** — hardware keys, biometrics, phone passkeys
   - Library: `@simplewebauthn/server` + `@simplewebauthn/browser`
   - Most secure, best UX (no codes to type)
   - Store credential public keys in a `webauthn_credentials` table
   - Supports: YubiKey, Touch ID, Face ID, Windows Hello, phone passkeys

3. **Email OTP** — send a code on every login
   - Simpler but slower UX, requires reliable email delivery
   - Good as a fallback if TOTP device is lost

### Recommendation
Implement TOTP first (widest support, no external dependencies beyond the library).
Add WebAuthn as optional upgrade for power users.
Email OTP as recovery fallback.

### UI
- Profile Settings scene (new): `[ Enable 2FA ]` → QR code overlay → verify code → save
- Login flow: after password success, if 2FA enabled → show code input → verify → issue JWT
- Recovery: `[ Lost 2FA Device? ]` → enter backup code → login + disable 2FA

---

## Phase 4: Session Management (Post-Launch)

1. **Active sessions list** — show all logged-in devices/browsers
2. **Revoke sessions** — invalidate specific JWTs (requires server-side token blacklist or switch to refresh tokens)
3. **Login notifications** — "New login from Windows/Chrome at IP x.x.x.x" via email
4. **Suspicious login detection** — flag logins from new IP/country, require email verification

### Token Architecture Upgrade
Current: single JWT, 24h expiry, no revocation.
Future:
- **Access token**: 15min expiry, used for API calls
- **Refresh token**: 7-day expiry, stored in HttpOnly cookie, used to get new access tokens
- **Token blacklist**: Redis set of revoked refresh tokens (for logout/session revocation)

---

## Phase 5: Account Security for Economy (Before NFT Migration)

1. **Wallet linking confirmation** — require password + email verification before linking wallet
2. **Migration lock** — after paying migration fee, 24h cooldown before NFT transfer is enabled (prevents stolen account → instant dump)
3. **Trade confirmation** — high-value trades require 2FA confirmation
4. **Withdrawal limits** — daily AVAX withdrawal cap for new accounts (anti-fraud)
5. **Account recovery** — if wallet lost, email-verified account can still access non-NFT features

---

## Implementation Priority

| Feature | When | Effort | Blocks |
|---------|------|--------|--------|
| Email verification | Before public launch | 1-2 days | Wallet linking, economy access |
| Password reset | Before public launch | 0.5 day | Nothing (but users will need it) |
| TOTP 2FA | Before economy launch | 2-3 days | NFT migration, marketplace |
| WebAuthn passkeys | After economy launch | 2-3 days | Nothing (optional upgrade) |
| Session management | After economy launch | 2-3 days | Nothing (quality of life) |
| Economy security gates | Before NFT migration | 1-2 days | NFT transfers, trading |

---

## Current Dev Workaround

In development (`NODE_ENV=development`), email verification is skipped — any email format works.
This is intentional for fast iteration. The verification infrastructure will be added before production deploy.
