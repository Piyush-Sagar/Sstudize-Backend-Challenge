# Submission Details

## Exact Commands to Start Application

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your local values (MINIMUM: DATABASE_URL, JWT_SECRET)

# 3. Start PostgreSQL (if not running)
# Option A: Docker
docker run -d --name postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sstudize_auth -p 5432:5432 postgres:16-alpine
# Option B: Your local PostgreSQL

# 4. Run migrations
npm run prisma:migrate:deploy

# 5. Seed evaluator user
npm run prisma:seed

# 6. Start development server
npm run dev
# Server runs at http://localhost:3000
```

### Docker (Production-like)
```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with PRODUCTION values (especially JWT_SECRET!)

# 2. Build and start
docker compose up --build

# 3. Or detached
docker compose up -d --build

# 4. View logs
docker compose logs -f api
```

---

## Migration Commands

```bash
# Development: create new migration
npm run prisma:migrate

# Production/CI: apply pending migrations
npm run prisma:migrate:deploy

# Generate Prisma Client (after schema changes)
npx prisma generate

# Reset database (development only!)
npx prisma migrate reset --force

# Open Prisma Studio
npm run prisma:studio
```

---

## Seed Commands

```bash
# Seed evaluator user
npm run prisma:seed

# Output:
# 🌱 Seeding database...
# ✅ Created evaluator user: { id: '...', email: 'evaluator@example.com', ... }
# 📋 Evaluator Credentials:
#    Email:    evaluator@example.com
#    Password: Evaluator123!
#    Phone:    +14155552671
```

---

## Test Commands

```bash
# Run tests with UI (interactive)
npm test

# Run tests once (CI mode)
npm run test:run

# Run with coverage report
npm run test:coverage
```

---

## Evaluator Credentials

| Field | Value |
|-------|-------|
| **Email** | `evaluator@example.com` |
| **Password** | `Evaluator123!` |
| **Phone** | `+14155552671` |

> These credentials are created by `npm run prisma:seed`. Password is hashed with Argon2id.

---

## How to Retrieve Mock OTP

When running locally or in Docker, OTPs are logged to the **API server console** (stdout).

### For SMS OTP (2FA Enable / Login with 2FA):
```
============================================================
[MOCK SMS] DEVELOPMENT ONLY - OTP DELIVERY
============================================================
Timestamp:  2024-01-15T10:30:00.000Z
Recipient:  +14155552671
Purpose:    login_2fa
OTP Code:   123456

⚠️  THIS IS A MOCK SMS SERVICE FOR DEVELOPMENT ONLY
...
```

**The OTP Code is on the line: `OTP Code:   123456`**

### In Docker:
```bash
docker compose logs -f api
# Watch for the mock SMS output when triggering 2FA flows
```

### In Local Development:
Watch the terminal where `npm run dev` is running.

---

## How to Retrieve Password Reset Token

When calling `POST /api/auth/forgot-password`, the reset token is logged to the **API server console**:

```
============================================================
[MOCK EMAIL] DEVELOPMENT ONLY - PASSWORD RESET
============================================================
Timestamp:  2024-01-15T10:30:00.000Z
Recipient:  evaluator@example.com
Reset Token: a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456

⚠️  THIS IS A MOCK EMAIL SERVICE FOR DEVELOPMENT ONLY
...
```

**The Reset Token is on the line: `Reset Token: a1b2c3d4...`**

Use this token in `POST /api/auth/reset-password`:
```json
{
  "token": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
  "newPassword": "NewPassword123!"
}
```

---

## Proof Generation Commands

### Generate Proof of Submission

**Run this at FINAL SUBMISSION TIME (after final commit):**

```bash
# 1. Ensure you're in the repo root
cd /path/to/sstudize-backend-challenge

# 2. Run the proof script
./PROOF_OF_SUBMISSION/compute_proof.sh

# 3. Script will:
#    - Generate random challenge.txt (32 bytes hex)
#    - Get current git commit hash
#    - Compute SHA256(challenge + commit_hash)
#    - Sign with ECDSA secp256r1
#    - Create proof.txt (signature) and proof_pub.pem (public key)
#    - Display verification command

# 4. Add proof files to git
git add PROOF_OF_SUBMISSION/challenge.txt PROOF_OF_SUBMISSION/proof.txt PROOF_OF_SUBMISSION/proof_pub.pem

# 5. Commit
git commit -m "Add proof of submission"

# 6. Push to repository
git push origin main
```

### Verify Proof (Anyone Can Run)

```bash
# 1. Get the files
# challenge.txt, proof.txt, proof_pub.pem from the repository

# 2. Compute the signed message
# Message = challenge (with trailing newline from cat) + commit_hash (no newline)
# This matches compute_proof.sh: printf "%s%s" "$(cat challenge.txt)" "$COMMIT_HASH"
printf "%s%s" "$(cat challenge.txt)" "$(git rev-parse HEAD)"

# 3. Verify signature
openssl dgst -sha256 -verify proof_pub.pem -signature proof.txt <(printf "%s%s" "$(cat challenge.txt)" "$(git rev-parse HEAD)")

# Expected output: "Verified OK"
```

---

## Git Commit Hash

**Run at final submission time:**

```bash
git rev-parse HEAD
```

**Output placeholder:** `6085ac76f76a27fb2626b5c29d11fddc4941199c`

---

## SHA256 Output

**Run at final submission time (after proof generation):**

```bash
# The script will display this
cat challenge.txt; git rev-parse HEAD | tr -d '\n' | openssl dgst -sha256
```

**Output placeholder:** `0d25300684357e2688560bcf3c686a865e012532580ace1b0bf426aaf40610b3`

---

## Demonstration Video

**Link placeholder:** `🔗 TO BE ADDED AFTER RECORDING`

### Video Requirements (per DEMO_SCRIPT.md):
- ≤6 minutes
- Covers all required demo segments
- Shows working API endpoints
- Shows mock OTP retrieval
- Shows test results

---

## Proof Workflow Notes

### Circularity Handling

The proof requires the **final commit hash**, but generating proof files and committing them changes HEAD.

**Solution implemented:**
1. `compute_proof.sh` generates proof files WITHOUT committing
2. User runs script at final submission time
3. User manually adds and commits the proof files
4. The commit hash in the proof is the PRE-proof commit (or the final commit is documented separately)
5. Verification uses the committed proof files against the final commit

### Important Warnings

⚠️ **NEVER COMMIT:**
- `.env` (contains secrets)
- `PROOF_OF_SUBMISSION/proof_private.pem` (ECDSA private key)
- Any file with actual secrets

⚠️ **Run proof generation ONLY at final submission** - the challenge must be random and the commit hash must be final.

---

## Final Submission Checklist

- [ ] All tests pass (`npm run test:run`)
- [ ] Build succeeds (`npm run build`)
- [ ] Docker works (`docker compose up --build`)
- [ ] Migrations apply cleanly
- [ ] Seed creates evaluator user
- [ ] README.md complete
- [ ] SUBMISSION.md complete (this file)
- [ ] CHECKLIST.md all checked
- [ ] DEMO_SCRIPT.md ready
- [ ] PROOF_OF_SUBMISSION/compute_proof.sh executable
- [ ] Proof generated and verified at final commit
- [ ] Git hash and SHA256 filled in above
- [ ] Demo video recorded and linked
- [ ] No secrets committed (verify with `git diff --name-only HEAD`)