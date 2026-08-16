# Sstudize Authentication Backend

A production-ready RESTful authentication backend built with Node.js, TypeScript, Express, PostgreSQL, and Prisma ORM.

## 🚀 Features

- **User Registration** - Email, password (Argon2id), phone (E.164)
- **Password Login** - With account enumeration protection
- **JWT Access Tokens** - Short-lived (10 min), HS256 signed
- **Refresh Tokens** - Opaque tokens, rotation, revocation, reuse detection
- **SMS OTP 2FA** - Enable, verify, login with 2FA (mock SMS for dev)
- **Password Reset** - Secure tokens, single-use, session revocation
- **Protected Profile** - JWT authenticated endpoint
- **Audit Logging** - Authentication events (no sensitive data)
- **Rate Limiting** - Per-endpoint configurable limits
- **Input Validation** - Zod schemas on all endpoints
- **Docker Support** - Multi-stage build, health checks
- **Comprehensive Tests** - Vitest + Supertest

---

## 🏗 Architecture

```
src/
├── app.ts                      # Express app setup
├── server.ts                   # Server entry point
├── config/
│   ├── env.ts                  # Validated environment config
│   └── database.ts             # Prisma client singleton
├── controllers/
│   ├── auth.controller.ts      # Auth endpoints
│   └── profile.controller.ts   # Profile endpoint
├── middleware/
│   ├── authenticate.ts         # JWT authentication
│   ├── validate.ts             # Zod validation
│   ├── rate-limit.ts           # Express-rate-limit configs
│   └── error-handler.ts        # Global error handling
├── routes/
│   ├── auth.routes.ts          # Auth routes
│   └── profile.routes.ts       # Profile routes
├── schemas/
│   └── auth.schemas.ts         # Zod validation schemas
├── services/
│   ├── auth.service.ts         # High-level auth orchestration
│   ├── jwt.service.ts          # JWT sign/verify
│   ├── refresh-token.service.ts # Refresh token CRUD + rotation
│   ├── otp.service.ts          # OTP generate/verify (transaction-safe)
│   ├── sms.service.ts          # SMS adapter (mock + interface)
│   ├── password-reset.service.ts # Reset token flow
│   └── audit.service.ts        # Audit logging
├── utils/
│   ├── crypto.ts               # Hashing, tokens, constant-time compare
│   └── errors.ts               # Custom error classes
```

---

## 🛠 Technology Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js 20+ |
| Language | TypeScript 5 |
| Framework | Express 4 |
| Database | PostgreSQL 16 |
| ORM | Prisma 5 |
| Password Hash | Argon2id (@argonauts/argon2) |
| JWT | jsonwebtoken |
| Validation | Zod 3 |
| Rate Limiting | express-rate-limit 7 |
| Security | Helmet, CORS |
| Testing | Vitest 2, Supertest 7 |
| Containerization | Docker, Docker Compose |

---

## 🔐 Security Design

### Password Storage
- **Algorithm**: Argon2id (memory-hard, winner of Password Hashing Competition)
- **Parameters**: Memory=19456 KB, Time=2, Parallelism=1
- **Never** stored in plaintext or logged

### JWT Access Tokens
- **Algorithm**: HS256 (RS256 noted as future enhancement)
- **Expiry**: 10 minutes
- **Claims**: `sub` (userId), `email`, `is2faEnabled`, `iat`, `exp`
- **Secret**: 32+ chars from environment variable

### Refresh Tokens
- **Type**: Opaque, cryptographically random (32 bytes)
- **Storage**: SHA-256 hash only (never plaintext)
- **Expiry**: 7 days
- **Rotation**: Revoked on use, new token issued
- **Reuse Detection**: Logs audit event on reuse attempt

### OTP (2FA)
- **Format**: 6-digit numeric
- **Generation**: Cryptographically secure random
- **Storage**: SHA-256 hash
- **Expiry**: 5 minutes
- **Max Attempts**: 5
- **Single-use**: Marked used on verification
- **Race-safe**: Database transaction for verify+mark-used

