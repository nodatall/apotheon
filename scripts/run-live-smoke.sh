#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_ROOT="$ROOT_DIR/artifacts/live-smoke"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
RUN_DIR="$ARTIFACT_ROOT/$TIMESTAMP"
TRACE_DIR="$RUN_DIR/traces"
REPORT_DIR="$RUN_DIR/report"
LOG_FILE="$RUN_DIR/live-smoke.log"
SUMMARY_FILE="$RUN_DIR/summary.json"

if [[ -z "${COINGECKO_API_KEY:-}" ]]; then
  echo "COINGECKO_API_KEY is required for live smoke runs."
  exit 1
fi

mkdir -p "$TRACE_DIR" "$REPORT_DIR"

STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
set +e
PLAYWRIGHT_HTML_REPORT="$REPORT_DIR" \
npx playwright test --config "$ROOT_DIR/e2e/playwright.config.ts" --grep '@live' --output "$TRACE_DIR" >"$LOG_FILE" 2>&1
EXIT_CODE=$?
set -e
FINISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat >"$SUMMARY_FILE" <<JSON
{
  "startedAt": "$STARTED_AT",
  "finishedAt": "$FINISHED_AT",
  "exitCode": $EXIT_CODE,
  "reportDir": "$REPORT_DIR",
  "traceDir": "$TRACE_DIR",
  "logFile": "$LOG_FILE",
  "command": "npx playwright test --config $ROOT_DIR/e2e/playwright.config.ts --grep @live --output $TRACE_DIR"
}
JSON

echo "Live smoke artifacts: $RUN_DIR"
exit "$EXIT_CODE"
