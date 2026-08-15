#!/bin/bash
# ============================================
# PROOF OF SUBMISSION - Cryptographic Proof Generator
# ============================================
# This script generates a cryptographic proof of submission by:
# 1. Creating a random 32-byte challenge (challenge.txt)
# 2. Getting the current git commit hash
# 3. Computing SHA256(challenge + commit_hash) - concatenated exactly
# 4. Signing the SHA256 digest with ECDSA secp256r1 (prime256v1)
# 5. Outputting proof.txt (signature) and proof_pub.pem (public key)
# ============================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROOF_DIR="PROOF_OF_SUBMISSION"
CHALLENGE_FILE="$PROOF_DIR/challenge.txt"
PROOF_FILE="$PROOF_DIR/proof.txt"
PUB_KEY_FILE="$PROOF_DIR/proof_pub.pem"
PRIV_KEY_FILE="$PROOF_DIR/proof_private.pem"

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  PROOF OF SUBMISSION GENERATOR${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# Ensure we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Not a git repository. Run from repo root.${NC}"
    exit 1
fi

# Check for uncommitted changes (excluding proof files themselves)
UNCOMMITTED=$(git status --porcelain | grep -v "^?? $PROOF_DIR/" | grep -v "^A  $PROOF_DIR/" || true)
if [ -n "$UNCOMMITTED" ]; then
    echo -e "${YELLOW}⚠️  Warning: Uncommitted changes detected:${NC}"
    echo "$UNCOMMITTED"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi

# Create proof directory
mkdir -p "$PROOF_DIR"

# Step 1: Generate random 32-byte challenge (64 hex chars)
echo -e "${BLUE}[1/6] Generating random challenge...${NC}"
openssl rand -hex 32 > "$CHALLENGE_FILE"
CHALLENGE=$(cat "$CHALLENGE_FILE")
echo -e "    Challenge: ${GREEN}$CHALLENGE${NC}"
echo ""

# Step 2: Get current git commit hash
echo -e "${BLUE}[2/6] Getting git commit hash...${NC}"
COMMIT_HASH=$(git rev-parse HEAD)
echo -e "    Commit: ${GREEN}$COMMIT_HASH${NC}"
echo ""

# Step 3: Concatenate challenge + commit_hash EXACTLY (no whitespace/newline)
echo -e "${BLUE}[3/6] Computing SHA256(challenge + commit_hash)...${NC}"
# Use printf to avoid newline
MESSAGE=$(printf "%s%s" "$CHALLENGE" "$COMMIT_HASH")
# Verify the concatenation
echo -e "    Message length: ${#MESSAGE} chars (64 + 40 = 104)"
# Compute SHA256
SHA256_DIGEST=$(printf "%s" "$MESSAGE" | openssl dgst -sha256 -binary | xxd -p -c 256)
echo -e "    SHA256: ${GREEN}$SHA256_DIGEST${NC}"
echo ""

# Step 4: Generate ECDSA key pair (secp256r1 / prime256v1)
echo -e "${BLUE}[4/6] Generating ECDSA secp256r1 key pair...${NC}"
openssl ecparam -genkey -name prime256v1 -noout -out "$PRIV_KEY_FILE"
openssl ec -in "$PRIV_KEY_FILE" -pubout -out "$PUB_KEY_FILE"
echo -e "    Private key: $PRIV_KEY_FILE (${RED}NEVER COMMIT${NC})"
echo -e "    Public key:  $PUB_KEY_FILE"
echo ""

# Step 5: Sign the SHA256 digest
echo -e "${BLUE}[5/6] Signing SHA256 digest with ECDSA...${NC}"
# Create the digest in binary form for signing
printf "%s" "$MESSAGE" | openssl dgst -sha256 -sign "$PRIV_KEY_FILE" -out "$PROOF_FILE"
# Verify signature immediately
VERIFY_RESULT=$(printf "%s" "$MESSAGE" | openssl dgst -sha256 -verify "$PUB_KEY_FILE" -signature "$PROOF_FILE" 2>&1)
echo -e "    Verification: ${GREEN}$VERIFY_RESULT${NC}"
echo ""

# Step 6: Display results
echo -e "${BLUE}[6/6] Proof generation complete!${NC}"
echo ""
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  GENERATED FILES${NC}"
echo -e "${BLUE}============================================================${NC}"
echo -e "  ${GREEN}$CHALLENGE_FILE${NC}     - Random 32-byte challenge (hex)"
echo -e "  ${GREEN}$PROOF_FILE${NC}           - ECDSA signature of SHA256(challenge+commit)"
echo -e "  ${GREEN}$PUB_KEY_FILE${NC}        - Public key for verification"
echo -e "  ${RED}$PRIV_KEY_FILE${NC}       - Private key (${RED}DO NOT COMMIT${NC})"
echo ""
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  VERIFICATION COMMAND${NC}"
echo -e "${BLUE}============================================================${NC}"
echo -e "  Run this to verify the proof:"
echo ""
echo -e "  ${YELLOW}printf \"%s%s\" \"\$(cat $CHALLENGE_FILE)\" \"\$(git rev-parse HEAD | tr -d '\\n')\" | openssl dgst -sha256 -verify $PUB_KEY_FILE -signature $PROOF_FILE${NC}"
echo ""
echo -e "  Expected output: ${GREEN}Verified OK${NC}"
echo ""
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  NEXT STEPS${NC}"
echo -e "${BLUE}============================================================${NC}"
echo -e "  1. Review generated files"
echo -e "  2. Add proof files to git (NOT the private key!):"
echo -e "     ${YELLOW}git add $CHALLENGE_FILE $PROOF_FILE $PUB_KEY_FILE${NC}"
echo -e "  3. Commit:"
echo -e "     ${YELLOW}git commit -m \"Add proof of submission\"${NC}"
echo -e "  4. Push to repository"
echo ""
echo -e "${RED}⚠️  IMPORTANT: Never commit $PRIV_KEY_FILE${NC}"
echo -e "${RED}⚠️  It is already in .gitignore${NC}"
echo ""

# Show file contents for reference
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  FILE CONTENTS${NC}"
echo -e "${BLUE}============================================================${NC}"
echo -e "challenge.txt:  $(cat "$CHALLENGE_FILE")"
echo -e "proof.txt:      $(xxd -p -c 256 "$PROOF_FILE" | head -c 128)..."
echo -e "proof_pub.pem:  $(head -1 "$PUB_KEY_FILE") ... $(tail -1 "$PUB_KEY_FILE")"
echo ""