### Password Reset Tokens
- **Entropy**: 32 random bytes (256 bits)
- **Storage**: SHA-256 hash
- **Expiry**: 1 hour
- **Single-use**: Marked used on reset
- **Session Revocation**: All refresh tokens revoked on reset

### Rate Limiting
| Endpoint | Window | Max Requests |
|----------|--------|-------------|
| General API | 15 min | 100 |
| Auth endpoints | 15 min | 10 |
| Login | 15 min | 10 |
| Register | 15 min | 10 |
| OTP | 15 min | 10 |
| Password Reset | 1 hour | 3 |
| Token Refresh | 15 min | 20 |

### Other Security Measures
- Helmet security headers
- CORS restricted to configured origin
- Input validation on all endpoints (Zod)
- Generic error messages (no user enumeration)
- Constant-time comparison for secrets
- Parameterized queries (Prisma)
- Audit logging excludes sensitive data

---

## 🗄 Database Schema

```prisma
User {
  id            UUID    @id @default(uuid())
  email         String  @unique
  passwordHash  String
  phone         String?
  isActive      Boolean @default(true)
  is2faEnabled  Boolean @default(false)
  createdAt     DateTime
  updatedAt     DateTime
}

RefreshToken {
  id        UUID    @id @default(uuid())
  userId    UUID
  tokenHash String  @unique
  expiresAt DateTime
  revoked   Boolean @default(false)
  createdAt DateTime
}

OTP {
  id        UUID    @id @default(uuid())
  userId    UUID
  codeHash  String
  purpose   String  // "enable_2fa" | "login_2fa"
  expiresAt DateTime
  used      Boolean @default(false)
  attempts  Int     @default(0)
  createdAt DateTime
}

PasswordReset {
  id        UUID    @id @default(uuid())
  userId    UUID
  tokenHash String  @unique
  expiresAt DateTime
  used      Boolean @default(false)
  createdAt DateTime
}

AuditLog {
  id        UUID    @id @default(uuid())
  userId    UUID?
  event     String
  metadata  Json?
  ip        String?
  userAgent String?
  createdAt DateTime
}
```

---

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | Server port | `3000` |
| `API_PREFIX` | API route prefix | `/api` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | JWT signing secret (32+ chars) | Required |
| `JWT_ACCESS_TOKEN_EXPIRY` | Access token TTL | `10m` |
| `JWT_REFRESH_TOKEN_EXPIRY` | Refresh token TTL | `7d` |
| `ARGON2_MEMORY_COST` | Argon2 memory (KB) | `19456` |
| `ARGON2_TIME_COST` | Argon2 iterations | `2` |
| `ARGON2_PARALLELISM` | Argon2 threads | `1` |
| `RATE_LIMIT_WINDOW_MS` | General rate limit window | `900000` |
| `RATE_LIMIT_MAX_REQUESTS` | General max requests | `100` |
| `RATE_LIMIT_AUTH_MAX_REQUESTS` | Auth max requests | `10` |
| `OTP_CODE_LENGTH` | OTP digits | `6` |
| `OTP_EXPIRY_MINUTES` | OTP TTL | `5` |
| `OTP_MAX_ATTEMPTS` | Max OTP attempts | `5` |
| `RESET_TOKEN_EXPIRY_HOURS` | Reset token TTL | `1` |
| `RESET_TOKEN_BYTES` | Reset token entropy | `32` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:3000` |
| `MOCK_SMS_ENABLED` | Use mock SMS | `true` |
| `MOCK_EMAIL_ENABLED` | Use mock email | `true` |

---

## 🏃 Local Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- npm/pnpm

### Installation

```bash
# Clone and install
git clone <repository-url>
cd sstudize-auth-backend
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values

# Run migrations
npm run prisma:migrate

# Seed evaluator user
npm run prisma:seed

