# Live Smoke Operations

Run live smoke only (excluded from deterministic CI):

```bash
COINGECKO_API_KEY=<key> scripts/run-live-smoke.sh
```

## Output Contract

Each run writes:

- Playwright HTML report
- Playwright traces
- `summary.json` machine-readable run metadata
- Console log capture

under:

- `artifacts/live-smoke/<timestamp>/`

`summary.json` fields:

- `startedAt`
- `finishedAt`
- `exitCode`
- `reportDir`
- `traceDir`
- `logFile`
- `command`
