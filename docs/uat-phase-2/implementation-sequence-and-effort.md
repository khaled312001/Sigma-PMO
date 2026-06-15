# Proposed Implementation Sequence and Technical Effort

## 1. Sequence

| Step | Activity | Owner | Output |
| --- | --- | --- | --- |
| 1 | Confirm server, domain and DNS | Product Owner / Server company | UAT domain points to server |
| 2 | Provision VPS | Technical Lead / Server company | Node, MariaDB, nginx, TLS and firewall ready |
| 3 | Deploy Sigma build | Technical Lead | Backend and frontend running |
| 4 | Create UAT accounts | Technical Lead | Product Owner and reviewer access |
| 5 | Verify backup and restore | Technical Lead | Restore drill evidence |
| 6 | Receive completed-project data | Product Owner | Controlled dataset and known outcomes |
| 7 | Configure project in Sigma | Technical Lead | Project key and input mapping complete |
| 8 | Run retrospective validation | Product Owner + Technical Lead | Retrospective report |
| 9 | Fix defects and retest | Technical Lead | Closed defect/retest records |
| 10 | Start live-project shadow pilot | Product Owner + Project team | Weekly shadow comparison |
| 11 | Complete domain reviews | Domain reviewers | Independent validation records |
| 12 | Issue Owner UAT decision | Product Owner | Acceptance certificate or limitations |

## 2. Estimated Technical Effort

| Workstream | Estimated effort |
| --- | --- |
| Server provisioning and deployment | 0.5 to 1 day |
| Secure env/config/accounts/backups | 0.5 day |
| Completed-project data mapping and ingestion | 1 to 3 days, depending on data quality |
| Retrospective validation support | 2 to 5 days |
| Defect correction and retesting | As discovered during UAT |
| Live pilot weekly support | 6 to 8 weekly cycles |
| Final evidence packaging and handover | 1 to 2 days |

## 3. Dependencies

- Server access or server company availability.
- Domain/DNS confirmation.
- Completed-project dataset from Product Owner.
- Known outcome record locked before Sigma execution.
- Domain reviewers identified for finance, planning, QS/BIM, claims, safety, authority and utility.
- Commercial and annual support scope agreed for ongoing UAT, fixes and platform development.

