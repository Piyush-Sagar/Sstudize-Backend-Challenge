# Implementation Plan: RESTful Authentication Backend

## Context
Building a complete authentication backend from scratch for the Sstudize Backend Challenge. The repository is empty (no commits yet). All components must be implemented per the detailed requirements.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (HTTP)                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Express   │
                    │   Server    │
                    └──────┬──────┘
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │ Auth Routes│ │Profile Rtes│ │Health Check│
    └─────┬──────┘ └─────┬──────┘ └────────────┘
          │              │
          ▼              ▼
    ┌────────────┐ ┌────────────┐
    │Auth Ctrl   │ │Profile Ctrl│
    └─────┬──────┘ └─────┬──────┘
          │              │
          ▼              ▼
    ┌─────────────────────────────────┐
    │         Services Layer          │
    │  Auth, JWT, Refresh, OTP, SMS,  │
    │  PasswordReset, Audit           │
    └──────────────┬──────────────────┘
                   │
                   ▼
           ┌───────────────┐
           │   Prisma ORM  │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │  PostgreSQL   │
           └───────────────┘
```

---

## Database Schema (Prisma)

### Users
```prisma
model User {
  id              String    @id @default(uuid())
  email           String    @unique
  passwordHash    String
  phone           String?
  isActive        Boolean   @default(true)
  is2faEnabled    Boolean   @default(false)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  refreshTokens   RefreshToken[]
  otps            OTP[]
  passwordResets  PasswordReset[]
  auditLogs       AuditLog[]
}
```

### RefreshToken
```prisma
model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  revoked   Boolean  @default(false)
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([tokenHash])
}
```

### OTP
```prisma
model OTP {
  id        String   @id @default(uuid())
  userId    String
  codeHash  String
  purpose   String   // "enable_2fa" | "login_2fa"
  expiresAt DateTime
  used      Boolean  @default(false)
  attempts  Int      @default(0)
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, purpose])
}
```

### PasswordReset
```prisma
model PasswordReset {
  id        String   @id @default(uuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  used      Boolean  @default(false)
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

### AuditLog
```prisma
model AuditLog {
  id        String   @id @default(uuid())
  userId    String?
  event     String
  metadata  Json?
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())

  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([event])
  @@index([createdAt])
}
```

---

## Authentication Flows

### 1. Registration
```
POST /api/auth/register
→ Validate input (Zod)
→ Normalize email (lowercase, trim)
→ Check duplicate email
→ Hash password (Argon2id)
→ Create user
→ Log REGISTER_SUCCESS
→ Return 201 with user info (no tokens)
```

### 2. Login (Password Only - No 2FA)
```
POST /api/auth/login
→ Validate input
→ Find user by email
→ Verify password (Argon2)
→ Check isActive
→ If 2FA disabled:
    → Generate JWT access token (10 min)
    → Generate refresh token (7 days, store hash)
    → Log LOGIN_SUCCESS
    → Return tokens + requires2FA: false
→ If 2FA enabled:
    → Generate login OTP (store hash, purpose: login_2fa)
    → Send via SMS adapter
    → Log OTP_SENT
    → Return requires2FA: true + challengeId (signed/encrypted)
```

### 3. Login with 2FA (Two-Step)
```
Step 1: POST /api/auth/login (as above, returns challengeId)
Step 2: POST /api/auth/2fa/verify
→ Validate challengeId + OTP
→ Decrypt challengeId to get userId
→ Find valid OTP (unused, not expired, purpose=login_2fa)
→ Verify OTP code (constant-time compare of hashes)
→ Mark OTP used (transaction)
→ Generate JWT + refresh token
→ Revoke old refresh tokens for user (optional, for rotation)
→ Log LOGIN_SUCCESS, OTP_VERIFIED
→ Return tokens
```

### 4. Enable 2FA
```
POST /api/auth/2fa/enable (requires valid access token)
→ Get userId from JWT
→ Check phone exists
→ Generate OTP (purpose: enable_2fa)
→ Store hash
→ Send via SMS
→ Log OTP_SENT
→ Return success (2FA NOT yet enabled)
```

### 5. Verify 2FA Enable
```
POST /api/auth/2fa/verify (with purpose=enable_2fa in challenge)
→ Validate OTP
→ Mark OTP used
→ Set user.is2faEnabled = true
→ Log OTP_VERIFIED
→ Return success
```

### 6. Token Refresh
```
POST /api/auth/token/refresh
→ Validate refresh token (hash lookup)
→ Check not expired, not revoked, user active
→ REVOKE old token (rotation)
→ Generate new access token + new refresh token
→ Store new refresh token hash
→ Log TOKEN_REFRESHED
→ Return new tokens
```

### 7. Logout
```
POST /api/auth/logout
→ Hash provided refresh token
→ Find and revoke it
→ Log LOGOUT
→ Return success
```

### 8. Forgot Password
```
POST /api/auth/forgot-password
→ Validate email
→ Find user (but DON'T reveal existence)
→ Always return generic success message
→ If user exists:
    → Generate secure reset token (32 bytes)
    → Store hash, expires ~1 hour
    → "Send" via mock email adapter (logs token)
    → Log PASSWORD_RESET_REQUEST
```

### 9. Reset Password
```
POST /api/auth/reset-password
→ Validate token + new password
→ Hash token, find record
→ Check not expired, not used
→ Hash new password (Argon2)
→ Transaction:
    → Update user.passwordHash
    → Mark reset token used
    → Revoke ALL refresh tokens for user
→ Log PASSWORD_RESET_SUCCESS
→ Return success
```

### 10. Protected Profile
```
GET /api/profile
→ Require Authorization: Bearer <accessToken>
→ Validate JWT (verify signature, exp, iat)
→ Get user from sub claim
→ Return safe fields: id, email, phone, is2faEnabled
```

---

## API Endpoints Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | No | Register new user |
| POST | /api/auth/login | No | Password login |
| POST | /api/auth/2fa/enable | JWT | Initiate 2FA enable |
| POST | /api/auth/2fa/verify | Challenge | Verify OTP (login or enable) |
| POST | /api/auth/token/refresh | Refresh | Rotate tokens |
| POST | /api/auth/logout | Refresh | Revoke refresh token |
| POST | /api/auth/forgot-password | No | Request password reset |
| POST | /api/auth/reset-password | No | Reset password with token |
| GET | /api/profile | JWT | Get user profile |
| GET | /health | No | Health check |

---

## Security Controls

| Control | Implementation |
|---------|---------------|
| **Password Hashing** | Argon2id (memory-hard, configurable) |
| **JWT Signing** | HS256 with env secret (RS256 optional bonus) |
| **Refresh Tokens** | Opaque, crypto.randomBytes(32), stored as SHA-256 hash |
| **OTP Storage** | SHA-256 hash, 6-digit, 5-min expiry, max 5 attempts |
| **Reset Tokens** | crypto.randomBytes(32), SHA-256 hash, 1-hour expiry |
| **Rate Limiting** | express-rate-limit on auth endpoints |
| **Input Validation** | Zod schemas on all inputs |
| **SQL Injection** | Prisma parameterized queries |
| **Timing Attacks** | Constant-time compare for OTP/hash verification |
| **User Enumeration** | Generic responses on login/forgot-password |
| **Token Rotation** | Refresh token revoked on use, new one issued |
| **Session Revocation** | Password reset revokes all refresh tokens |
| **Audit Logging** | No sensitive data in logs |
| **CORS** | Restricted origins via env |
| **Helmet** | Security headers |
| **Env Secrets** | Never hardcoded, .env.example provided |

---

## Testing Strategy (Vitest + Supertest)

### Test Files
- `tests/register.test.ts` - Registration flows
- `tests/login.test.ts` - Login (with/without 2FA)
- `tests/otp.test.ts` - OTP generation, verification, expiry, reuse
- `tests/refresh.test.ts` - Token refresh, rotation, revocation
- `tests/password-reset.test.ts` - Forgot/reset password flows
- `tests/profile.test.ts` - Protected endpoint access

### Test Patterns
- Use real PostgreSQL (test database)
- Supertest against Express app (not mocked)
- Deterministic tests: set expiry timestamps directly in fixtures
- Clean database between tests (transactions or truncate)
- Test both success and failure paths
- Test rate limiting (relaxed in test env)

---

## Docker Strategy

### Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### docker-compose.yml
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    ports: ["5432:5432"]
    volumes: ["postgres_data:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      NODE_ENV: production
      # ... other env vars
    depends_on:
      postgres:
        condition: service_healthy
    command: sh -c "npx prisma migrate deploy && npm start"

volumes:
  postgres_data:
```

### Startup Commands
```bash
cp .env.example .env
docker compose up --build
```

---

## Dependencies & Implementation Order

### Phase 1: Foundation
1. `package.json` - All dependencies
2. `tsconfig.json` - TypeScript config
3. `.env.example` - Environment template
4. `.gitignore` - Exclude node_modules, .env, dist, proofs
5. `prisma/schema.prisma` - Database models
6. `prisma/seed.ts` - Evaluator seed data

### Phase 2: Core Infrastructure
7. `src/config/env.ts` - Validated env config (Zod)
8. `src/config/database.ts` - Prisma client singleton
9. `src/utils/crypto.ts` - Hashing, token generation, constant-time compare
10. `src/utils/errors.ts` - Custom error classes
11. `src/middleware/error-handler.ts` - Global error handling
12. `src/middleware/rate-limit.ts` - Rate limiter config

### Phase 3: Services
13. `src/services/jwt.service.ts` - JWT sign/verify
14. `src/services/refresh-token.service.ts` - Refresh token CRUD + rotation
15. `src/services/otp.service.ts` - OTP generate/verify (transaction-safe)
16. `src/services/sms.service.ts` - SMS adapter (mock + interface)
17. `src/services/password-reset.service.ts` - Reset token flow
18. `src/services/audit.service.ts` - Audit logging
19. `src/services/auth.service.ts` - High-level auth orchestration

### Phase 4: Controllers & Routes
20. `src/schemas/auth.schemas.ts` - Zod validation schemas
21. `src/middleware/validate.ts` - Validation middleware
22. `src/middleware/authenticate.ts` - JWT auth middleware
23. `src/controllers/auth.controller.ts` - Auth endpoints
24. `src/controllers/profile.controller.ts` - Profile endpoint
25. `src/routes/auth.routes.ts` - Auth routes
26. `src/routes/profile.routes.ts` - Profile routes

### Phase 5: App Assembly
27. `src/app.ts` - Express app setup (middleware, routes, Helmet, CORS)
28. `src/server.ts` - Server entry point

### Phase 6: Tests
29. All test files with comprehensive coverage

### Phase 7: Docker & Docs
30. `Dockerfile`, `docker-compose.yml`
31. `README.md`
32. `CHECKLIST.md`
33. `SUBMISSION.md`
34. `DEMO_SCRIPT.md`
35. `PROOF_OF_SUBMISSION/compute_proof.sh`

### Phase 8: Verification
36. Run migrations, seeds, tests, Docker
37. Security review
38. Final proof workflow documentation

---

## NPM Scripts

```json
{
  "dev": "tsx watch src/server.ts",
  "build": "tsc",
  "start": "node dist/server.js",
  "test": "vitest",
  "test:run": "vitest run",
  "prisma:migrate": "prisma migrate dev",
  "prisma:migrate:deploy": "prisma migrate deploy",
  "prisma:seed": "tsx prisma/seed.ts",
  "prisma:studio": "prisma studio",
  "lint": "eslint src --ext .ts"
}
```

---

## Submission Requirements Checklist

- [ ] TypeScript builds (`npm run build`)
- [ ] PostgreSQL used (not in-memory)
- [ ] Prisma migrations exist (`prisma migrate deploy` works)
- [ ] Seed data exists (evaluator@example.com / Evaluator123!)
- [ ] All auth flows work
- [ ] Tests pass (`npm run test:run`)
- [ ] Docker works (`docker compose up --build`)
- [ ] README complete
- [ ] SUBMISSION.md with all commands
- [ ] CHECKLIST.md with checkboxes
- [ ] PLAN.md (this file)
- [ ] DEMO_SCRIPT.md
- [ ] PROOF_OF_SUBMISSION/compute_proof.sh
- [ ] No secrets committed

---

## Proof of Submission - Circularity Handling

**Challenge**: The proof requires `git rev-parse HEAD` but generating proof files and committing them changes HEAD.

**Solution**: 
1. `compute_proof.sh` generates proof files WITHOUT committing them
2. At FINAL SUBMISSION TIME, user runs:
   ```bash
   ./PROOF_OF_SUBMISSION/compute_proof.sh
   git add PROOF_OF_SUBMISSION/challenge.txt PROOF_OF_SUBMISSION/proof.txt PROOF_OF_SUBMISSION/proof_pub.pem
   git commit -m "Add proof of submission"
   ```
3. The commit hash in the proof will be the PRE-proof commit (or we document the final commit separately)
4. `SUBMISSION.md` documents this workflow clearly
5. Verification script uses the committed proof files against the final commit

---

## Key Files to Create/Modify (Summary)

| Category | Files |
|----------|-------|
| Config | package.json, tsconfig.json, .env.example, .gitignore |
| Database | prisma/schema.prisma, prisma/seed.ts, prisma/migrations/* |
| Core | src/config/*, src/utils/*, src/middleware/* |
| Services | src/services/*.ts (7 services) |
| API | src/schemas/*, src/controllers/*.ts, src/routes/*.ts |
| App | src/app.ts, src/server.ts |
| Tests | tests/*.test.ts (6+ files) |
| Docker | Dockerfile, docker-compose.yml |
| Docs | README.md, SUBMISSION.md, CHECKLIST.md, PLAN.md, DEMO_SCRIPT.md |
| Proof | PROOF_OF_SUBMISSION/compute_proof.sh |

---

## Verification Commands

```bash
# 1. Install & setup
npm install
cp .env.example .env
# Edit .env with local values

# 2. Database
docker compose up -d postgres
npm run prisma:migrate:deploy
npm run prisma:seed

# 3. Test
npm run test:run

# 4. Build
npm run build

# 5. Docker full stack
docker compose down -v
docker compose up --build

# 6. Manual API test
curl http://localhost:3000/health
curl -X POST http://localhost:3000/api/auth/register ...
```

---

## Security Review Checklist (Post-Implementation)

- [ ] No raw passwords/OTPs/tokens in logs
- [ ] All DB queries parameterized (Prisma)
- [ ] Constant-time comparison for secrets
- [ ] Generic error messages (no enumeration)
- [ ] Rate limits on all auth endpoints
- [ ] JWT secret from env, not hardcoded
- [ ] Refresh tokens hashed (SHA-256), not plaintext
- [ ] OTP expires, single-use, attempt-limited
- [ ] Reset tokens expire, single-use
- [ ] Password reset revokes sessions
- [ ] Helmet headers present
- [ ] CORS restricted
- [ ] Input validation on all endpoints
- [ ] Transactions for multi-step operations
- [ ] No mass assignment vulnerabilities

---

## Assumptions & Trade-offs

1. **HS256 over RS256** - Simpler, adequate for challenge. RS256 noted as bonus.
2. **Challenge ID for 2FA** - Signed JWT containing userId, purpose, exp. Avoids server-side state.
3. **Mock SMS/Email** - Console logging with clear DEVELOPMENT ONLY markers.
4. **Rate Limits** - Relaxed in test env (`NODE_ENV=test`).
5. **Phone Format** - E.164 validated via regex, stored as-is.
6. **Email Normalization** - Lowercase + trim before DB operations.
7. **Audit Logs** - JSON metadata, no sensitive fields.

---

## Next Steps

Begin Phase 1 implementation: Create package.json, tsconfig.json, .env.example, .gitignore, prisma/schema.prisma, and prisma/seed.ts.