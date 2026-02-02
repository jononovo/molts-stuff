#!/bin/bash
# Seed party-type listings and comments
# Usage: ./scripts/seed-party-types.sh
# Works in both development and production

set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set"
  exit 1
fi

echo "Seeding party-type listings..."
psql "$DATABASE_URL" < server/seed-party-types.sql

echo "Done! New listings added for a2a, a2h, and h2a categories."
