# Sigma PMO — User guide

> One short guide per RBAC role. Each role sees only the surfaces it is
> permitted to use; the sidebar in the web console hides anything the role
> cannot perform.

The web console is at `http://app.<your-host>:3000` (or whatever URL nginx
maps in production). Sign-in is by API key issued via
`npm run user:create -- <email> <role> "<Name>"` on the backend host.

## Roles at a glance

| Role             | What it does in Sigma PMO                                   |
| ---------------- | ------------------------------------------------------------ |
| **Sigma Admin**  | Operates the platform. Full read + write incl. user lifecycle. |
| **Sigma Reviewer** | Internal Sigma reviewer. Can run rules, see all evidence, generate summaries; cannot edit policy or users. |
| **Client**       | Sigma's client representative. Reviews & approves, edits policy (Sigma proprietary content). |
| **Consultant**   | Supervising consultant. Uploads + reviews + approves; cannot edit policy. |
| **Contractor**   | Project contractor. Uploads data only. |

## Sigma Admin

You see every surface. Common tasks:

| Goal                                              | Where                                                |
| ------------------------------------------------- | ---------------------------------------------------- |
| Add a stakeholder account                          | CLI on backend host: `npm run user:create -- …`     |
| Rotate a user's API key                            | `POST /api/v1/auth/users/:id/rotate-key` (admin key) |
| Delete a stakeholder (sole-admin-safe)             | `DELETE /api/v1/auth/users/:id`                     |
| Edit governance policy                             | `/admin/policy`                                      |
| Inspect ingest audit trail                         | `/input` → Recent runs                               |
| Drill into any alert's evidence                    | `/evidence`                                          |

Sigma Admin is also the role to use for operations + restore drills.

## Sigma Reviewer

You can read everything Sigma generates and run analysis. You cannot
change policy or accounts.

| Goal                                              | Where                                                |
| ------------------------------------------------- | ---------------------------------------------------- |
| Run rule evaluation on the current snapshot       | `/review` → **Evaluate + Decide**                    |
| Inspect a deviation's source chain                | `/evidence` → pick an alert                          |
| Generate the weekly executive summary             | `/review` → **Weekly summary**                       |

## Client

You author the Sigma proprietary policy that the engine applies. Every save
creates a new versioned `GovernancePolicy` row that Sigma owns; the
Service Provider sees none of the content. See
[`docs/contract/assumptions/A10-sigma-proprietary-logic.md`](../contract/assumptions/A10-sigma-proprietary-logic.md).

| Goal                                              | Where                                                |
| ------------------------------------------------- | ---------------------------------------------------- |
| Edit the governance policy                        | `/admin/policy` — paste JSON, click **Save**         |
| Approve / reject governance decisions             | `/approval`                                          |
| Review alerts                                      | `/review`                                            |
| Inspect evidence                                   | `/evidence`                                          |

## Consultant

You supervise. You ingest data, review the resulting alerts, and act on
decisions.

| Goal                                              | Where                                                |
| ------------------------------------------------- | ---------------------------------------------------- |
| Upload a P6 / MS Project / Excel / CSV file       | `/input` → drag-and-drop or browse                   |
| Run rule evaluation                                | `/review` → **Evaluate + Decide**                    |
| Acknowledge / approve a decision                  | `/approval`                                          |
| Drill into evidence                                | `/evidence`                                          |

## Contractor

You provide source data. You see your project's input surface; everything
downstream is gated to other roles.

| Goal                                              | Where                                                |
| ------------------------------------------------- | ---------------------------------------------------- |
| Upload schedule data                              | `/input` → drag-and-drop                              |

## Common questions

**How do I switch project?** The project switcher pill in the top bar (left
of the page title) opens a list of projects you have access to. Your
selection persists across sessions.

**My role doesn't see a screen.** That is intentional — the sidebar hides
surfaces your role cannot operate. To check what your role grants, open
`/account`.

**Why does an action need confirmation?** Destructive actions (Sign out,
Reject a decision) ask for confirmation. Approval and acknowledgement do
not, since they are reversible (the next action overwrites the current
state on the audit trail).

**Why is everything in dark theme?** Default visual identity per
[`A12-branding.md`](../contract/assumptions/A12-branding.md). A light theme
toggle is a future re-scope item.