# Start development server
npm run dev
```

### Database Setup (PostgreSQL)

```bash
# Using Docker (recommended)
docker run -d \
  --name postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=sstudize_auth \
  -p 5432:5432 \
  postgres:16-alpine

# Or use your existing PostgreSQL instance
```

---

## 🐳 Docker Setup

```bash
# Configure environment
cp .env.example .env
# Edit .env with production values (especially JWT_SECRET!)

# Build and start
docker compose up --build

# Run in background
docker compose up -d --build

# View logs
docker compose logs -f api

# Stop
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v
```

### Docker Compose Services
- **postgres**: PostgreSQL 16 with health check
- **api**: Node.js application with multi-stage build

The API container waits for PostgreSQL health check, runs migrations, then starts.

---

## 📦 Migrations

```bash
# Create new migration (development)
npm run prisma:migrate

# Apply migrations (production/CI)
npm run prisma:migrate:deploy

# Generate Prisma Client
npx prisma generate

# Open Prisma Studio
npm run prisma:studio
```

---

## 🌱 Seed Data

```bash
npm run prisma:seed
```

Creates evaluator user:
- **Email**: `evaluator@example.com`
- **Password**: `Evaluator123!`
- **Phone**: `+14155552671`

---

## 🧪 Testing

```bash
# Run tests with UI
npm test

# Run tests once (CI)
npm run test:run

# Run with coverage
npm run test:coverage
```

### Test Coverage
- ✅ Registration (success, duplicate, validation)
- ✅ Login (success, invalid password, unknown user, inactive, 2FA)
- ✅ Protected endpoints (valid token, no token, invalid token)
- ✅ 2FA (enable, verify, invalid OTP, reuse, attempts, expiry, login with 2FA)
- ✅ Token Refresh (success, rotation, revoked, expired, inactive user)
- ✅ Logout (revoke, prevent reuse)
- ✅ Forgot Password (generic response, token creation)
- ✅ Reset Password (success, session revocation, reuse, expiry, invalid)

---

## 📡 API Endpoints

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Password login |
| POST | `/api/auth/2fa/enable` | JWT | Initiate 2FA enable |
| POST | `/api/auth/2fa/verify` | Challenge | Verify OTP |
| POST | `/api/auth/token/refresh` | Refresh | Rotate tokens |
| POST | `/api/auth/logout` | Refresh | Revoke refresh token |
| POST | `/api/auth/forgot-password` | No | Request password reset |
| POST | `/api/auth/reset-password` | No | Reset password |

### Profile

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/profile` | JWT | Get user profile |

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Health check |

---

## 📝 Example API Calls

### Register
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "phone": "+14155552671"
  }'
```

### Login (No 2FA)
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'

# Response:
# {
#   "success": true,
#   "requires2FA": false,
#   "data": {
#     "accessToken": "eyJhbGciOiJIUzI1NiIs...",
#     "refreshToken": "a1b2c3d4e5f6..."
#   }
# }
```

### Login (With 2FA Enabled)
```bash
# Step 1: Login returns challenge
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "SecurePassword123!"}'

# Response:
# {"success":true,"requires2FA":true,"challengeId":"eyJhbGciOiJIUzI1NiIs...","message":"..."}

# Step 2: Verify OTP (check console for mock SMS OTP)
curl -X POST http://localhost:3000/api/auth/2fa/verify \
  -H "Content-Type: application/json" \
  -d '{"challengeId": "...", "code": "123456"}'
```

### Enable 2FA
```bash
# Requires valid access token from login
curl -X POST http://localhost:3000/api/auth/2fa/enable \
  -H "Authorization: Bearer <accessToken>"

# Check console for mock SMS OTP, then verify:
curl -X POST http://localhost:3000/api/auth/2fa/verify \
  -H "Content-Type: application/json" \
  -d '{"challengeId": "...", "code": "123456"}'
```

### Refresh Token
```bash
curl -X POST http://localhost:3000/api/auth/token/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refreshToken>"}'
```

