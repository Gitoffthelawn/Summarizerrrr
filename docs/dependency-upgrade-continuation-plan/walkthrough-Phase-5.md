# Walkthrough - Phase 5: Security advisory triage

Phase 5 of `dependency-upgrade-continuation-plan.md` completed an approved
npm security-audit triage without applying `npm audit fix`, overrides,
downgrades, or dependency changes. The findings require separate, explicitly
approved remediation checkpoints.

## Audit Results

| Scope | Moderate | High | Critical | Total |
| --- | ---: | ---: | ---: | ---: |
| Full dependency graph | 7 | 8 | 3 | 18 |
| `--omit=dev` graph | 4 | 2 | 0 | 6 |

The 12 dev-only findings include all three critical advisories. Their path is
`wxt → web-ext-run → fx-runner → shell-quote`, with additional web-ext-run
dependencies including `tmp`, `node-notifier`, `uuid`, `node-forge`,
`minimatch`, and `brace-expansion`. npm reports no compatible automated fix
for WXT/web-ext-run.

The production-install graph contains `svelte-i18n → esbuild@0.19.12` and
`rehype-raw → hast-util-raw → mdast-util-to-hast@13.2.0`. The remaining
Vite, Rollup, and PostCSS findings are build-tool findings in the dev graph.
The proposed `svelte-i18n` fix is a major downgrade to `3.7.1`, so it was
rejected. No override was added because the upstream compatibility range and
affected behavior have not been separately verified.

## Changes Made

### 1. Security policy

#### `dependency-upgrade-continuation-plan.md`

- Followed the audit-only phase policy; no automatic or forced remediation was applied.
- Separated production-install findings from dev-only tooling findings and traced their direct paths with `npm explain`.

## Verification Results

### 1. Approved audit and dependency tracing

```sh
npm audit --json
npm audit --omit=dev --json
npm explain @wxt-dev/module-svelte wxt web-ext-run fx-runner shell-quote tmp node-notifier uuid svelte-i18n esbuild mdast-util-to-hast postcss rollup vite node-forge brace-expansion minimatch picomatch
```

Output:

```text
Full audit: 18 advisories (7 moderate, 8 high, 3 critical)
Production-only audit: 6 advisories (4 moderate, 2 high, 0 critical)
All critical findings trace to WXT's dev-only web-ext-run chain.
```

### 2. Final closeout

```sh
npm outdated --json
npm ls --depth=0
npm test
npm run check
npm run build
npm run build:firefox
git diff --check
git status --short
```

Output:

```text
npm outdated: only TypeScript 7.0.2 is newer; it remains intentionally deferred
npm test: 28 test files and 160 tests passed
npm run check: 0 errors and 21 existing warnings
npm run build: Chrome MV3 production build completed
npm run build:firefox: Firefox MV2 production build completed
git diff --check: no whitespace errors
```

## Remediation Decisions

- **WXT/web-ext-run chain:** defer until a compatible WXT release removes or upgrades the vulnerable transitive dependencies; npm has no automatic fix.
- **svelte-i18n/esbuild:** do not accept the audit-suggested major downgrade. Evaluate an upstream 4.x fix in a dedicated checkpoint.
- **rehype-raw/mdast-util-to-hast:** evaluate a direct upstream patch or a narrowly tested override in its own checkpoint.
- **Vite/Rollup/PostCSS:** treat as build-tool remediation; test each compatible WXT/Vite update in its own checkpoint.

## Verification Categories

### Completed Verification (Verified by Agent)

- [x] Full and production-only audit reports were run with user approval.
- [x] Every advisory family was traced to its root direct dependency or direct transitive chain.
- [x] No unsafe automated remediation, forced fix, or override was applied.
- [x] Direct dependency versions are current within declared ranges; TypeScript 7 is the sole intentional deferral.
- [x] Final automated closeout passes: 160/160 tests, zero check errors, and Chrome/Firefox builds.

### Required Future Decisions

- [ ] Approve a separate WXT/toolchain remediation checkpoint when a compatible upstream fix is available.
- [ ] Decide whether to investigate the `rehype-raw` transitive advisory with an upstream update or tested override.
- [ ] Decide whether to replace or wait for an updated `svelte-i18n` package rather than accepting the audit's downgrade.
