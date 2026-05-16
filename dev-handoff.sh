#!/bin/bash
# Run this after every git push to get Expo Go pointed at the latest code.

BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo ""
echo "=== Nyx Dev Handoff — branch: $BRANCH ==="
echo ""
echo "Run these commands in your Codespace terminal:"
echo ""
echo "────────────────────────────────────────────"
echo "git pull origin $BRANCH"
echo "  → Pulls the latest code so your running app matches what was just built."
echo ""
echo "./node_modules/@expo/ngrok-bin-linux-x64/ngrok authtoken <your-token>"
echo "  → Authenticates ngrok (required once per Codespace session — token is not persisted)."
echo ""
echo "npx expo start --tunnel"
echo "  → Starts Metro and opens a public tunnel so Expo Go can reach the dev server."
echo ""
echo "Then press 'r' in the Expo terminal to reload the app on your device."
echo "────────────────────────────────────────────"

# Warn if migration files changed in this push
CHANGED=$(git diff HEAD~1 HEAD --name-only 2>/dev/null | grep "supabase/migrations/" || true)
if [ -n "$CHANGED" ]; then
  echo ""
  echo "⚠️  Schema migration included — apply before testing:"
  echo "$CHANGED" | while read -r f; do
    echo "  Dashboard → SQL Editor → New query → paste $f → Run"
  done
fi

# Warn if edge functions changed
EDGE_CHANGED=$(git diff HEAD~1 HEAD --name-only 2>/dev/null | grep "supabase/functions/" || true)
if [ -n "$EDGE_CHANGED" ]; then
  echo ""
  echo "⚠️  Edge Function(s) updated — deploy before testing:"
  echo "$EDGE_CHANGED" | grep -o "supabase/functions/[^/]*" | sort -u | sed 's|supabase/functions/||' | while read -r fn; do
    echo "  supabase functions deploy $fn"
  done
fi

echo ""
