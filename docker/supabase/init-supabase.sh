#!/bin/bash
# Initialize Supabase self-hosted environment
# Run this once before starting docker compose

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Supabase Self-Hosted Initialization"
echo "===================================="

# Check if .env already exists
if [[ -f ".env" ]]; then
    echo "Found existing .env file."
    read -p "Do you want to regenerate secrets? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing configuration."
        exit 0
    fi
fi

# Generate secrets
echo "Generating secrets..."

POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -base64 32 | tr -d '\n')
LOGFLARE_API_KEY=$(openssl rand -hex 32)
DASHBOARD_PASSWORD=$(openssl rand -hex 16)

# Generate JWT tokens using the JWT secret
# These need to match exactly what Supabase expects
generate_jwt() {
    local role=$1
    local secret=$2

    # Header: {"alg":"HS256","typ":"JWT"}
    local header=$(echo -n '{"alg":"HS256","typ":"JWT"}' | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

    # Payload with role
    local now=$(date +%s)
    local exp=$((now + 315360000)) # 10 years
    local payload=$(echo -n "{\"role\":\"$role\",\"iss\":\"supabase\",\"iat\":$now,\"exp\":$exp}" | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

    # Signature
    local signature=$(echo -n "${header}.${payload}" | openssl dgst -sha256 -hmac "$secret" -binary | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

    echo "${header}.${payload}.${signature}"
}

ANON_KEY=$(generate_jwt "anon" "$JWT_SECRET")
SERVICE_ROLE_KEY=$(generate_jwt "service_role" "$JWT_SECRET")

# Create .env file
cat > .env << EOF
# Supabase Self-Hosted Configuration
# Generated on $(date)
# DO NOT COMMIT THIS FILE TO VERSION CONTROL

############
# Secrets
# YOU MUST CHANGE THESE BEFORE GOING INTO PRODUCTION
############

POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD

############
# Database
############
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=postgres

############
# API URLs
############
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
API_EXTERNAL_URL=http://localhost:8000

############
# Studio
############
STUDIO_PORT=3000
STUDIO_DEFAULT_ORGANIZATION=Claire
STUDIO_DEFAULT_PROJECT=Claire Backend
SUPABASE_PUBLIC_URL=http://localhost:8000
DASHBOARD_USERNAME=supabase

############
# Auth
############
SITE_URL=http://localhost:3000
ADDITIONAL_REDIRECT_URLS=
DISABLE_SIGNUP=false
JWT_EXPIRY=3600

############
# Email (Optional - for email auth)
############
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_ADMIN_EMAIL=

############
# Phone (Optional - for phone auth)
############
ENABLE_PHONE_SIGNUP=false
ENABLE_PHONE_AUTOCONFIRM=true

############
# Analytics
############
LOGFLARE_API_KEY=$LOGFLARE_API_KEY

############
# Other
############
ENABLE_ANONYMOUS_USERS=false
IMGPROXY_ENABLE_WEBP_DETECTION=true
EOF

echo ""
echo "=========================================="
echo "Supabase initialization complete!"
echo "=========================================="
echo ""
echo "Generated credentials:"
echo "  Dashboard URL:      http://localhost:3000"
echo "  API URL:            http://localhost:8000"
echo "  Database:           postgresql://postgres:***@localhost:5432/postgres"
echo ""
echo "  Dashboard Username: supabase"
echo "  Dashboard Password: $DASHBOARD_PASSWORD"
echo ""
echo "Keys for your application:"
echo "  SUPABASE_URL:       http://localhost:8000"
echo "  SUPABASE_ANON_KEY:  $ANON_KEY"
echo "  SERVICE_ROLE_KEY:   $SERVICE_ROLE_KEY"
echo ""
echo "Next steps:"
echo "  1. Start Supabase: docker compose -f docker-compose.supabase.yml up -d"
echo "  2. Wait for services to be healthy: docker compose -f docker-compose.supabase.yml ps"
echo "  3. Open dashboard: http://localhost:3000"
echo ""
EOF
