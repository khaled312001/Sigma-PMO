# Owner-Led UAT Plan

## 1. Purpose

Validate Sigma against real project records under Product Owner control. Phase 2
will prove whether Sigma can identify known completed-project outcomes and
detect live-project issues in shadow mode.

## 2. Governance Structure

| Role | Responsibility |
| --- | --- |
| Product Owner / UAT Lead | Select projects, control data access, define expected professional outcomes, review Sigma outputs, coordinate domain reviewers, approve or reject tests, issue final Owner UAT acceptance. |
| Technical Lead | Prepare secure UAT environment, configure selected projects, support ingestion and mapping, explain workflows, record build/execution evidence, investigate discrepancies, correct defects, release builds, rerun failed or conditional tests, maintain defect history. |
| Domain Reviewers | Validate financial, planning, QS/BIM, claims, safety, authority, utility, and governance results within their professional domain. |

## 3. UAT Streams

### Stream A: Completed-Project Retrospective Validation

The Product Owner selects one completed project and provides a controlled record
of known outcomes before Sigma is run.

Known outcomes should include:

- Actual completion date
- Actual delay causes and durations
- Critical events
- Final cost position
- Procurement issues
- Authority and utility delays
- Safety events
- Claims and variations
- Final project outcome

Sigma outputs will then be compared against these known outcomes.

### Stream B: Live-Project Shadow Pilot

After retrospective validation, Sigma runs on one live project for six to eight
weeks. Sigma will produce findings and recommendations without replacing the
authority of the project manager, consultant, client, or statutory reviewers.

Weekly comparison will cover:

- Sigma findings
- Project team findings
- Issues detected by both
- Issues detected only by Sigma
- Issues missed by Sigma
- False-positive alerts
- Alert lead time
- Recommended corrective actions
- Closure of corrective actions

## 4. Critical Acceptance Conditions

| Area | Acceptance condition |
| --- | --- |
| Financial engines | NPV, IRR, Payback, cash flow, DSCR and debt calculations match an independent financial model using identical assumptions. |
| Primavera and EVM | Activity counts, logic, baselines, progress, PV, EV, AC, SPI, CPI, EAC, ETC and VAC match approved reference calculations. |
| Schedule impact | Safety, fire, authority, utility and procurement events link to actual schedule activities and logic, including critical-path and completion-date impact. |
| BIM and QS | BIM and BOQ results are compared with an independent QS takeoff and show model coverage, unclassified elements, exclusions, assumptions, variance and confidence. |
| Claims and EOT | Potential claims demonstrate cause, event, affected activity, critical-path impact, notice/evidence and EOT or claim indicator. |
| Audit trail | Material governance decisions trace from decision to finding, agent, evidence and original source. Critical decisions target 100 percent traceability. |
| Alerts | Pilot measures correct alerts, false positives, missed events, lead time, escalation performance and corrective-action closure. |

## 5. Evidence Standard

Each test must capture:

- Build/version number
- Execution ID
- Input documents
- Expected result
- Actual result
- Calculation reference
- Evidence link
- Tester
- Domain reviewer
- Defect reference, if any
- Retest result
- Owner decision

## 6. Exit Criteria

Phase 2 can be accepted when:

- The completed-project validation report is approved or conditionally approved.
- The live-project shadow pilot report is approved or conditionally approved.
- Critical defects are closed or accepted as known limitations.
- Independent domain validation records are complete for applicable areas.
- Security, access, backup and evidence-export controls are verified.
- The Owner UAT Acceptance Certificate is signed.

