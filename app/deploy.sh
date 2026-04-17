#!/usr/bin/env bash
set -euo pipefail

echo "=== Interview Platform — Production Deploy ==="
echo ""

if ! command -v docker &> /dev/null; then
    echo "[1/5] Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    echo "Docker installed. Log out and back in for group changes, then re-run this script."
    exit 0
else
    echo "[1/5] Docker already installed: $(docker --version)"
fi

if ! docker compose version &> /dev/null; then
    echo "ERROR: docker compose plugin not found. Install Docker Compose V2."
    exit 1
fi

echo "[2/5] Configuring firewall (UFW)..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 22/tcp
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw allow 7881/tcp
    sudo ufw allow 3478/udp
    sudo ufw allow 5349/tcp
    sudo ufw allow 50000:60000/udp
    sudo ufw --force enable
    echo "Firewall configured."
else
    echo "UFW not found, skipping firewall setup. Open ports manually:"
    echo "  80/tcp, 443/tcp, 7881/tcp, 3478/udp, 5349/tcp, 50000-60000/udp"
fi

echo "[3/5] Checking .env.prod..."
if [ ! -f .env.prod ]; then
    echo "ERROR: .env.prod not found in current directory."
    echo "Copy .env.prod template and fill in your values:"
    echo "  - DOMAIN, LIVEKIT_DOMAIN"
    echo "  - DUCKDNS_API_TOKEN"
    echo "  - POSTGRES_PASSWORD"
    echo "  - JWT_SECRET"
    exit 1
fi

source .env.prod

MISSING=""
[ -z "${DOMAIN:-}" ] && MISSING="$MISSING DOMAIN"
[ -z "${LIVEKIT_DOMAIN:-}" ] && MISSING="$MISSING LIVEKIT_DOMAIN"
[ -z "${DUCKDNS_API_TOKEN:-}" ] && MISSING="$MISSING DUCKDNS_API_TOKEN"
[ "${DUCKDNS_API_TOKEN:-}" = "your-duckdns-token-here" ] && MISSING="$MISSING DUCKDNS_API_TOKEN(still_placeholder)"
[ "${POSTGRES_PASSWORD:-}" = "CHANGE_ME_STRONG_PASSWORD" ] && MISSING="$MISSING POSTGRES_PASSWORD(still_placeholder)"
[ "${JWT_SECRET:-}" = "CHANGE_ME_RANDOM_STRING" ] && MISSING="$MISSING JWT_SECRET(still_placeholder)"

if [ -n "$MISSING" ]; then
    echo "ERROR: The following .env.prod values need to be set:$MISSING"
    exit 1
fi

echo "  Domain:  $DOMAIN"
echo "  LiveKit: $LIVEKIT_DOMAIN"

echo "[4/5] Injecting LiveKit secret into livekit.yaml..."
sed -i "s|CHANGE_ME_LIVEKIT_SECRET|${LIVEKIT_API_SECRET}|g" livekit.yaml

echo "[5/6] Building and starting services..."
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

echo "[6/6] Checking service status..."
sleep 5
docker compose -f docker-compose.prod.yml ps

echo ""
echo "=== Deploy complete ==="
echo ""
echo "Your app should be available at:"
echo "  https://$DOMAIN"
echo ""
echo "Useful commands:"
echo "  docker compose -f docker-compose.prod.yml logs -f          # all logs"
echo "  docker compose -f docker-compose.prod.yml logs -f backend  # backend logs"
echo "  docker compose -f docker-compose.prod.yml logs -f caddy    # caddy/TLS logs"
echo "  docker compose -f docker-compose.prod.yml down             # stop all"
echo "  docker compose -f docker-compose.prod.yml up -d --build    # rebuild & start"
