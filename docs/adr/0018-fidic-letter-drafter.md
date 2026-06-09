# ADR-0018 — FIDIC Letter Drafter

- **Status:** Accepted
- **Date:** 2026-06-09
- **Layer / Cycle:** Layer 3 (Governance — FIDIC + PMI), first wired in C6 (Letter generator); consumed by C7 (Letter inbox / counterparty response loop) and C11 (Demo Path renders the approved letter on a desktop for client-facing replay)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance — Arabic-domain language, approval gate, FIDIC clause coverage)
- **Related:** ADR-0003 (canonical model & append-only traceability), ADR-0004 (rule engine v1), ADR-0005 (evidence & confidence), ADR-0007 (Layer 2 governance policy), ADR-0009 (vision alignment & extensibility), ADR-0010 (Persona system), ADR-0011 (Computer Use safety), ADR-0012 (Cross-Layer Bus Stage 1)

## Context

The 2026-06-08 working session with Al Ayham confirmed that the most contractually consequential output of the Governance layer (L3) is the **FIDIC letter** — extension-of-time notices, variation orders, instructions, claims, replies to engineer's determinations, suspension/resumption notices. These are the letters that move money and time on a real construction project under the FIDIC Red/Yellow/Silver Book families, and they are also the letters that the AI has the *strongest temptation* to get subtly wrong: a forged clause reference, an unsupported quantum, a date that does not survive the audit, a tone that concedes liability the contractor never meant to concede.

The post-meeting plan splits the letter problem into two flows:

1. **Inbound** — a letter from the Engineer or Employer arrives, Sigma classifies it (clause family, action required, deadline), routes it to the right reviewer, and tracks the response clock. This is C7 work and is out of scope here except as a downstream consumer of the canonical Letter entity.
2. **Outbound** — Sigma drafts a letter on the contractor's behalf, citing the project record (BoQ lines, Activity dates, Clash items from L1, Baseline changes from L2, prior correspondence), and presents it to a human for approval. **This ADR governs the outbound draft path.**

The outbound path has three properties that justify a standalone ADR rather than a section in the L3 governance ADR:

- **It writes text that a counterparty will read as the contractor's own position.** A summary view that misstates Sigma's internal data is an embarrassment; a FIDIC letter that misstates the contractor's position is a contractual exposure that survives the project. The drafting surface must be held to a stricter standard than any other surface Sigma ships.
- **It is the first surface where the LLM is asked to produce Arabic legal-register text against UAE-domain clause language.** ADR-0006 deliberately scoped the LLM to "summary and UI" — the FIDIC letter pulls the model into the contractual register for the first time. The constraints required to keep that safe are not a subset of the summary constraints.
- **It is the first surface that can, in principle, send something out of Sigma.** ADR-0011 already locks the safety contract for desktop automation (Computer Use). This ADR locks the equivalent contract for the letter pipe: drafting is in scope; transmission is not. The draft never leaves Sigma until a human carries it out by hand. The day Sigma wires a send button is a new ADR that supersedes this one.

The Arabic-domain question deserves its own paragraph. Al Ayham's review flow (per memory) is Arabic-first; the contractors and consultants on UAE projects correspond in Arabic and English in roughly equal measure, often with English clause references embedded in Arabic prose ("بموجب البند Sub-Clause 20.1 من العقد..."). The drafter must produce both registers, and must produce them with the correct **clause name in both languages** (the Arabic translation of FIDIC clause titles is not unique — there are at least three circulating renderings of Sub-Clause 8.4 in UAE practice), the correct **honorifics for the addressee** (Engineer vs. Employer's Representative vs. Project Manager are not interchangeable), and the correct **letter-class register** (a notice under 20.1 reads differently from a reply under 3.5; both read differently from a friendly transmittal).

Plan sections drawn on:

- **Section 3.5** — "FIDIC Letter Drafter — outbound flow" — the four-stage pipeline (assemble facts → draft → cite → human approve) and the explicit "draft-only" property.
- **Section 3.6** — "Letter inbox" — the inbound flow, out of scope here, but its `Letter` entity is shared.
- **Section 4.2** — "Citations as a first-class contract" — every quantum and every date in a draft letter carries an Evidence pointer; an uncited number is a hard reject before the draft reaches a human.
- **Section 4.4** — Computer Use Guardrails, which this ADR inherits when (and only when) a future cycle renders an approved letter on a real desktop for transmission rehearsal.
- **Section 7** — capability matrix; this ADR introduces `canDraftLetter` and `canApproveLetter` as distinct capabilities held by distinct roles.
- **Section 9 open question 5** — "Who is the legal signatory on an AI-drafted letter?" — this ADR does not answer that question; it makes the answer expressible by keeping `approvedBy` separate from `signedBy` in the entity.

## Decision

A FIDIC letter drafted by Sigma is a **draft document** until a human with `canApproveLetter` capability approves it inside Sigma. The drafter never transmits. Every factual claim in the draft carries a citation back to a canonical record. An unapproved draft has no contractual standing; an approved draft is exported as a signed PDF for a human to send by the channel of their choice (email client, courier, in-person hand-off).

The drafter MUST satisfy all eight rules below. A capability that cannot meet a rule does not ship; it goes back to design.

### The eight rules

**1. Draft-only — Sigma never auto-sends a letter.**

*Rationale.* The blast radius of a wrong-but-sent FIDIC letter is asymmetric: it cannot be unsent, it enters the contractual record on the date it arrives, and it can be quoted against the contractor in arbitration. There is no business case strong enough at Pilot scale to justify wiring a transmission surface into the AI drafter. The draft is rendered as a PDF (and the underlying structured JSON), placed in the project's letter folder, and waits for a human to download it and send it through the channel they choose. Sigma's outbox events (`governance.letter.draft.ready_for_approval`, `governance.letter.approved`) describe what the drafter did; none of them describe a transmission.

*What triggers a violation.* Any code path in the drafter that calls an outbound mail API, an SMTP server, a Microsoft Graph send endpoint, a courier integration, or any other channel that puts the letter in front of a counterparty without a human physically initiating the action. A "send for review to the Engineer" feature that bypasses the approval gate. Any UI affordance labeled "Send" that wires to a network call rather than to a "Download PDF + mark as sent" workflow.

**2. Mandatory citations — every factual claim links to canonical evidence.**

*Rationale.* A FIDIC letter is a statement of fact and a request for relief; both rest on the project record. ADR-0005 locks the Evidence + confidence contract; this rule extends it to the letter surface: every quantum (days, dirhams, percentages, quantities), every date (notice date, event date, deadline), every cited prior correspondence, and every cited clause **MUST** carry an Evidence pointer that resolves to a canonical record (Activity, BoqItem, ClashItem, Baseline snapshot, prior Letter, or Clause from the FIDIC clause registry). The draft renderer refuses to emit a paragraph that contains an uncited number or an uncited date.

*What triggers a violation.* A draft paragraph reaching the approval surface with an uncited factual claim. A citation pointing to a record that no longer exists or has been superseded without the draft being re-rendered against the current version. A citation list that summarizes ("supporting evidence: 12 BoQ lines") rather than enumerates with stable references. A "soft citation" mode that allows the model to assert a number without a backing record because "the user can fill it in later" — the user fills it in *before* the draft is rendered, not after.

**3. Human-approval gate — `canApproveLetter` capability, distinct from `canDraftLetter`.**

*Rationale.* The drafter (an AI persona under ADR-0010) creates the draft. A human with `canApproveLetter` reviews it and approves. These are different capabilities held by different roles: a planning engineer may draft, only a contracts manager or project director may approve. The approval surface presents the draft, the citations (rendered as resolvable links to the canonical records), the persona id + version that produced the draft, and a structured diff against the previous draft version if the letter has been revised. Approval is recorded with reviewer identity, timestamp, the approved draft's content-hash, and — per ADR-0011 rule 5 when the approver later uses Computer Use to render the letter — a step-up OTP. Without Computer Use in scope, plain session auth is sufficient at Pilot; the OTP requirement is dormant until C11 wires the desktop render path.

