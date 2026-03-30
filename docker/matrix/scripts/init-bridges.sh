#!/bin/bash
# Initialize Matrix bridges by generating tokens and updating configs
# Run this ONCE before starting docker compose

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MATRIX_DIR="$(dirname "$SCRIPT_DIR")"

echo "Matrix Bridge Initialization Script"
echo "===================================="

# Generate tokens for each bridge
generate_tokens() {
    local bridge=$1
    local as_token=$(openssl rand -hex 32)
    local hs_token=$(openssl rand -hex 32)

    echo "Generating tokens for $bridge bridge..."

    # Update config.yaml
    if [[ -f "$MATRIX_DIR/bridges/$bridge/config.yaml" ]]; then
        sed -i.bak "s/GENERATE_ME_WITH_OPENSSL_RAND_HEX_32/$as_token/1" "$MATRIX_DIR/bridges/$bridge/config.yaml"
        sed -i.bak "s/GENERATE_ME_WITH_OPENSSL_RAND_HEX_32/$hs_token/1" "$MATRIX_DIR/bridges/$bridge/config.yaml"
        rm -f "$MATRIX_DIR/bridges/$bridge/config.yaml.bak"
    fi

    # Update registration.yaml (same tokens)
    if [[ -f "$MATRIX_DIR/bridges/$bridge/registration.yaml" ]]; then
        sed -i.bak "s/GENERATE_ME_WITH_OPENSSL_RAND_HEX_32/$as_token/1" "$MATRIX_DIR/bridges/$bridge/registration.yaml"
        sed -i.bak "s/GENERATE_ME_WITH_OPENSSL_RAND_HEX_32/$hs_token/1" "$MATRIX_DIR/bridges/$bridge/registration.yaml"
        rm -f "$MATRIX_DIR/bridges/$bridge/registration.yaml.bak"
    fi

    echo "  ✓ $bridge tokens generated"
}

# Generate Synapse secrets
generate_synapse_secrets() {
    echo "Generating Synapse secrets..."

    local reg_secret=$(openssl rand -hex 32)
    local mac_secret=$(openssl rand -hex 32)
    local form_secret=$(openssl rand -hex 32)

    if [[ -f "$MATRIX_DIR/synapse/homeserver.yaml" ]]; then
        sed -i.bak "s/CHANGE_ME_TO_SECURE_SECRET/$reg_secret/1" "$MATRIX_DIR/synapse/homeserver.yaml"
        sed -i.bak "s/CHANGE_ME_TO_SECURE_SECRET/$mac_secret/1" "$MATRIX_DIR/synapse/homeserver.yaml"
        sed -i.bak "s/CHANGE_ME_TO_SECURE_SECRET/$form_secret/1" "$MATRIX_DIR/synapse/homeserver.yaml"
        rm -f "$MATRIX_DIR/synapse/homeserver.yaml.bak"
    fi

    echo "  ✓ Synapse secrets generated"
}

# Main
echo ""

# Check if already initialized
if grep -q "GENERATE_ME" "$MATRIX_DIR/bridges/whatsapp/config.yaml" 2>/dev/null; then
    echo "Generating new tokens..."
    generate_tokens "whatsapp"
    generate_tokens "telegram"
    generate_tokens "instagram"
    generate_synapse_secrets

    echo ""
    echo "✅ Initialization complete!"
    echo ""
    echo "Next steps:"
    echo "1. Edit docker/matrix/.env with your settings"
    echo "2. Edit docker/matrix/bridges/telegram/config.yaml with your Telegram API credentials"
    echo "3. Run: cd docker/matrix && docker compose -f docker-compose.matrix.yml up -d"
else
    echo "⚠️  Tokens already generated. Delete and re-copy config files to regenerate."
fi