### Logout
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refreshToken>"}'
```

### Forgot Password
```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'

# Check console for mock email with reset token
```

### Reset Password
```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token": "<resetToken>", "newPassword": "NewPassword123!"}'
```

### Profile
```bash
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer <accessToken>"

# Response:
# {
#   "success": true,
#   "data": {
#     "id": "uuid",
#     "email": "user@example.com",
#     "phone": "+14155552671",
#     "is2faEnabled": true
#   }
# }
```

---

## 🎫 JWT Design

### Access Token
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "is2faEnabled": true,
  "iat": 1234567890,
  "exp": 1234568490
}
```

- **Header**: `{"alg": "HS256", "typ": "JWT"}`
- **Payload**: Minimal claims only
- **No sensitive data** in token

### Refresh Token
- Opaque random string (64 hex chars = 32 bytes)
- Stored as SHA-256 hash in database
- Rotated on each use

---

## 🔄 Refresh Token Design

```
Login/Refresh
     │
     ▼
┌─────────────┐
│ Generate new │────▶ Store SHA-256(hash) in DB
│ 32-byte token│       with expiry (7 days)
└─────────────┘
     │
     ▼
Return plain token to client
     │
     ▼
Client uses token
     │
     ▼
┌─────────────┐
│ Hash token  │
│ Look up in  │────▶ If found, not expired, not revoked
│  DB         │       & user active → SUCCESS
└─────────────┘
     │
     ├──▶ REVOKE old token (rotation)
     │
     └──▶ Generate NEW token, store hash, return both tokens
```

**Reuse Detection**: If a revoked token is presented again, audit log event `REFRESH_TOKEN_REUSE_DETECTED` is created.

---

## 📱 2FA Design

### Enable 2FA Flow
```
1. GET /api/auth/2fa/enable (with JWT)
   ├── Verify user has phone
   ├── Generate OTP (6-digit, 5 min)
   ├── Store hash (purpose: enable_2fa)
   ├── Send via SMS adapter
   ├── Return challengeId (signed JWT)
   └── Log OTP_SENT

2. POST /api/auth/2fa/verify (challengeId + code)
   ├── Verify challengeId (extract userId, purpose)
   ├── Find OTP (userId, purpose, not used, not expired)
   ├── Constant-time hash compare
   ├── Increment attempts
   ├── If valid: mark used, set is2faEnabled=true
   ├── Log OTP_VERIFIED, TWO_FA_ENABLED
   └── Return success
```

### Login with 2FA Flow
```
1. POST /api/auth/login (email + password)
   ├── Verify credentials
   ├── If 2FA enabled:
   │   ├── Generate OTP (purpose: login_2fa)
   │   ├── Store hash
   │   ├── Send via SMS
   │   ├── Return challengeId + requires2FA=true
   │   └── Log OTP_SENT, LOGIN_SUCCESS
   └── If 2FA disabled: return tokens directly

2. POST /api/auth/2fa/verify (challengeId + code)
   ├── Same verification as enable
   ├── If valid: generate access + refresh tokens
   └── Log LOGIN_SUCCESS (method: 2fa)
```

---

## 📲 Mock SMS Instructions

In development (`MOCK_SMS_ENABLED=true`), OTPs are logged to console:

```
============================================================
[MOCK SMS] DEVELOPMENT ONLY - OTP DELIVERY
============================================================
Timestamp:  2024-01-15T10:30:00.000Z
Recipient:  +14155552671
Purpose:    login_2fa
OTP Code:   123456

⚠️  THIS IS A MOCK SMS SERVICE FOR DEVELOPMENT ONLY
⚠️  In production, this would integrate with Twilio, Vonage, etc.
============================================================
```

**To get the OTP during testing**: Check the console output where the API server is running.

The `smsService` is an interface - replace `MockSMSProvider` with `ProductionSMSProvider` (implement Twilio/Vonage) for production.

