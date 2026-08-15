# Submission Checklist

## Docker & Infrastructure
- [ ] `docker compose up --build` starts API and PostgreSQL
- [ ] PostgreSQL health check passes before API starts
- [ ] API responds on `http://localhost:3000/health`
- [ ] Migrations run automatically in Docker
- [ ] Docker multi-stage build works
- [ ] Non-root user in production container

## Database & Migrations
- [ ] `npx prisma migrate deploy` works on fresh database
- [ ] All tables created: User, RefreshToken, OTP, PasswordReset, AuditLog
- [ ] Proper indexes on foreign keys and lookup columns
- [ ] UUID primary keys used throughout
- [ ] Seed data creates evaluator user

## Authentication Flows

### Registration
- [ ] POST `/api/auth/register` creates user
- [ ] Email normalized (lowercase, trimmed)
- [ ] Password hashed with Argon2id
- [ ] Duplicate email rejected (409)
- [ ] Invalid input rejected (400)
- [ ] Phone optional, E.164 validated if provided

### Password Login
- [ ] POST `/api/auth/login` with valid credentials returns tokens
- [ ] Invalid password returns 401 (generic message)
- [ ] Unknown user returns same 401 (no enumeration)
- [ ] Inactive account returns 403
- [ ] JWT access token ~10 min expiry
- [ ] Refresh token ~7 days, stored as hash

### 2FA Enable
- [ ] POST `/api/auth/2fa/enable` requires JWT
- [ ] Requires phone number on account
- [ ] Generates 6-digit OTP
- [ ] Stores OTP hash (purpose: enable_2fa)
- [ ] Sends via mock SMS (logged to console)
- [ ] Does NOT enable 2FA until verification

### 2FA Verify (Enable)
- [ ] POST `/api/auth/2fa/verify` with challengeId + code
- [ ] Valid OTP enables 2FA (`is2faEnabled=true`)
- [ ] Invalid OTP rejected
- [ ] Attempts incremented
- [ ] Max attempts (5) locks OTP
- [ ] Expired OTP rejected
- [ ] Reused OTP rejected
- [ ] Race-safe verification (transaction)

### Login with 2FA
- [ ] Login returns challengeId when 2FA enabled
- [ ] OTP sent via mock SMS
- [ ] Verify OTP returns access + refresh tokens
- [ ] Invalid OTP rejected

### Token Refresh
- [ ] POST `/api/auth/token/refresh` with valid token returns new tokens
- [ ] Old refresh token revoked (rotation)
- [ ] Old token cannot be used again
- [ ] Revoked token returns 401
- [ ] Expired token returns 401
- [ ] Inactive user returns 403

### Logout
- [ ] POST `/api/auth/logout` revokes refresh token
- [ ] Revoked token cannot refresh

### Forgot Password
- [ ] POST `/api/auth/forgot-password` returns generic message
- [ ] Does not reveal if email exists
- [ ] Creates reset token (32 bytes, SHA-256 hash)
- [ ] Mock email logs token to console
- [ ] Token expires ~1 hour

### Reset Password
- [ ] POST `/api/auth/reset-password` with valid token
- [ ] Updates password with Argon2id
- [ ] Marks reset token used
- [ ] Revokes ALL refresh tokens for user
- [ ] Reused reset token rejected
- [ ] Expired reset token rejected
- [ ] Old password stops working
- [ ] New password works

## Security
- [ ] No passwords in logs
- [ ] No plaintext OTPs in logs (except mock SMS)
- [ ] No JWT tokens in logs
- [ ] No refresh tokens in logs
- [ ] No reset tokens in logs
- [ ] Helmet security headers
- [ ] CORS restricted
- [ ] Rate limits on auth endpoints
- [ ] Zod validation on all inputs
- [ ] Constant-time comparison for secrets
- [ ] Parameterized queries (Prisma)
- [ ] Generic error messages
- [ ] `.env` in `.gitignore`
- [ ] `.env.example` exists

## Testing
- [ ] `npm run test:run` passes all tests
- [ ] Registration tests pass
- [ ] Login tests pass
- [ ] 2FA tests pass
- [ ] Refresh/logout tests pass
- [ ] Password reset tests pass
- [ ] Protected endpoint tests pass
- [ ] Tests use real PostgreSQL
- [ ] Tests are deterministic (no arbitrary sleeps)

## Documentation
- [ ] README.md complete
- [ ] SUBMISSION.md exists
- [ ] CHECKLIST.md exists
- [ ] PLAN.md exists
- [ ] DEMO_SCRIPT.md exists
- [ ] PROOF_OF_SUBMISSION/compute_proof.sh exists

## Proof of Submission
- [ ] `compute_proof.sh` generates challenge.txt
- [ ] `compute_proof.sh` computes SHA256(challenge + commit_hash)
- [ ] `compute_proof.sh` signs with ECDSA secp256r1
- [ ] `compute_proof.sh` outputs proof.txt and proof_pub.pem
- [ ] Verification works: `openssl dgst -sha256 -verify proof_pub.pem -signature proof.txt <(printf "%s%s" "$(cat challenge.txt)" "$(git rev-parse HEAD)")`
- [ ] Private key NOT committed
- [ ] Private key in .gitignore

## Final Verification
- [ ] `npm run build` completes without errors
- [ ] `npm run test:run` passes
- [ ] `docker compose down -v && docker compose up --build` works
- [ ] Clean database: migrations + seed + test all endpoints
- [x] Evaluator credentials documented in SUBMISSION.md