*What triggers a violation.* A draft transitioning to `APPROVED` without a `canApproveLetter`-holding user performing the action. The same user holding both capabilities for the same letter (separation of duties — drafter ≠ approver for any single letter, enforced at the service layer). An approval recorded without the content-hash of the exact bytes approved. An "auto-approve if confidence ≥ X" shortcut — there is no confidence threshold high enough to skip the human gate.

**4. Arabic-domain language — bilingual clause registry, locale-pinned persona, register awareness.**

*Rationale.* The drafter operates in UAE construction practice, where Arabic and English coexist within a single letter and where clause translation is not standardized across the industry. The drafter MUST consume a **bilingual FIDIC clause registry** (a canonical entity owned by L3, seeded from the FIDIC Red/Yellow/Silver Book editions in use on Sigma's pilots, with the Arabic rendering vetted by Al Ayham and version-stamped). It MUST run under a **locale-pinned Persona** (e.g. `fidic.red_book.expert.ar-AE`, `fidic.red_book.expert.en-AE`) — the same Persona is not allowed to switch locales mid-draft. It MUST be aware of **letter-class register**: a Sub-Clause 20.1 notice opens with the prescribed notice language; a Sub-Clause 3.5 reply opens with the prescribed reply language; a friendly transmittal opens differently again. The register is encoded as a template skeleton per letter class, populated by the Persona, not invented by the Persona.

*What triggers a violation.* A draft citing a FIDIC clause by an Arabic title not present in the bilingual clause registry. A Persona producing Arabic text under an `en-` slug or vice versa (locale leak). A Sub-Clause 20.1 notice that omits the prescribed notice opening or uses a transmittal register. An honorific mismatch (addressing the Engineer as the Employer's Representative, or vice versa) — caught by a deterministic post-render lint against the project's party registry. A clause translation drift between two letters in the same project — the registry is the single source of truth; the Persona may not paraphrase.

**5. Append-only Letter entity — every draft revision is a new row.**

*Rationale.* ADR-0003 locks append-only traceability for the canonical model; the Letter entity inherits this contract without exception. A "revise this draft" action does not mutate the existing draft row; it inserts a new row with the same `businessKey` (project + letter-class + sequence number) and an incremented `version`, marks the prior row `isCurrent = false`, and stamps `revisedFrom = <prior id>`. The approval record points at a specific `(businessKey, version)` pair — approving version 3 does not approve version 4, and reopening for further revision invalidates the approval for the new version.

*What triggers a violation.* A drafter code path that updates an existing Letter row's body, citations, or metadata in place. An approval that survives a subsequent revision (the new version inherits approval without a new human action). A rollup over Letters that groups by `id` rather than `businessKey` (the Feedback memory note applies — group by `businessKey`, never by `id`).

**6. Clause registry is governed, not inferred.**

*Rationale.* The bilingual FIDIC clause registry from rule 4 is a governance artifact, not a model output. It is seeded by hand from the FIDIC editions Sigma's pilots use, vetted by Al Ayham, and versioned. The drafter MUST resolve every clause citation through the registry — it MUST NOT generate a clause reference from the model's training data. If a project's contract uses a clause family or edition not present in the registry, the drafter refuses to draft a letter that cites that family and surfaces a `clause_registry_missing` alert to the project's L3 owner.

*What triggers a violation.* A draft containing a clause reference (Arabic or English) that does not resolve to a registry entry. The registry being editable by anyone other than a `canEditClauseRegistry`-holding user (Sigma Admin or Al Ayham, per the capability matrix). A registry entry being mutated in place rather than versioned. The drafter falling back to model-generated clause text when the registry lookup misses.

**7. Per-letter-class template skeletons — Persona populates slots, does not invent structure.**

*Rationale.* A FIDIC letter has a structure dictated by the clause it sits under: notice letters have a prescribed opening and a particulars block; replies have a prescribed acknowledgment and a determination block; claims have a prescribed quantum + particulars + reservation-of-rights block. Allowing the Persona to invent the structure is the failure mode where the letter "reads right" but is structurally non-conformant to the clause. The drafter holds a per-letter-class template skeleton (a structured object with named slots and the required opening/closing register), passes it to the Persona, and the Persona returns the populated slots — not free-form prose. The renderer assembles the final letter from the slots; an unfilled mandatory slot is a hard reject before approval.

*What triggers a violation.* A draft assembled from free-form Persona output without a template skeleton. A template skeleton that allows the Persona to omit a mandatory slot (notice date on a 20.1 notice, particulars on a claim, reservation-of-rights on either). A Persona response that adds slots not declared by the skeleton. A template skeleton edited inline by the drafter at request time rather than resolved from a versioned registry.

**8. Audit trail — persona id + version + prompt + model + citations + approver pinned to every approved letter.**

*Rationale.* "Who drafted this letter?" must have an answer that survives the project. Every approved Letter row carries: the `personaId` and `personaVersion` that produced the draft, the `promptHash` of the exact system + user messages sent to the model, the `modelId` + `modelVersion` returned by the API, the ordered list of citation refs (entity type + businessKey + version), the `approvedBy` user id, the `approvedAt` timestamp, the content-hash of the rendered PDF, and — per rule 5 — the prior version's id if this is a revision. This is the L3 analog of ADR-0011 rule 8 (signed audit manifest) without the desktop-automation surface; it does not require HSM-grade key custody at Pilot, but the schema is sized for that custody to be added without migration.

*What triggers a violation.* An approved Letter row missing any of the enumerated fields. A field populated with a placeholder ("draft" model id, "system" persona id) because the originating data was not captured at draft time. A content-hash that does not match the bytes of the exported PDF.

### Capability matrix additions

| Capability               | Holder                                                                   | Notes                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `canDraftLetter`         | Planning Engineer, Contracts Engineer, Project Director, Sigma Admin     | Triggers the drafter Persona; produces a draft Letter row in `PENDING_APPROVAL` state.                   |
| `canApproveLetter`       | Contracts Manager, Project Director, Sigma Admin                         | Approves a draft; separation of duties enforced — same user cannot approve a letter they drafted.        |
| `canEditClauseRegistry`  | Sigma Admin, Al Ayham                                                    | Adds or versions clause entries in the bilingual registry. Per-edit audit row.                           |
| `canExportApprovedLetter`| `canApproveLetter` holders + designated project legal contact            | Downloads the approved PDF for transmission by hand. Export is logged.                                   |

### Letter entity shape (reserved here, full migration in C6)

```
letters
-------
id                  UUID         (PK)
businessKey         varchar(80)  (NOT NULL)   -- e.g. 'P-2026-014/20.1/NOTICE/0007'
version             int          (NOT NULL)
isCurrent           bool         (NOT NULL)
projectId           FK → projects.id
direction           ENUM('INBOUND','OUTBOUND')
letterClass         varchar(40)  (NOT NULL)   -- e.g. 'sub_clause_20_1_notice'
clauseRefs          json         (NOT NULL)   -- ordered list of bilingual registry refs
locale              ENUM('ar-AE','en-AE','bilingual')
status              ENUM('DRAFTING','PENDING_APPROVAL','APPROVED','REVOKED','SUPERSEDED')
revisedFrom         FK → letters.id (nullable)
personaId           FK → personas.id (nullable for inbound)
personaVersion      int (nullable for inbound)
promptHash          char(64) (nullable for inbound)
modelId             varchar(80) (nullable for inbound)
modelVersion        varchar(80) (nullable for inbound)
citations           json         (NOT NULL for outbound, optional for inbound)
templateSkeletonId  FK → letter_templates.id (NOT NULL for outbound)
bodySlots           json         (NOT NULL for outbound)  -- the populated skeleton slots
renderedPdfHash     char(64) (nullable until APPROVED)
draftedBy           FK → users.id (nullable for inbound)
draftedAt           datetime(3)
approvedBy          FK → users.id (nullable)
approvedAt          datetime(3) (nullable)
signedBy            FK → users.id (nullable)        -- intentionally separate from approvedBy
signedAt            datetime(3) (nullable)          -- populated by the human export workflow
layer               Layer        (NOT NULL, constant 'GOVERNANCE')

PRIMARY KEY (id)
UNIQUE (businessKey, version)
INDEX (projectId, letterClass, status)
INDEX (status, draftedAt)
```

The `signedBy` / `signedAt` columns answer open question 5 from the plan ("who is the legal signatory on an AI-drafted letter?") by making the question expressible without prejudging it: at Pilot, `signedBy` is the human who exports and physically sends the letter; future ADRs may bind it to a digital signature surface, but this ADR does not.

### What this ADR does NOT do

- It does NOT wire a send button. Transmission is by human hand; any future transmission surface is a new ADR that supersedes rule 1 of this one.
- It does NOT govern the inbound letter flow (C7). The shared `Letter` entity has `direction = INBOUND` rows; the classification, deadline tracking, and routing of those rows is C7's design problem.
- It does NOT decide signatory authority. `signedBy` is captured; whose name belongs there on which letter class is a project-level governance configuration, not an ADR-level decision.
- It does NOT specify the model id, vendor, or prompt body. The Persona system (ADR-0010) owns those; this ADR only requires that whatever the Persona produced be pinned to the audit trail per rule 8.
- It does NOT define the bilingual clause registry's content. The schema is reserved here; the seed data is a C6 deliverable, reviewed by Al Ayham, and is versioned thereafter.
- It does NOT pre-approve PMI letter drafting. The PMI side (project charter, change request, lessons-learned) is structurally similar but uses a different clause registry and different letter-class skeletons; when added it inherits all eight rules unchanged but ships under a separate cycle.

## Consequences

- C6 (FIDIC letter generator) starts from a settled contract: the eight rules are the cycle's acceptance criteria. The Persona, clause registry, template skeletons, and audit-trail schema are all reserved here, so C6's design surface is the *implementation* of these contracts, not the negotiation of them.
- C7 (Letter inbox) can land in parallel with C6 against the same `letters` table — they share an entity, not a code path. Inbound classification produces rows with `direction = INBOUND` and a different (smaller) set of mandatory fields.
- C11 (Demo Path) gains a concrete artifact to render: the approved PDF of a FIDIC letter is a high-impact thing to replay on a desktop in front of a client. When C11 renders an approved letter, it inherits ADR-0011's twelve Computer Use rules without modification — this ADR does not relax any of them.
- The capability matrix gains four new capabilities (`canDraftLetter`, `canApproveLetter`, `canEditClauseRegistry`, `canExportApprovedLetter`) with explicit separation-of-duties between draft and approve.
- The bilingual FIDIC clause registry becomes a maintained governance artifact with a long lifetime — versioned, vetted, append-only. Maintaining it is a Sigma + Al Ayham responsibility, not a per-project responsibility.
- The Outbox event-type namespace reserved in ADR-0012 gains concrete producers: `governance.letter.draft.ready_for_approval`, `governance.letter.approved`, `governance.letter.revoked`, `governance.letter.superseded`. None of these events describe transmission, by design.
- An attempt to add an auto-send capability is an ADR-level reversal of rule 1, not an implementation shortcut. The same applies to weakening citations (rule 2), removing the approval gate (rule 3), or paraphrasing clauses outside the registry (rule 6).

## Reason · Risk · Replacement (per ADR-0001 contract)

- **Reason.** Al Ayham confirmed in the 2026-06-08 session that the FIDIC letter is the highest-stakes governance output Sigma will ship, and that the Arabic-domain register, clause translation, and human-approval discipline are non-negotiable. The plan's section 3.5 split the outbound flow into a four-stage pipeline (assemble facts → draft → cite → human approve) and explicitly characterized the drafter as draft-only. This ADR locks those properties as a contract before C6 writes any drafter code, so that the cycle delivers against a fixed safety baseline rather than negotiating one with the model's outputs.
- **Risk.**
  - *Persona drift across locales.* A Persona may, over revisions, drift in tone or register between `ar-AE` and `en-AE` siblings. Mitigated by: pinning the bilingual clause registry as the single source of truth for clause text, by structural template skeletons that the Persona populates rather than invents, and by a deterministic post-render lint (rule 4) that flags honorific and clause-name mismatches before approval.
  - *Clause registry gaps.* A pilot project may use a contract family not yet seeded in the registry. Mitigated by: the drafter refusing to draft a letter that cites an unregistered clause family, surfacing a `clause_registry_missing` alert instead of silently falling back to model-generated clause text. The registry gap becomes a Sigma + Al Ayham task to fill before that project's letters can ship.
  - *Approval fatigue.* A high-volume project (a portfolio job with dozens of letters per week) creates pressure to approve faster, eroding the human review. Mitigated by: separation of duties (drafter ≠ approver) and content-hash binding of the approval to specific bytes — a revised draft re-enters the queue, the previous approval does not carry forward. This rule is the same rule ADR-0011 applies to desktop actions: approval is bound to the artifact, not to the session.
  - *Citation rot.* A citation may point at a record that is later superseded (e.g. an Activity that was revised after the draft was assembled). Mitigated by: the draft re-renders against the current versions of cited records at approval time; if a citation's version has changed, the draft is bounced back to `DRAFTING` for the Persona to reconsider, with a `citation_version_drift` event on the Outbox.
  - *Arabic-English asymmetric quality.* The model's Arabic legal register may be weaker than its English at any given moment in the vendor's release cycle. Mitigated by: keeping the template skeletons and clause registry deterministic — the model's job is to fill structured slots in the chosen register, not to compose the legal scaffolding from scratch. The deterministic-first boundary from ADR-0006 still holds at the letter surface.
- **Replacement path.**
  - *Auto-send (post-Pilot).* If Sigma later decides to wire a transmission surface (e.g. an SMTP send for friendly transmittals only, never for notices or claims), a new ADR supersedes rule 1 with a narrowed scope, an inherited approval gate (rule 3 stays), and a new capability `canTransmitLetter` that is held by an even narrower set of roles. The Letter entity already carries `signedBy` / `signedAt` to express the transmission act.
  - *Vendor swap on the Persona.* If the underlying model changes (Anthropic version bump, vendor swap), the Persona is re-versioned under ADR-0010 and the bilingual clause registry + template skeletons are unaffected. The audit trail (rule 8) captures the model id + version so the swap is a known event in every letter's lineage, not an invisible one.
  - *Digital signature.* When (and only when) Sigma adopts a signing surface, `signedBy` + `signedAt` are bound to a signing identity (digital signature, qualified e-signature, in-product signature). The schema is sized for this without migration; the ADR that introduces the signing surface specifies the custody chain (the same way ADR-0011 rule 8 specifies it for desktop session manifests).
  - *PMI extension.* When Sigma adds PMI letter classes, the eight rules are reused unchanged against a PMI clause registry and PMI template skeletons. The cycle is separate; the contract is shared.

## Cite

- 2026-06-08 post-meeting plan, **section 3.5** — outbound FIDIC letter drafter, four-stage pipeline, draft-only property.
- Same plan, **section 3.6** — letter inbox, inbound flow (out of scope for this ADR but shares the Letter entity).
- Same plan, **section 4.2** — citations as a first-class contract.
- Same plan, **section 4.4** — Computer Use Guardrails, inherited unchanged when C11 renders an approved letter on a desktop.
- Same plan, **section 7** — capability matrix, source of `canDraftLetter` / `canApproveLetter` / `canEditClauseRegistry` / `canExportApprovedLetter`.
- Same plan, **section 9 question 5** — signatory question, expressible via `signedBy` / `signedAt` but not answered by this ADR.
- ADR-0003 — append-only canonical model (Letter inherits).
- ADR-0005 — Evidence + confidence (citation contract extended to the letter surface).
- ADR-0006 — deterministic-first boundary (template skeletons + clause registry are deterministic; Persona fills slots).
- ADR-0010 — Persona system (drafter Personas are versioned, locale-pinned instances).
- ADR-0011 — Computer Use safety (inherited when an approved letter is rendered on a desktop).
- ADR-0012 — Cross-Layer Bus Stage 1 (Outbox event-type namespace `governance.letter.*`).