---

## 📲 Real SMS with Twilio Verify

The application supports **Twilio Verify** as a production SMS delivery provider. This uses Twilio's Verify API with **custom verification codes** so the application's own OTPs are delivered via SMS.

### Setup

1. **Create a Twilio Verify Service** in the [Twilio Console](https://console.twilio.com/us1/develop/verify/services)
2. **Enable Custom Verification Codes** in the Verify Service settings
3. **Verify destination phone numbers** in the Twilio Console (required for trial accounts)

### Configuration

Add to your `.env`:

```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token-here
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

| Variable | Description | Required |
|----------|-------------|----------|
| `SMS_PROVIDER` | Set to `twilio` to enable | Yes |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | Yes |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token (secret!) | Yes |
| `TWILIO_VERIFY_SERVICE_SID` | Verify Service SID | Yes |

### Trial Account Notes

- Trial accounts can only send SMS to **verified phone numbers**
- Verify numbers in: Twilio Console → Phone Numbers → Verified Caller IDs
- The application will return a safe error: `"Unverified trial number - verify in Twilio console"` if the number isn't verified

### Fallback to Mock

To disable Twilio and use mock SMS (for development/testing):

```env
SMS_PROVIDER=mock
```

This is the default and requires no Twilio credentials.

### Docker

The Docker Compose configuration passes through all Twilio environment variables:

```yaml
SMS_PROVIDER: ${SMS_PROVIDER:-mock}
TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID:-}
TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN:-}
TWILIO_VERIFY_SERVICE_SID: ${TWILIO_VERIFY_SERVICE_SID:-}
```

Default Docker operation uses `SMS_PROVIDER=mock`.

---

## 📧 Mock Email / Reset Token Instructions

Password reset tokens are logged similarly:

```
============================================================
[MOCK EMAIL] DEVELOPMENT ONLY - PASSWORD RESET
============================================================
Timestamp:  2024-01-15T10:30:00.000Z
Recipient:  user@example.com
Reset Token: a1b2c3d4e5f6...

⚠️  THIS IS A MOCK EMAIL SERVICE FOR DEVELOPMENT ONLY
⚠️  In production, this would send an actual email
============================================================
```

**To get the reset token**: Check the console output where the API server is running.

---

## ⚖️ Rate Limiting

All authentication endpoints are protected by `express-rate-limit`:

- **Window**: 15 minutes (configurable)
- **Storage**: In-memory (Redis recommended for production clusters)
- **Headers**: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
- **Test Environment**: Limits increased to 10000 for test reliability

---

## 🎯 Design Decisions & Trade-offs

| Decision | Rationale |
|----------|-----------|
| HS256 over RS256 | Simpler key management, adequate for challenge scope. RS256 noted as future enhancement. |
| Opaque refresh tokens | More secure than JWT refresh tokens - revocable, no info leakage. |
| Challenge ID as signed JWT | Stateless 2FA flow - no server-side session storage needed. |
| Mock SMS/Email | Evaluator-friendly - no external dependencies needed. |
| Argon2id over bcrypt | Modern, memory-hard, winner of PHC. |
| Prisma over raw SQL | Type-safe, prevents SQL injection, easier migrations. |
| SHA-256 for token hashing | Fast, deterministic, suitable for lookup. No need for bcrypt/Argon2 here. |
| Constant-time compare | Prevents timing attacks on OTP/token verification. |

---

## 🏆 Bonus Functionality

- ✅ Refresh token reuse detection with audit logging
- ✅ Constant-time comparison for all secret verification
- ✅ Transaction-safe OTP verification
- ✅ Password reset revokes all user sessions
- ✅ Comprehensive audit logging (no sensitive data)
- ✅ Docker multi-stage build with non-root user
- ✅ Health checks for container orchestration
- ✅ Graceful shutdown handling
- ✅ Structured error responses with codes
- ✅ Input sanitization (email normalization)

---

## 📄 License

MIT