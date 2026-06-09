# ADR-0011 — Computer Use safety guardrails

- **Status:** Accepted (2026-06-09) — Al Ayham authorized the 12 guardrails under default thresholds: 5% per-session failure rate, 2 consecutive guarded rejections → automatic KILL_SWITCH, 4-hour session length cap, 60-second nonce TTL. Open question 6 from the 2026-06-08 post-meeting plan is closed at these values.
- **Date:** 2026-06-09
- **Layer / Cycle:** Layer 2 (Planning) primary, Layer 5 (Simulation) secondary — guardrails apply to every cycle that touches desktop automation, first wired in C11 (Demo Path)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance, acceptable failure rate), Syed Moinuddin (architecture — when re-engaged)

## Context

The 2026-06-08 working session expanded the platform vision so that Sigma "actually opens Primavera P6 (and, later, Revit) on a desktop and drives it as an Agent" in front of the client. The mechanism today for that is **Anthropic Computer Use**: a beta capability where a Claude model receives screenshots and emits `mouse`, `keyboard`, and `bash` tool calls against a live desktop.

This capability is powerful and dangerous in a specific, asymmetric way that justifies a standalone ADR:

- The Agent operates **inside a real Windows VM** that holds a P6 Pro install, an Oracle license token, BoQ spreadsheets, drawings, and — eventually — letters and contracts. A single bad tool call can corrupt project state, leak data to a non-allowlisted endpoint, or send a "File → Save As" to a path the operator never intended.
- P6 Pro on Windows supports COM and macros. An imported file is executable surface, not inert data.
- The plan separates **Author Path** (production: AI builds the schedule in Sigma's own model and exports PMXML via MPXJ) from **Demo Path** (presentation: Computer Use opens P6 and visually replays the result). This ADR governs the Demo Path and any future Author-inside-P6 R&D track (optional C13). The Author Path itself is not a Computer Use surface and is out of scope here.
- Computer Use as a product is in beta, ships behind a beta header, and changes with each Claude release. ADR-0006's deterministic-first boundary still holds: **the Agent never becomes the source of governance state.** It re-renders a deterministic artifact into a desktop UI.

The 12 rules in section 3.2 of the post-meeting plan, plus the can/can't matrix in section 4.4, are the result of cross-referencing Anthropic's Computer Use documentation, the project's own threat model (multi-tenant + contractual data), and standard sandboxing practice for executing semi-trusted code (gVisor / Firecracker). This ADR locks them as a contract **before** any integration code is written, so that the C11 cycle starts from a settled safety posture rather than retrofitting one after a demo failure.

This ADR is **vendor-agnostic by design.** It names Anthropic Computer Use as today's implementation, but the 12 rules are written so the same guardrails apply if Sigma later swaps the agent runtime (a competing model with screen access, a self-hosted browser-based agent, a desktop-RPA layer) without rewriting the safety contract.

## Decision

Any Computer Use integration shipped by Sigma — Demo Path, future Authoring, Revit automation, anything — MUST satisfy all 12 rules below. A capability that cannot meet a rule does not ship; it goes back to design.

The capability is gated behind `canTriggerComputerUse` (Sigma Admin only per the section 7 capability matrix). Approval gates inside a session are subject to step-up authentication separately from the session that triggered the run.

### The 12 rules

**1. Isolation — gVisor or Firecracker, not bare Docker.**

*Rationale.* Bare Docker is a packaging and resource-isolation tool, not a security boundary against code executing inside the container. P6 Pro supports COM and macros and accepts file imports as executable surface; a malformed PMXML or a contractor-supplied script could in principle break out of a Docker namespace. gVisor (user-space kernel) and Firecracker (microVM) interpose a real isolation boundary between the guest and the host kernel, at acceptable performance cost for a session that runs minutes to hours.

*What triggers a violation.* Shipping a Computer Use session that runs inside `docker run` without gVisor's `runsc` runtime or a Firecracker-backed microVM. Shipping a session that shares a kernel with another tenant's session. Reusing a container across two distinct project-job pairs.

**2. Read-only host filesystem; writes only to a scratch volume cleared at job end.**

*Rationale.* The host filesystem of the worker node holds Sigma backend binaries, licenses, and possibly other tenants' scratch space. The Agent should be unable to write anywhere except a per-job scratch volume that is created at job start, mounted into the guest as the only writable path, and destroyed when the job completes. Audit artifacts (signed manifests, screenshots) are exfiltrated to durable storage **before** the scratch volume is destroyed, not stored on it long-term.

*What triggers a violation.* The Agent successfully creates or modifies a file outside the declared scratch mount. The scratch volume persists past job completion. Two jobs share a scratch volume. The host filesystem is mounted read-write at all.

**3. Network egress allowlist of documented FQDNs only.**

*Rationale.* Computer Use sessions need to reach exactly: the Anthropic API (`api.anthropic.com`), the Sigma backend's job-status webhook, the Oracle licensing endpoint (`licensing.oracle.com`) for P6 activation, and — when Revit is added — `autodesk.com`. Every other outbound destination is a leak vector for FIDIC letters, BoQ pricing, drawings, or contract text. The allowlist is declared per-job-type in code, enforced at the container network policy layer (not application code), and audited via packet capture for 30 days.

*What triggers a violation.* A successful DNS resolution or TCP connection from inside a Computer Use container to any FQDN not on the declared allowlist for that job type. The allowlist being enforced only in application code (where the Agent could in principle bypass it). pcap retention falling below 30 days.

**4. No persistent network — outbound DNS allowlist enforced; inbound blocked.**

*Rationale.* Rule 3 governs *which* destinations are reachable; this rule governs *that* the connection is not a permanent tunnel. The container has no inbound listener exposed to the network, and outbound DNS is constrained to the same allowlist as outbound traffic. Together this means an exfiltration attempt cannot use DNS as a side channel (`<base64>.attacker.example`), and a compromised Agent cannot accept commands from a remote operator.

*What triggers a violation.* The container exposes any inbound port to a network reachable beyond the host's job-status webhook. DNS queries to the public resolver leak hostnames outside the allowlist. The container retains a network namespace after the job ends.

**5. Step-up auth at every approval gate — short-lived OTP, not session token.**

*Rationale.* The Agent will, inside a session, hit checkpoints that require a human to approve an irreversible action (a P6 file save, a letter draft for transmission, a baseline commit). It is unsafe to assume the approver's existing dashboard session is sufficient consent for that specific action: the session was opened minutes or hours earlier, possibly on a workstation now unattended. The approver re-authenticates at the moment of approval with a one-time code valid for ~60 seconds, bound to the specific action being approved.

*What triggers a violation.* An approval gate that accepts a session cookie without OTP re-entry. An OTP valid for longer than 5 minutes. An OTP reusable across two different gate hits. Approval logged without the OTP issuance + redemption pair captured in the audit trail.

**6. Nonce-verified tool calls — every action carries a server-side nonce that expires in 60 s.**

*Rationale.* Prompt injection inside a contractor-supplied file (a letter PDF, a BoQ comment cell) could try to forge a `request_human_approval` tool call to slip an action past the operator. The Sigma backend mints a per-action nonce, hands it to the Agent only inside a verified system message, and requires the nonce on every tool call that reaches an approval surface. A tool call without a current, unused nonce is rejected at the backend before any modal is shown to a human.

*What triggers a violation.* A tool call reaching the approval surface without a backend-verified nonce. A nonce being accepted more than once. A nonce that lives longer than 60 seconds from issuance. The Agent observing the nonce in a user-visible channel where an injected prompt could read it back.

**7. Live operator dashboard with one-click kill switch terminating the container.**

*Rationale.* The asymmetry of Computer Use is that the human reviewer is slower than the Agent. The mitigation is not to slow the Agent down, but to make stopping it instant and unconditional. A Sigma operator dashboard streams the live screenshot of every running session and exposes a single button that destroys the container, snapshots the scratch volume for forensics, and writes a `KILLED_BY_OPERATOR` entry to the audit manifest — without negotiating shutdown with the Agent.

*What triggers a violation.* A running Computer Use session not visible on the operator dashboard. A kill action taking longer than 5 seconds to actually destroy the container. A killed session whose scratch volume is destroyed before forensic snapshot. The kill action being conditional on the Agent acknowledging it.

**8. Signed audit manifest — every action signed by job key; key custody documented.**

*Rationale.* Every Computer Use session ends with a manifest enumerating: every screenshot taken, every tool call attempted, every tool result returned, every approval requested and its outcome, the model id and beta header, the persona slug and version, total tokens, and the SHA-256 of any file the Agent wrote. The manifest is signed by a per-job key derived from a custody-controlled root (HSM-backed in the target deployment; a documented sealed-envelope process is acceptable for early pilots). The client can verify the signature against Sigma's published public key — turning "what did the Agent do?" into a cryptographic question rather than a trust question.

*What triggers a violation.* A session that completes without a manifest. A manifest signed by a key whose custody chain is not documented in writing. A manifest missing any of the enumerated fields. A signing key shared across tenants or across calendar quarters without rotation. The public verification key not being reachable from a stable Sigma URL.

**9. Action diff before commit — agent proposes a P6 file diff; human approver previews the diff before write.**

*Rationale.* "Approve this save?" is not a meaningful question if the approver has not seen what is being saved. Before any write of a P6 file (PMXML, XER, or in-product save), the Agent produces a structured diff against the previous version of the file — added activities, changed durations, modified relationships, baseline changes — and the approval surface renders that diff for the human. The human approves the diff, not the act of saving. This rule also closes the rule-6 loophole where a forged tool call could request approval for action-A but execute action-B: the diff is the action.

*What triggers a violation.* A write-on-disk action approved without a diff render. A diff that summarises rather than enumerates the changes (e.g. "13 activities modified" without listing them). A discrepancy between the diff approved and the bytes written.

**10. Bounded session length — hard cap at 4 hours; longer jobs require explicit re-auth.**

*Rationale.* Sessions that run unbounded are sessions in which guardrail enforcement decays: operator attention wanders, the Agent accumulates token budget, drift between intent and action grows. A 4-hour hard cap matches the "AI compute time" the meeting estimated for a single P6 build segment, and forces a deliberate re-authentication checkpoint for anything longer. The cap is enforced at the container orchestrator (the session is killed at T+4h regardless of what the Agent is doing); the re-auth requirement is enforced at the backend.

*What triggers a violation.* A session that exceeds 4 hours of wall-clock without the container being terminated. A re-auth that reuses the original session's credentials. A session that resumes after re-auth into the same container rather than a fresh one.

**11. Read-only first run — every new persona/action template runs in read-only mode for 3 supervised runs before write.**

*Rationale.* A new persona (a freshly-drafted `planning.p6.expert` version, or a new action template added to the catalog) has not yet been observed against real desktop state. Before it is allowed to write, it runs three times in read-only mode (screenshots and `request_human_approval` allowed; `keyboard` and `mouse` and `bash` restricted to navigation), each supervised by a Sigma operator on the live dashboard. Only after three clean supervised runs does the persona/template earn write capability — and that grant is recorded in the audit trail with reviewer identity.

*What triggers a violation.* A persona or action template performing a write on its first three production runs. A "clean supervised run" recorded without an operator presence on the dashboard. The three-run requirement being waived by anyone other than Sigma Admin with written justification logged.

**12. Data residency declared per tenant; container region locked to declared residency.**

*Rationale.* Anthropic's Computer Use today runs against US-only API endpoints; this is a contractual disclosure obligation to UAE-based clients (sections 4.4 and 9 of the plan, open question 9). Separately from the disclosure: Sigma tenants will declare a data residency in their tenancy record, and the Computer Use container scheduler refuses to launch a container in a region that does not match the tenant's declared residency. The Anthropic endpoint region is documented per-tenant in the audit manifest so the client can verify it post-hoc.

*What triggers a violation.* A container scheduled in a region not matching the tenant's declared residency. A tenant onboarded to Computer Use without a declared residency. A change of declared residency that does not invalidate in-flight sessions. The Anthropic endpoint region absent from the signed audit manifest.

### What this ADR does NOT do

- It does NOT commit Sigma to using Anthropic Computer Use as the runtime. The 12 rules are written to apply to any future agent that drives a desktop on Sigma's behalf.
- It does NOT write any integration code, define the `request_human_approval` tool schema, or wire up the operator dashboard. Those are C11 work, gated on this ADR being accepted.
- It does NOT govern the Author Path (Sigma model → MPXJ → PMXML). The Author Path runs server-side without desktop automation and is covered by the ordinary append-only data contract.
- It does NOT decide the acceptable Computer Use **failure rate** (e.g. "4 of 5 Demo Path runs may fail before this is rejected"). That is open question 6 in the plan and gates the move from `Proposed` to `Accepted` on this ADR.
- It does NOT pre-approve Revit automation. When Revit is added, the same 12 rules apply, but the FQDN allowlist, persona, and action catalog are a separate cycle's work.

## Consequences

- C11 (Demo Path) starts from a settled safety posture: the 12 rules are the acceptance criteria for the cycle, not a retrofit after a demo failure.
- The capability `canTriggerComputerUse` (Sigma Admin only) is now a real capability in the matrix with a defined gate, not just a flag.
- Any cycle that wants to extend desktop automation (Revit, Author-inside-P6 R&D, AutoCAD viewer) inherits these 12 rules unchanged and is reviewed against them.
- Tooling investment becomes well-scoped: container runtime (gVisor or Firecracker), network policy enforcement, OTP service, nonce service, operator dashboard with kill switch, HSM or sealed-envelope signing key custody, pcap retention. Each is a line item against the C11 budget and pen-test scope (Annex 2).
- An attempt to ship a Computer Use feature that cannot satisfy one of the 12 rules is an ADR-level reversal of this decision, not an implementation shortcut.

## Reason · Risk · Replacement (per ADR-0001 contract)

- **Reason** — Al Ayham requested in the 2026-06-08 session that the platform open P6 (and later Revit) on a desktop as an Agent. That capability has an asymmetric blast radius and is in vendor beta. The 12 rules lock the safety contract before any integration code is written, so the C11 cycle proceeds from a fixed safety baseline rather than a moving one. Cited: plan sections 3.2 (the 12 rules table) and 4.4 (the can/can't matrix).
- **Risk** — Computer Use is an Anthropic beta. The product can change in ways that break a rule's enforcement mechanism (a new tool type, a changed beta header, a model that ignores the nonce convention). Mitigated by: each rule names *what triggers a violation* in terms of observable behavior, not vendor API surface, so a vendor change that breaks enforcement is itself a violation that halts shipping until the mechanism is re-implemented. Vendor stability is independently tracked in the risk register (R1, R3, R4).
- **Replacement path** — If Sigma decides to replace Claude Computer Use with another agent runtime (a self-hosted browser agent, a competing desktop-control model, a non-AI RPA layer), the 12 rules are reused unchanged; only the runtime adapter is rewritten. If Sigma decides desktop automation is not worth its safety overhead at all, this ADR is superseded by a new one and the Author Path (C10) continues to deliver real Primavera baselines via PMXML without any desktop automation surface — the production deliverable does not depend on Computer Use.
