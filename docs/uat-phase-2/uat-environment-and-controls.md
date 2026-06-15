# UAT Environment, Roles, Evidence and Build Control

## 1. Environment Structure

| Component | UAT setting |
| --- | --- |
| Hosting | Sigma-controlled VPS or cloud host |
| Domain | `uat.<domain>` or project-specific subdomain |
| Backend | NestJS service on `127.0.0.1:3001` behind nginx |
| Frontend | Next.js service on `127.0.0.1:3000` behind nginx |
| Database | Project UAT database or schema controlled by Sigma |
| Storage | Project-specific storage folder under `/srv/sigma-pmo/storage/files` |
| Backups | Daily backup and restore drill before UAT closeout |
| Logs | systemd journal plus application request IDs |

Recommended isolation for sensitive client records:

- One UAT environment or database per selected project.
- One project storage folder per selected project.
- No cross-project user access unless approved by the Product Owner.
- No reuse of project data in demo/sample datasets without written approval.

## 2. User Roles and Permissions

| UAT role | Sigma role | Purpose |
| --- | --- | --- |
| Product Owner / UAT Lead | `sigma_admin` or `client` | Owner decisions, acceptance, settings and policy control |
| Technical Lead | `sigma_admin` | Deployment, ingestion support, defect correction, build release |
| Domain Reviewer | `sigma_reviewer`, `consultant`, or `client` | Review outputs and evidence without uncontrolled data changes |
| Contractor data provider | `contractor` | Upload schedule, BOQ and delivery data where approved |
| Limited project user | `subcontractor` | Activity-scoped progress input only where required |

## 3. Evidence Export Process

For each UAT test:

1. Record the build/version number.
2. Record the project key and input document list.
3. Run the relevant workflow or agent.
4. Capture execution ID, evidence link, source file hash and calculation reference.
5. Export or screenshot the output only if authorized by the Product Owner.
6. Store the result in `uat-acceptance-register.csv`.
7. If incorrect, create a defect in `defect-corrective-action-register.csv`.

## 4. Version and Build Control

| Item | Method |
| --- | --- |
| Build version | Git commit hash or release tag |
| Deployment record | `deploy/scripts/deploy.sh` output |
| Database changes | TypeORM migrations only; `DB_SYNCHRONIZE=false` in production |
| Evidence link | Execution ID, source file ID, stored file hash, or report path |
| Retest link | Defect ID plus target build/version |

Release label format:

```text
phase2-uat-YYYYMMDD-build-<short-git-sha>
```

## 5. Defect Management Process

1. Raise defect with test ID, module, expected result, actual result and evidence.
2. Classify severity as Critical, High, Medium or Low.
3. Assign technical owner.
4. Correct in a new build.
5. Redeploy to UAT.
6. Retest and record result.
7. Product Owner decides Pass, Conditional Pass, Fail, Blocked or Not Tested.

