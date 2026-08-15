# Demo Script (≤6 minutes)

## Prerequisites
- Docker installed and running
- Repository cloned
- Terminal/capture software ready

---

### 0:00–0:30 | Application & PostgreSQL Running

**Action:**
```bash
# Terminal 1: Start stack
docker compose up --build

# Wait for: "Server running on port 3000"
# Terminal 2: Verify health
curl http://localhost:3000/health
```

**Expected:**
```
{"success":true,"status":"healthy","timestamp":"...","uptime":1.23}
```

**Say:** "The API and PostgreSQL are running. Health check passes."

---

### 0:30–1:00 | Register User

**Action:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@example.com",
    "password": "DemoPassword123!",
    "phone": "+14155552671"
  }'
```

**Expected (201):**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "id": "uuid...",
    "email": "demo@example.com",
    "phone": "+14155552671"
  }
}
```

**Say:** "User registered. Email normalized, password hashed with Argon2id, phone stored in E.164 format."

---

### 1:00–1:40 | Enable 2FA & Show Mock SMS OTP

**Action 1: Login to get access token**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@example.com",
    "password": "DemoPassword123!"
  }'
```

**Save the `accessToken` from response.**

**Action 2: Enable 2FA**
```bash
curl -X POST http://localhost:3000/api/auth/2fa/enable \
  -H "Authorization: Bearer <accessToken>"
```

**Action 3: Show Mock SMS in Docker Logs**
```bash
# In another terminal or scroll up in docker logs
docker compose logs api | grep -A 10 "MOCK SMS"
```

**Expected:**
```
[MOCK SMS] DEVELOPMENT ONLY - OTP DELIVERY
...
OTP Code:   123456
```

**Say:** "2FA enable initiated. OTP sent via mock SMS (logged to console). Evaluator can see OTP: 123456"

**Action 4: Verify OTP to enable 2FA**
```bash
curl -X POST http://localhost:3000/api/auth/2fa/verify \
  -H "Content-Type: application/json" \
  -d '{"challengeId": "<challengeId>", "code": "123456"}'
```

**Expected:** `"message": "Two-factor authentication has been enabled"`

---

### 1:40–2:30 | Login Using Password + OTP

**Action 1: Login (triggers 2FA)**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@example.com",
    "password": "DemoPassword123!"
  }'
```

**Expected (200):**
```json
{
  "success": true,
  "requires2FA": true,
  "challengeId": "eyJ...",
  "message": "Two-factor authentication required"
}
```

**Action 2: Get OTP from mock SMS logs**
```bash
docker compose logs api | grep -A 10 "MOCK SMS" | tail -15
```

**Action 3: Verify Login OTP**
```bash
curl -X POST http://localhost:3000/api/auth/2fa/verify \
  -H "Content-Type: application/json" \
  -d '{"challengeId": "<newChallengeId>", "code": "<otpFromLogs>"}'
```

**Expected (200):**
```json
{
  "success": true,
  "requires2FA": false,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "a1b2c3..."
  }
}
```

**Say:** "Login with 2FA complete. Received new access and refresh tokens."

---

### 2:30–3:10 | Use Access Token on Protected /api/profile

**Action:**
```bash
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer <accessToken>"
```

**Expected (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid...",
    "email": "demo@example.com",
    "phone": "+14155552671",
    "is2faEnabled": true
  }
}
```

**Say:** "Protected endpoint works. Returns safe profile fields only."

**Show failure without token:**
```bash
curl -X GET http://localhost:3000/api/profile
# Expected: 401 Authentication required
```

---

### 3:10–3:40 | Refresh Access Token & Demonstrate Rotation

**Action 1: Refresh tokens**
```bash
curl -X POST http://localhost:3000/api/auth/token/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refreshToken>"}'
```

**Expected (200):** New `accessToken` and NEW `refreshToken`

**Action 2: Try old refresh token (should fail)**
```bash
curl -X POST http://localhost:3000/api/auth/token/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<OLD_refreshToken>"}'
```

**Expected (401):**
```json
{
  "success": false,
  "error": { "code": "REFRESH_TOKEN_REVOKED", "message": "..." }
}
```

**Say:** "Token rotation working. Old refresh token revoked and cannot be reused."

---

### 3:40–4:40 | Forgot Password & Reset Password

**Action 1: Forgot password**
```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@example.com"}'
```

**Expected (200):** Generic message (no enumeration)

**Action 2: Get reset token from logs**
```bash
docker compose logs api | grep -A 10 "MOCK EMAIL" | tail -15
```
**Copy the `Reset Token:` value**

**Action 3: Reset password**
```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "<resetTokenFromLogs>",
    "newPassword": "NewDemoPassword123!"
  }'
```

**Expected (200):** Password reset successful

**Action 4: Verify old password fails, new works**
```bash
# Old password should fail
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@example.com", "password": "DemoPassword123!"}'
# Expected: 401

# New password should work
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@example.com", "password": "NewDemoPassword123!"}'
# Expected: 200 with tokens
```

**Say:** "Password reset works. Old sessions revoked, new password works."

---

### 4:40–5:10 | Login with New Password

**Action:** (Already shown above - login with new password works)

**Say:** "Full password reset cycle demonstrated."

---

### 5:10–5:40 | Show OTP/Token Generation & Verification Code

**Action:** Quickly show key source files
```bash
# OTP service - race-safe verification
cat src/services/otp.service.ts | head -80

# Refresh token rotation
cat src/services/refresh-token.service.ts | head -60

# Password reset with session revocation
cat src/services/password-reset.service.ts | head -60
```

**Say:** "Key security implementations: transaction-safe OTP verify, refresh token rotation, password reset revokes all sessions."

---

### 5:40–6:00 | Show Automated Test Results

**Action:**
```bash
npm run test:run
```

**Expected:** All tests passing (green output)

**Say:** "All automated tests pass. Coverage includes registration, login, 2FA, refresh, logout, password reset, and protected endpoints."

---

## Quick Reference: All Curl Commands

```bash
# Health
curl http://localhost:3000/health

# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"DemoPassword123!","phone":"+14155552671"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"DemoPassword123!"}'

# Enable 2FA
curl -X POST http://localhost:3000/api/auth/2fa/enable \
  -H "Authorization: Bearer <accessToken>"

# Verify OTP
curl -X POST http://localhost:3000/api/auth/2fa/verify \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"<id>","code":"123456"}'

# Refresh
curl -X POST http://localhost:3000/api/auth/token/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<token>"}'

# Logout
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<token>"}'

# Profile
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer <accessToken>"

# Forgot Password
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com"}'

# Reset Password
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"<resetToken>","newPassword":"NewPass123!"}'
```

---

## Demo Tips

1. **Pre-run Docker** - Have `docker compose up --build` running before recording
2. **Use variables** - Save tokens in shell variables for cleaner commands
3. **Clear logs** - `docker compose logs api --since=1m` to show recent only
4. **JQ for formatting** - Pipe to `jq .` for pretty JSON in demo
5. **Explain as you go** - Security features: Argon2, rotation, constant-time, etc.