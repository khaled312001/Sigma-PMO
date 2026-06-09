# ADR-0014 — Anthropic SDK integration

- **Status:** Accepted
- **Date:** 2026-06-09
- **Layer / Cycle:** Cross-cutting — first wired in C3 (Claude provider work),
  consumed by every later cycle that needs Claude (C5, C6, C9a, C10, C11)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance — owns the "who pays the API
  bill" answer, open question 6 in the 2026-06-08 post-meeting plan)
- **Related:** ADR-0006 (deterministic-first boundary), ADR-0010 (Persona
  system — this ADR is the wiring half of ADR-0010's Wave 2),
  ADR-0011 (Computer Use safety — uses this SDK binding under the 12 rules),
  ADR-0012 (Cross-Layer Bus — Claude calls are events on the bus)

## Context

ADR-0010 made the Persona a first-class, versioned canonical asset and shipped
the resolver that returns `{ systemPrompt, cacheBreakpointId, personaBusinessKey,
personaVersion }`. It deliberately stopped short of binding the actual SDK
call — Wave 1 returned the assembled prompt; Wave 2 wires it to Claude. This
ADR is that wiring half.

Today the codebase has a single `LlmService` at
`backend/src/modules/summary/llm.service.ts` that calls the Anthropic
`/v1/messages` endpoint via raw `fetch`, with a hard-coded one-liner system
prompt and a single environment-variable model id. There is no SDK binding, no
prompt caching, no per-persona model tier, no deterministic fallback path, no
mock seam for tests, and no audit trail of which `(persona businessKey,
version, model)` triple actually ran. Every cycle in the revised plan that
needs Claude (C3 persona resolution call, C5 SolutionProposer, C6 FIDIC letter
drafting, C9a monthly report author, C10 Revit clash analyst, C11 Computer Use
Demo Path) is blocked on this binding.

Section 4 of the 2026-06-08 post-meeting plan ("ربط Claude API + التكامل —
Claude Integration Architecture") settles the externally-facing decisions:

- **Section 4.1** — API Tier strategy (Tier 2 for the Pilot, Tier 3 on first
  real Computer Use Run, Tier 4 + ZDR at three active projects). Open question
  6 ("who pays the API bill") is **not** resolved by this ADR — the SDK
  binding is the same regardless of the answer; only the credential ownership
  differs.
- **Section 4.2** — The runtime resolution flow (Frontend opens page →
  `GET /personas/resolve` → backend returns prompt + `cache_breakpoint_id` →
  Claude is called with that prompt in `system` plus
  `cache_control: { type: 'ephemeral', ttl: '1h' }`). The resolver landed in
  ADR-0010 Wave 1; this ADR ships the Claude call that consumes it.
- **Section 4.3** — Honest scope of prompt caching. Caching pays where it
  pays (FIDIC adjudication batch, Planning Persona session, Clash batch),
  and does **not** pay for the monthly report (1-hour TTL, next call a month
  later — Batch API instead). This ADR encodes that split so the wrong
  caching strategy cannot be silently applied.
- **Section 4.6** — Fallback when Claude is unavailable. The deterministic
  six-rule audit, FIDIC mapping, and `composeGrounded()` summary path
  (ADR-0006) must continue to function with no Claude at all. This ADR makes
  "no `ANTHROPIC_API_KEY` set" a first-class, non-error state.

This ADR formalises a single Claude binding for the whole platform, behind a
service interface that every consumer module talks to. It is the architectural
counterpart of ADR-0011 (which locked the safety contract for Computer Use
**before** any integration code was written): this ADR locks the SDK contract
**before** any of C3–C11 starts writing Claude calls, so we never have N
half-different Claude clients scattered across modules.

This ADR is also a named, scoped reinforcement of the ADR-0006 boundary, not
a relaxation of it. Per-page Personas (ADR-0010) and this SDK binding apply
to **advisory** surfaces — drafts, summaries, proposals, the executive
summary's optional rewrite. The deterministic rule engine, FIDIC mapping,
ConfidenceScore, EvidenceChain, and `composeGrounded()` remain the authoritative
source of governance state and remain runnable with the SDK absent.

## Decision

Bind the platform to the official Anthropic TypeScript SDK
(`@anthropic-ai/sdk`) through a single canonical service,
`ClaudeService`, that every Claude consumer module talks to. Wave 2 of
ADR-0010 lands as five concrete decisions: a defaulted model id, a typed
environment-driven config, an explicit prompt-caching strategy keyed to where
caching actually pays, a deterministic mock used in every test path, and a
deterministic-fallback contract when the API key is absent.

### 1. Default model: `claude-sonnet-4-5`

Wave 2 ships with **`claude-sonnet-4-5`** as the default model id for every
persona that does not name a more specific tier in its `modelTier` column
(ADR-0010 §1). Concretely:

- **`claude-sonnet-4-5`** — default. Used by every persona that resolves to
  `modelTier = 'claude-sonnet'`. Active model id; full id
  `claude-sonnet-4-5-20250929`. Adaptive thinking supported; prompt caching
  supported.
- **`claude-haiku-4-5`** — used by personas tagged `modelTier = 'claude-haiku'`.
  Reserved in Wave 2 for letter classification, glossary lookup, and other
  short-prompt high-volume calls per section 4.5 of the plan
  ("Tier-routing: Haiku لتصنيف الخطابات").
- **`claude-opus-4-8`** — used by personas tagged `modelTier = 'claude-opus'`.
  Reserved in Wave 2 for FIDIC adjudication and the monthly report
  author per section 4.5 ("Opus 4.8 لـ FIDIC adjudication والتقرير الشهري
  فقط").

The `modelTier` column stores a **tier label**
(`claude-sonnet` / `claude-haiku` / `claude-opus`), not a specific model id,
per ADR-0010 §1's vendor-lock-in mitigation. The label → id resolution lives
in `ClaudeService.resolveModelId(tier)` and is the only place a concrete model
string appears. Swapping `claude-sonnet-4-5` to `claude-sonnet-4-6` (or later)
is a one-line change in that resolver plus a re-baselining of `count_tokens`,
**not** a migration touching every persona row.

**Upgrade path.** `claude-sonnet-4-5` is the chosen Wave 2 default because it
is the model we have already tuned the existing `LlmService` against, and a
4-5 → 4-6 move is a model-id swap plus prompt re-tuning, not a contract
change. The intent is to move the `claude-sonnet` tier label to
`claude-sonnet-4-6` after the C3 acceptance run, once we have a token-count
re-baseline against the new id and have re-verified the deterministic
fallback path still holds. That move is a follow-up commit under this ADR,
not a new ADR.

### 2. Env-var configuration (typed, defaulted, never-throws-at-boot)

Configuration is read from environment variables via the existing
`@nestjs/config` `ConfigService` and exposed as a typed `ClaudeConfig` object
on `config.getOrThrow<ClaudeConfig>('claude')`. The shape:

| Field | Env var | Default | Notes |
| --- | --- | --- | --- |
| `apiKey` | `ANTHROPIC_API_KEY` | `''` (empty) | Empty = SDK is disabled; deterministic fallback path runs. **Never throws at boot.** |
| `defaultModel` | `ANTHROPIC_DEFAULT_MODEL` | `claude-sonnet-4-5` | Used when a persona has no `modelTier`. |
| `haikuModel` | `ANTHROPIC_HAIKU_MODEL` | `claude-haiku-4-5` | The id the `claude-haiku` tier resolves to. |
| `opusModel` | `ANTHROPIC_OPUS_MODEL` | `claude-opus-4-8` | The id the `claude-opus` tier resolves to. |
| `maxTokens` | `ANTHROPIC_MAX_TOKENS` | `16000` | Per-call default; personas may override per-call. |
| `requestTimeoutMs` | `ANTHROPIC_REQUEST_TIMEOUT_MS` | `120000` | Hard ceiling on a single non-streaming call. |
| `cacheTtl` | `ANTHROPIC_CACHE_TTL` | `1h` | One of `5m` / `1h`. Per-call override allowed (section 3 below). |
| `enableBatchApi` | `ANTHROPIC_ENABLE_BATCH_API` | `false` | Wave 2 ships interactive only; Batch API lands with C9a (monthly report). The flag exists now so C9a is a config flip, not a code change. |

**Why this shape, and what it deliberately is not.** Three properties are
non-negotiable for this binding:

1. **Empty `apiKey` is a valid state, not an error.** The constructor reads
   config but does not validate the key. `isEnabled()` returns `false` when
   `apiKey.trim().length === 0` and every public method on `ClaudeService`
   short-circuits to the deterministic fallback (section 5). This matches
   the existing `LlmService` contract and is what makes ADR-0006's
   deterministic-first boundary enforceable at runtime.
2. **No vendor strings in business code.** `defaultModel`, `haikuModel`,
   `opusModel` are configuration, not constants in service files. Section 1's
   `claude-sonnet-4-5` upgrade path depends on this — moving to 4-6 is an env
   var change plus the tier resolver.
3. **Configuration is *typed*, not a string bag.** `ClaudeConfig` is declared
   alongside `LlmConfig` in `backend/src/config/configuration.ts` and is the
   only shape `ClaudeService` accepts. Consumers cannot read
   `process.env.ANTHROPIC_API_KEY` directly — that path is a lint failure.

The existing `LlmConfig` (which today holds `apiKey`, `provider`, `model`,
`maxTokens`) is **not** removed in Wave 2. It stays in place behind the
existing `LlmService` for the executive-summary rewrite path, and
`ClaudeService` is added as a new sibling reading from a separate `claude`
key. Wave 3 collapses the two: `LlmService` becomes a thin wrapper that
delegates to `ClaudeService`, and `LlmConfig` is removed. Splitting the
collapse out of Wave 2 keeps the SDK binding reviewable on its own and means
the executive summary path keeps working unchanged through the C3 cycle.

### 3. Prompt caching strategy — honest about where it pays

Per section 4.3 of the post-meeting plan, prompt caching is not a blanket
optimisation. The wrong caching strategy is not just wasteful — for the
monthly report it is **negative ROI** (cache write at 2× the base price, never
read, because the next call is a month later). This ADR encodes the split so
the wrong choice cannot be silently made.

`ClaudeService.call(...)` takes an explicit `cacheMode` parameter:

```ts
type CacheMode =
  | { mode: 'ephemeral'; ttl: '5m' | '1h' } // pre-warm + read; for batched persona use
  | { mode: 'none' };                       // no cache_control; for one-shot calls
```

The rules:

- **`ephemeral` is the default** for any call originating from a Persona
  resolver context (every C3–C8 call). The persona system prompt is rendered
  before the `cache_breakpoint_id`, and per-call payload (clash list, letter
  text, snapshot summary) is rendered **after** the breakpoint. This matches
  the section 4.2 flow exactly: the persona stays cached for the 1-hour TTL
  while a reviewer batches 10 FIDIC letters in a session.
- **`none` is mandatory** for the monthly report author path (C9a). Section
  4.3 is explicit: caching does not pay on a 1-hour TTL when the next call
  is a month away. The `MonthlyReportService` (lands in C9a) passes
  `cacheMode: { mode: 'none' }` and uses the Batch API for the 50% discount
  instead.
- **TTL choice.** `1h` is the default per section 4.3 (FIDIC Persona +
  reference book = 20–30k tokens, comfortably above the ~4096-token Opus
  minimum and ~2048-token Sonnet minimum cacheable prefix, so caching
  actually engages). The 2× write premium pays off in two reads on the same
  prefix; sessions like "reviewer processes 10 FIDIC letters" hit this
  trivially. `5m` is reserved for the executive summary rewrite path where
  the prefix is smaller and the use is one-shot.
- **Pre-warm.** `ClaudeService.preWarm(personaBusinessKey)` issues a
  `max_tokens: 0` call against the resolved persona prompt when the user
  first opens the page, so the first real call is a cache read, not a cache
  write. The pre-warm cost is one cache-write at the base input price; the
  saved latency on the user's first real call pays it back the first time
  the page is opened.
- **Verification.** Every call logs `cache_read_input_tokens` and
  `cache_creation_input_tokens` from `response.usage` to the call log
  alongside `(personaBusinessKey, personaVersion, model)`. ADR-0010 §6 made
  this metadata the basis for the prompt-drift audit; this ADR makes it the
  basis for the cache-hit-ratio measurement section 4.3 promised
  ("بعد C3 نقيس لكل Persona ونضبط الـ breakpoint").

What this ADR does **not** commit to: a target cache-hit ratio. Section 4.3
explicitly refused that commitment ("لن نلتزم برقم قبل القياس") and this ADR
follows. The 70–85% number in the section 4.5 economic model is a planning
assumption, not a contract.

### 4. Mock in tests — deterministic and SDK-shaped

Unit and integration tests **never** call the real Anthropic API. Two
mechanisms enforce this:

1. **A `ClaudeService` mock provider** lives at
   `backend/src/modules/claude/testing/claude.service.mock.ts` and is the
   default `ClaudeService` binding in any `Test.createTestingModule(...)`
   that imports `ClaudeModule`. The mock implements the same interface, but:
   - `call(...)` returns a deterministic, fixture-driven response shaped
     like a real SDK `Message` (so `response.content`, `response.usage`,
     `response.stop_reason` are all populated and assertable).
   - The fixture is keyed by `(personaBusinessKey, personaVersion,
     payloadHash)` so the same call always returns the same response —
     append-only versioning + deterministic mock = reproducible tests.
   - `usage.cache_read_input_tokens` and `usage.cache_creation_input_tokens`
     are populated from the fixture, so caching-logic tests have something
     to assert against.
2. **A boot-time guard.** When `NODE_ENV === 'test'`, the real
   `ClaudeService` constructor refuses to instantiate even if
   `ANTHROPIC_API_KEY` is set in the test environment by accident. The
   refusal is a thrown error, not a silent fallback, because in a test
   context a real API call is a leak, not a feature.

Test authors writing assertions against Claude behaviour assert against the
fixture file, not against a live model. New fixtures are added by recording
a single real call against the dev account (Tier 2, per section 4.1),
sanitising it, and committing it. Fixture rotation is a documented step in
the C3 cycle brief.

This is a stricter mock contract than the existing `LlmService` (which today
just no-ops to a deterministic fallback in tests). The stricter mock exists
because Wave 2 onward, Claude responses are *load-bearing* in the test
matrix — C5 SolutionProposer asserts on persona-version-stamped output, C6
asserts on the FIDIC letter structure, C9a asserts on monthly report
section composition. A no-op mock is no longer enough.

### 5. Deterministic fallback when API key is missing

Per section 4.6 of the post-meeting plan and the existing ADR-0006
boundary: **the platform never fails because Claude is unavailable.** This
ADR codifies that into the contract of every `ClaudeService` method:

- `isEnabled()` returns `false` when `apiKey` is empty. It is `true` when
  the key is present and trimming non-empty.
- Every public method on `ClaudeService` (`call`, `preWarm`, `countTokens`,
  `describe`) checks `isEnabled()` first. When disabled:
  - `call(...)` returns `null` (not a thrown error), and the caller falls
    back to its deterministic path.
  - `preWarm(...)` is a no-op.
  - `countTokens(...)` returns `null`, and callers that need a token
    estimate fall back to a deterministic byte-length heuristic
    documented in the C3 brief.
  - `describe()` returns `null` (matches existing `LlmService.describe()`
    contract).
- The deterministic fallback paths each consumer module already has:
  - Executive summary → `composeGrounded()` (ADR-0006, already shipped).
  - SolutionProposer (C5) → returns the deterministic ordered list with
    no Claude-shaped narration.
  - FIDIC letter generator (C6) → returns the deterministic template
    output with deadline-math values filled in and a clear "AI assistant
    unavailable — manual review required" banner.
  - Monthly report (C9a) → returns the deterministic section composition
    without the Persona-rewritten narrative paragraphs.
  - Clash analyst (C10) → returns the deterministic clash list with
    coordination requirements, no Claude-shaped 3-option proposals.

The fallback is not a silent degradation — every fallback path logs a
structured event to the call log with `reason: 'claude_disabled'` and (when
the call would have happened) the resolved persona triple. Two consequences:

1. **Local development.** A new contributor can clone the repo, leave
   `ANTHROPIC_API_KEY` unset, and have a working deterministic platform
   end-to-end. This is non-trivial — the existing `LlmService` already
   honours this, and Wave 2 extends it to the entire Claude surface.
2. **Production incident.** If the API key is revoked, rotated badly, or
   the Anthropic API is down (section 4.6 "Claude API down"), the platform
   degrades to deterministic mode for the duration of the incident,
   surfaces a banner to users, and continues serving the audit, FIDIC
   mapping, ConfidenceScore, and EvidenceChain. The deterministic-first
   guarantee of ADR-0006 is enforceable in production, not aspirational.

The fallback path is the platform's posture **by default** — the SDK
binding is the optional enhancement layer, not the load-bearing one. This is
the inverse of how most LLM integrations are wired, and it is deliberate.

## Reason · Risk · Replacement (per the ADR-0001 contract)

### Reason

Five reasons, in order of how much each one blocks downstream work:

1. **C3 is blocked on a single canonical Claude client.** ADR-0010 Wave 1
   resolved the persona; Wave 2 needs the call. Without this ADR, every C3
   PR is free to reach for `fetch` directly, and we end Wave 2 with the
   same one-off scattered Claude calls we have today.
2. **The cache strategy must be encoded, not documented.** Section 4.3 of
   the post-meeting plan was explicit that mis-applied caching is
   negative ROI for the monthly report. A typed `cacheMode` parameter on
   the only Claude call site makes that mis-application a compile error,
   not a runtime regret.
3. **Section 4.6 fallback must be the default.** ADR-0006 set the
   deterministic-first boundary; this ADR makes it cheap to honour. With
   `isEnabled()` short-circuiting every method, "the API key is unset" is
   one if-statement per service, not a tangle of try-catch.
4. **Tests must not call the real API.** Wave 2 onward Claude responses
   are load-bearing in C5/C6/C9a/C10 assertions. A boot-time guard plus a
   fixture-driven mock makes the test suite hermetic and reproducible —
   `(persona businessKey, version, payloadHash) → fixture` is the same
   audit equation ADR-0010 §1 uses for reproducing a six-month-old answer.
5. **The vendor strings live in one place.** `defaultModel`,
   `haikuModel`, `opusModel` in env-driven config plus tier→id resolution
   in one method means the `claude-sonnet-4-5` → `claude-sonnet-4-6` move
   (and the eventual move off Anthropic entirely, see Replacement below)
   does not require touching persona rows, service files, or tests.

### Risk

Three material risks. None block Wave 2; each has a named mitigation that
ships with this ADR.

*Risk 1 — Cost blow-up via mis-applied caching or wrong tier-routing.*
Section 4.5 of the post-meeting plan put the monthly cost-per-active-project
envelope at $150–$300 for medium use. The path to blowing that envelope is
not "Claude is expensive"; it is (a) calling Opus 4.8 from a path that
should have been Sonnet 4.5, or (b) writing a 1-hour cache for a one-shot
call. **Mitigation:** the `modelTier` column lives on the Persona, not on
the call site, and is reviewable per ADR-0010's append-only versioning;
`cacheMode` is a required parameter on `ClaudeService.call(...)` with no
default. Both decisions are visible in code review, not in a runtime
config file.

*Risk 2 — The mock drifts from real SDK shape.* Fixture-driven mocks rot;
the SDK changes a field, the mock keeps returning the old shape, tests
keep passing, production breaks. **Mitigation:** the fixture is shaped as
the SDK's `Anthropic.Message` type imported from
`@anthropic-ai/sdk`, not as an ad-hoc interface. A breaking type change
breaks the test compile, not a green test run. Fixture rotation (re-record
against the live API on the dev account) is in the C3 cycle brief as a
quarterly action.

*Risk 3 — The fallback path silently hides a real outage.* If a contributor
deploys with `ANTHROPIC_API_KEY` unset by accident, the platform will run
in deterministic mode without complaint. **Mitigation:** every fallback
emits a structured `reason: 'claude_disabled'` event with the persona
triple, and the `/healthz` endpoint reports
`{ claude: { enabled: boolean, lastRealCallAt: ISO8601 | null } }`. An ops
dashboard alert fires when `enabled: false` in production. Local dev
explicitly does not alert on this; it is the intended state there.

### Replacement path

Two replacement scenarios, both cheap because of the choices above.

**Replacing the model (within Anthropic — e.g. `claude-sonnet-4-5` →
`claude-sonnet-4-6`).** One env var change
(`ANTHROPIC_DEFAULT_MODEL=claude-sonnet-4-6`), one re-baselining of
`count_tokens` against the new id (per the Anthropic migration guide), one
test-suite re-record of the affected fixtures. No persona row changes, no
service-file changes, no schema migration.

**Replacing the vendor (e.g. moving the Sonnet tier to a non-Anthropic
provider).** Three steps, in order:

1. Add the new provider behind the existing `ClaudeService` interface —
   keep the interface, swap the implementation. Personas keep their
   `modelTier` labels untouched.
2. Re-tune each persona's prompt body for the new vendor's quirks via a
   normal admin edit. Each edit produces `version = N+1` of that persona,
   append-only (ADR-0010 §2). Past Claude calls remain reproducible
   against their pinned persona version.
3. Flip the `ClaudeService` provider binding in the `ClaudeModule`.

No schema migration, no loss of audit trail. The Persona table still
records exactly which `(businessKey, version, model)` ran for each historical
call; pre-migration calls remain reproducible against the old vendor's
saved fixture; post-migration calls run on the new one.

A third replacement scenario — **dropping the SDK in favour of raw HTTP**
— is explicitly *not* a path this ADR enables. The Anthropic SDK is a
hard dependency of Wave 2, and the existing raw-`fetch` call in
`LlmService` is being retired (Wave 3) precisely to remove that pattern.
If a future requirement forces raw HTTP (e.g. running on a runtime the SDK
does not support), that is a new ADR superseding this one.

## Consequences

- New module `ClaudeModule` at `backend/src/modules/claude/` with:
  - `claude.service.ts` — the canonical service. Reads
    `config.getOrThrow<ClaudeConfig>('claude')`, exposes
    `isEnabled`, `describe`, `resolveModelId(tier)`, `call(...)`,
    `preWarm(...)`, `countTokens(...)`.
  - `claude.module.ts` — the NestJS module file, exporting `ClaudeService`.
  - `testing/claude.service.mock.ts` — the fixture-driven mock.
  - `testing/fixtures/` — recorded `Anthropic.Message` fixtures, keyed
    by `(personaBusinessKey, personaVersion, payloadHash)`.
- New `ClaudeConfig` interface and `claude` key registered in
  `backend/src/config/configuration.ts` alongside the existing
  `LlmConfig` / `llm` key. `LlmConfig` is unchanged in Wave 2.
- New environment variables documented in the deployment runbook:
  `ANTHROPIC_API_KEY`, `ANTHROPIC_DEFAULT_MODEL`, `ANTHROPIC_HAIKU_MODEL`,
  `ANTHROPIC_OPUS_MODEL`, `ANTHROPIC_MAX_TOKENS`,
  `ANTHROPIC_REQUEST_TIMEOUT_MS`, `ANTHROPIC_CACHE_TTL`,
  `ANTHROPIC_ENABLE_BATCH_API`.
- New package dependency `@anthropic-ai/sdk` (latest, pinned to a major).
- The existing `LlmService` (`backend/src/modules/summary/llm.service.ts`)
  is untouched in Wave 2 — its raw-`fetch` Anthropic call remains in
  place behind the executive-summary rewrite path. Wave 3 collapses it
  into a delegating wrapper over `ClaudeService`; that collapse is out
  of scope here.
- `/healthz` gains a `claude` block:
  `{ enabled: boolean, defaultModel: string | null, lastRealCallAt: string | null }`.
- The call log (lands fully in C3 alongside this binding) records
  `(personaBusinessKey, personaVersion, model, cacheMode, ttl,
  cache_read_input_tokens, cache_creation_input_tokens, input_tokens,
  output_tokens, latencyMs, stop_reason, fallbackReason | null)` for every
  call site, real or fallback. This is the data backing the section 4.3
  measurement promise and ADR-0010 §6 prompt-drift audit.
- Unit tests cover: the `isEnabled` short-circuit on every public method;
  the boot-time `NODE_ENV === 'test'` guard rejecting a real key; the
  fixture-driven mock returning the expected `Message` shape for a known
  `(businessKey, version, payloadHash)`; the `cacheMode: 'none'` path
  emitting no `cache_control` block; the `cacheMode: 'ephemeral'` path
  emitting `cache_control: { type: 'ephemeral', ttl }`; `resolveModelId`
  returning the env-configured id per tier.
- Integration tests cover: end-to-end persona resolve → ClaudeService call
  → response → log entry, with the mock provider. End-to-end fallback
  when `apiKey` is empty, asserting the deterministic path runs and the
  fallback log entry is emitted with `reason: 'claude_disabled'`.
- `CHANGELOG.md` records the new module, the new env vars, the new
  dependency, the `/healthz` field, and the call-log schema additions
  under a Wave 2 (ADR-0014) heading.
- **Wave 2 ships the SDK binding, the cache strategy, the mock, and the
  fallback contract.** Wave 3 collapses `LlmService` into a wrapper over
  `ClaudeService` and removes `LlmConfig`. Neither is in scope here.
- This ADR reinforces the ADR-0006 deterministic-first boundary at the
  binding layer: a working platform with no Claude is the default
  posture, and the SDK binding is the optional enhancement on top. The
  six deterministic rules, the FIDIC mapping, the ConfidenceScore +
  EvidenceChain pipeline, and the executive summary's deterministic
  `composeGrounded()` path all remain authoritative.
