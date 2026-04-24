# Performance Guardrails

## Baseline workflow

1. Run `bun run perf:benchmark` and save output.
2. Run `bun run lint` and `bun run build` to validate production paths.
3. In app runtime, validate these user actions manually:
   - select thread
   - split vertical/horizontal
   - close/reopen terminal
   - high-output terminal session

## Thresholds

- `mapLookups` p95 should be at least 5x faster than `arrayFindLookups`.
- `serializeStore` p95 should stay stable (no regression > 20% vs previous baseline).
- `normalizeLayout` p95 should not regress by more than 15%.
- No dropped interactions visible during split/select flow under high terminal output.

## Regression policy

- Any benchmark regression above thresholds blocks merge until explained or fixed.
- If runtime fluency regresses, profile renderer and Electron main process before merging.
