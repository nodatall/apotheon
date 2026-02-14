# E2E Traceability Matrix

| User Story | FRs | Scenario IDs | Spec Files |
|---|---|---|---|
| US-1 Wallet add | FR-3, FR-4 | E2E-WALLET-ADD-001 | `e2e/specs/wallet-onboarding.spec.ts` |
| US-2 Universe scan | FR-6, FR-7, FR-10 | E2E-UNIVERSE-SCAN-001, E2E-UNIVERSE-SCAN-002 | `e2e/specs/universe-refresh.spec.ts` |
| US-3 Custom chain | FR-2 | E2E-CHAIN-CUSTOM-001 | `e2e/specs/navigation-health.spec.ts` |
| US-4 Manual token | FR-11 | E2E-TOKEN-MANUAL-001 | `e2e/specs/manual-token.spec.ts` |
| US-5 Protocol mappings | FR-12, FR-13 | E2E-PROTOCOL-ABI-001, E2E-PROTOCOL-ABI-002 | `e2e/specs/protocol-contracts.spec.ts` |
| US-6 Daily history | FR-14, FR-16 | E2E-SNAPSHOT-HISTORY-001 | `e2e/specs/snapshot-history.spec.ts` |
| US-7 Unknown valuation | FR-15 | E2E-VALUATION-UNKNOWN-001 | `e2e/specs/snapshot-history.spec.ts` |
| US-8 Required pages + jobs | FR-17, FR-18 | E2E-NAV-HEALTH-001 | `e2e/specs/navigation-health.spec.ts` |
| US-9 CI deterministic gate | FR-19, FR-20, FR-24 | E2E-CI-GATE-001 | `.github/workflows/ci.yml` + `e2e/playwright.config.ts` |
| US-10 Live smoke | FR-25, FR-26 | E2E-LIVE-SMOKE-001 | `e2e/specs/live-smoke.spec.ts` + `scripts/run-live-smoke.sh` |
