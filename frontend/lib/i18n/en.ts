export const en: Dictionary = {
  brand: {
    name: 'Sigma PMO',
    tagline: 'Governance operating system',
  },
  nav: {
    operations: 'Operations',
    admin: 'Admin',
    overview: 'Overview',
    input: 'Input',
    review: 'Review',
    evidence: 'Evidence',
    approval: 'Approval',
    policy: 'Policy',
    users: 'Users',
    signIn: 'Sign in',
    signInWithKey: 'Sign in with API key',
    signOut: 'Sign out',
    account: 'Account details',
    help: 'Help',
    accountMenu: 'Account menu',
    openMenu: 'Open navigation menu',
    closeMenu: 'Close menu',
    project: 'Project',
    bootstrapMode: 'Bootstrap mode',
  },
  roles: {
    sigma_admin: 'Sigma Admin',
    sigma_reviewer: 'Sigma Reviewer',
    client: 'Client',
    consultant: 'Consultant',
    contractor: 'Contractor',
  },
  common: {
    loading: 'Loading…',
    loadingWorkspace: 'Loading workspace…',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    refresh: 'Refresh',
    backToOverview: 'Back to Overview',
    howItWorks: 'How it works',
    deterministic: 'deterministic',
    confidence: '{value}% confidence',
    severity: {
      critical: 'critical',
      warning: 'warning',
      info: 'info',
    },
  },
  auth: {
    title: 'Sign in to Sigma PMO',
    subtitle: 'Enter the email and password issued by your Sigma admin.',
    emailLabel: 'Email',
    emailPlaceholder: 'name@company.com',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••••',
    apiKeyLabel: 'API key',
    apiKeyPlaceholder: 'sk_…',
    show: 'Show',
    hide: 'Hide',
    submit: 'Sign in',
    verifying: 'Verifying…',
    keyRejected: 'Key rejected — please check it and try again.',
    loginFailed: 'Email or password incorrect.',
    welcome: 'Welcome, {name}',
    signedOut: 'Signed out',
    capsLock: 'Caps Lock is on',
    forgotPassword: 'Forgot password?',
    forgotPasswordHint: 'Ask your Sigma admin to reset it from the host CLI.',
    rememberMe: 'Keep me signed in',
    valueProp: {
      governance: 'Deterministic governance over portfolio data',
      evidence: 'Every alert traceable to its source row',
      fidic: 'FIDIC 2017 + PMI/PMBOK mapped decisions',
    },
    standards: {
      heading: 'Built on',
      fidic: 'FIDIC 2017',
      pmi: 'PMI / PMBOK',
      append: 'Append-only canonical model',
      sha: 'SHA-256 evidence',
    },
    keyHint: 'Your key is stored only in this browser. Sign out to clear it.',
    needHelp: 'No key yet? Ask your Sigma admin to issue one with the host CLI.',
    bootstrap: {
      title: 'Bootstrap mode',
      body: 'No users exist yet. Create the first admin from the backend host:',
      hint: 'Then return here with the printed API key.',
    },
  },
  gate: {
    signInTo: 'Sign in to view {surface}',
    signInGeneric: 'Sign in to Sigma PMO',
    signInBody: 'Sigma PMO data is gated by role. Sign in with the API key issued by your Sigma admin to see ingestion runs, alerts, decisions, and evidence.',
    roleNoAccess: 'Role does not have access to {surface}',
    roleHint: 'You are signed in as {role}. Ask your Sigma admin if you need a different role, or pick another surface from the sidebar.',
  },
  overview: {
    eyebrow: 'Overview',
    title: 'Welcome to Sigma PMO',
    description: 'Snapshot of the platform across all four standard surfaces (input · review · approval · evidence).',
    cards: {
      ingestionRuns: 'Ingestion runs',
      totalAlerts: 'Total alerts',
      critical: 'Critical',
      warnings: 'Warnings',
    },
    latestIngestion: 'Latest ingestion',
    latestIngestionHint: 'Most recent file ingested through the canonical pipeline.',
    latestSummary: 'Latest executive summary',
    noSummary: 'No summary yet.',
    goToReview: 'Go to Review',
  },
  input: {
    eyebrow: 'Input',
    title: 'Ingest schedule data',
    description: 'Upload a P6 (XER/PMXML), MS Project XML, Excel, or CSV file. Every byte is archived with its SHA-256 hash.',
  },
  review: {
    eyebrow: 'Review',
    title: 'Alerts & deviations',
    description: 'Run the deterministic rule engine, inspect the resulting alerts, and generate the weekly executive summary.',
    evaluate: 'Evaluate + Decide',
    weeklySummary: 'Weekly summary',
    filter: { all: 'All', critical: 'Critical', warning: 'Warning', info: 'Info' },
  },
  evidence: {
    eyebrow: 'Evidence',
    title: 'Trace any alert to its source',
    description: 'Every alert links to the canonical row that triggered it, the ingestion run + source file, and the original parsed payload (rawSource).',
    selectAlert: 'Select an alert',
    selectAlertHint: 'Pick from the list on the left to see its full evidence chain.',
    noAlerts: 'No alerts yet',
    noAlertsHint: 'Run the rule engine on the Review page first.',
    rationale: 'Rationale',
    sourceFile: 'source file',
    rawSnippets: 'Raw source snippets',
    structured: 'Structured',
    rawJson: 'Raw JSON',
    overallConfidence: 'Overall confidence',
    entityProject: 'Project',
    entityActivity: 'Activity',
    entityResource: 'Resource',
    entityAssignment: 'Assignment',
    entityReport: 'Report',
    entitySourceFile: 'Source file',
    entityIngestionRun: 'Ingestion run',
    metrics: {
      overall: 'Overall',
      completeness: 'Completeness',
      consistency: 'Consistency',
      source: 'Source',
    },
  },
  approval: {
    eyebrow: 'Approval',
    title: 'Approve · Reject · Acknowledge',
    description: 'Take action on governance decisions. Every action is appended to the audit trail with actor + timestamp.',
    approve: 'Approve',
    reject: 'Reject',
    acknowledge: 'Acknowledge',
    rejectConfirmTitle: 'Reject this decision?',
    rejectConfirmBody: 'Rejection is appended to the audit trail. You can still acknowledge or approve later.',
    noDecisions: 'No decisions yet',
    noDecisionsHint: 'Run Evaluate + Decide on the Review page first.',
    actionDone: 'Decision {action}d',
    actionFailed: 'Action failed',
    by: 'by',
  },
  admin: {
    policy: {
      eyebrow: 'Admin',
      title: 'Governance policy',
      description: 'Sigma proprietary policy lives here as a versioned JSON document. Every save creates a new version; prior versions remain auditable.',
      tabs: { structured: 'Structured', editor: 'Edit JSON' },
      sections: {
        accountability: 'Accountability matrix',
        accountabilityHint: 'Default responsible party per rule code.',
        fidic: 'FIDIC mapping',
        fidicHint: 'Contract clause, notice text, and deadline triggered by each rule code.',
        pmi: 'PMI / PMBOK mapping',
        pmiHint: 'Process group hint per rule code.',
        escalation: 'Escalation tiers',
        escalationHint: 'Tier + notify list per severity level.',
        intervention: 'Intervention library',
        interventionHint: 'Recommended next steps surfaced on every decision.',
      },
      labels: {
        ruleCode: 'Rule code',
        party: 'Party',
        clause: 'Clause',
        notice: 'Notice',
        deadlineDays: 'Deadline',
        ageDays: 'Age',
        level: 'Level',
        notify: 'Notify',
        days: 'd',
        noDeadline: 'No fixed deadline',
        editorLabel: 'Policy JSON',
        format: 'Format',
        save: 'Save new policy version',
        savedAt: 'saved {time}',
        version: 'v{n}',
        global: 'global',
        savingNew: 'Saving new version…',
        fixJsonFirst: 'Fix JSON first',
      },
    },
    users: {
      eyebrow: 'Admin',
      title: 'Users',
      description: 'Stakeholder accounts. Create through the host CLI; rotate or remove keys here.',
    },
    personas: {
      eyebrow: 'Admin',
      title: 'Personas',
      description: 'Versioned expert system prompts (ADR-0010). Each row is the current version for a slug; editing creates a new append-only version.',
      filterLabel: 'Layer',
      layers: {
        all: 'All',
        engineering: 'Engineering',
        planning: 'Planning',
        governance: 'Governance',
        reports: 'Reports',
        simulation: 'Simulation',
      },
      headers: {
        slug: 'Slug',
        title: 'Title',
        layer: 'Layer',
        version: 'Version',
        model: 'Model',
        authoredBy: 'Last authored by',
      },
      empty: {
        title: 'No personas yet',
        description: 'Seed files under backend/src/personas/*.md populate this list on first boot.',
      },
      modal: {
        title: 'Persona',
        slugLabel: 'Slug',
        layerLabel: 'Layer',
        versionLabel: 'Version',
        modelLabel: 'Model tier',
        tempLabel: 'Temperature',
        ownerLabel: 'Owned by',
        authoredByLabel: 'Last authored by',
        descriptionLabel: 'Description',
        systemPromptLabel: 'System prompt',
        rulesLabel: 'Rules',
        noRules: 'No constraint rules attached.',
        close: 'Close',
        edit: 'Edit prompt',
        cancelEdit: 'Cancel',
        save: 'Save new version',
        saving: 'Saving new version…',
        savedToast: 'Persona saved',
        savedToastBody: 'New version {n} created.',
        saveFailed: 'Save failed',
        promptRequired: 'System prompt cannot be empty.',
        unchanged: 'No changes to save.',
        readOnlyHint: 'Read-only — only Sigma Admins can edit personas.',
        authoredByMissing: '—',
      },
      authoredByConsole: 'console',
    },
  },
  help: {
    eyebrow: 'Help',
    title: 'How Sigma PMO works',
  },
  account: {
    eyebrow: 'Account',
    title: 'Your account',
  },
  signOutDialog: {
    title: 'Sign out?',
    body: 'You will be returned to the sign-in page and your API key will be cleared from this browser.',
    confirm: 'Sign out',
  },
  projects: {
    eyebrow: 'Portfolio',
    title: 'Projects',
    description: 'Every project in scope, with its latest ingestion, alert load, and overall confidence at a glance.',
    open: 'Open',
    activities: 'Activities',
    alerts: 'Alerts',
    runs: 'Ingestion runs',
    lastIngested: 'Last ingested',
    never: '—',
    empty: { title: 'No projects yet', description: 'Once a file is ingested, projects appear here automatically.' },
    headers: { name: 'Project', key: 'Key', status: 'Status', alerts: 'Alerts', runs: 'Runs', confidence: 'Confidence', lastIngested: 'Last ingested' },
  },
  decisions: {
    eyebrow: 'Insights',
    title: 'Decisions archive',
    description: 'Every governance decision the engine has emitted — searchable and sortable across the full audit window.',
    search: 'Search by code, party, clause or rationale…',
    headers: { when: 'When', severity: 'Sev.', code: 'Rule', party: 'Party', clause: 'FIDIC clause', escalation: 'Level', status: 'Latest action' },
    statuses: { pending: 'pending', approve: 'approved', reject: 'rejected', acknowledge: 'acknowledged' },
    empty: { title: 'No decisions yet', description: 'Run Evaluate + Decide on the Review page to produce the first batch.' },
  },
  audit: {
    eyebrow: 'Compliance',
    title: 'Audit log',
    description: 'Append-only trail of every governance action taken on the platform — who did what, when, and against which decision.',
    search: 'Search audit entries…',
    headers: { when: 'When', actor: 'Actor', action: 'Action', severity: 'Sev.', code: 'Rule', party: 'Party', clause: 'FIDIC clause' },
    empty: { title: 'No audit entries yet', description: 'Approve, reject, or acknowledge a decision to write the first audit row.' },
    systemActor: 'system-import',
  },
  common2: {
    viewAll: 'View all',
    search: 'Search…',
    noResults: 'No results match the current filter.',
  },
  simulation: {
    eyebrow: 'Sandbox',
    title: 'What-if scenarios',
    description: 'Fork a sandbox copy of the current project, experiment freely, then discard or promote. Scenario mutations never reach canonical truth.',
    fork: 'Fork from current project',
    forking: 'Forking…',
    forkDialogTitle: 'Fork a new scenario',
    forkDialogBody: 'A sandbox branch will be created from the current project. Rules re-evaluate against the snapshot but nothing reaches canonical until you promote it.',
    forkDialogCreate: 'Create scenario',
    forkPlaceholder: 'e.g. Accelerate Tower B by 14 days',
    summaryPlaceholder: 'What are we testing? (optional)',
    nameLabel: 'Scenario name',
    summaryLabel: 'Brief what-if description',
    forkCreated: 'Scenario forked',
    forkFailed: 'Could not fork scenario',
    sandboxBadge: 'Simulated — not actual',
    forkedAt: 'Forked',
    expiresAt: 'Expires',
    expired: 'Expired',
    author: 'Author',
    discard: 'Discard',
    discardConfirmTitle: 'Discard this scenario?',
    discardConfirmBody: 'The sandbox branch will be marked discarded. Audit trail keeps the record, but it can no longer be promoted.',
    discardConfirm: 'Discard',
    discarded: 'Scenario discarded',
    discardFailed: 'Could not discard scenario',
    commit: 'Promote to canonical',
    commitDisabledHint: 'Promote-to-canonical lands in Cycle 5. Disabled in Wave 2.',
    listEmpty: 'No scenarios yet',
    listEmptyHint: 'Fork the current project to spin up your first what-if branch.',
    viewDiff: 'View baseline diff',
    hideDiff: 'Hide diff',
    diffTitle: 'Baseline snapshot vs current project',
    diffEmpty: 'Baseline snapshot is empty in Wave 1 — copy-on-write of activities + alerts lands in Cycle 5.',
    statuses: { open: 'open', committed: 'committed', discarded: 'discarded' },
    nameRequired: 'Name is required.',
    noProject: 'Select a project first to fork a scenario.',
    snapshotLabel: 'Baseline snapshot',
    currentLabel: 'Current project',
  },
  reportsMonthly: {
    eyebrow: 'Reports',
    title: 'Monthly narrative report',
    description: 'Generate the human-feel monthly report — three audiences (Owner / PD / Contractor) writing over the same deterministic facts, with citations against the curated SourceRegistry and a PDF on demand.',
    cannotGenerate: 'Your role can read reports but not generate them. Ask a Sigma Reviewer or Admin to author this month.',
    form: {
      title: 'Generate a new report',
      hint: 'Project {projectKey}. Each call inserts a new draft — earlier versions stay in the list below.',
      monthLabel: 'Month',
      audienceLabel: 'Audience',
      generate: 'Generate report',
      generating: 'Generating…',
    },
    audiences: {
      owner: 'Owner',
      pd: 'Project Director',
      contractor: 'Main Contractor',
    },
    source: {
      llm: 'LLM-authored',
      deterministic: 'Deterministic',
    },
    list: {
      title: 'Reports for this project',
      citationsCount: '{n} citations',
    },
    detail: {
      title: '{month} — {audience}',
      hint: 'Persona {persona}',
      narrativeHeading: 'Narrative',
      citationsHeading: 'Cited sources',
      noCitations: 'This draft did not cite any curated sources. The deterministic-facts path is shown above.',
    },
    metrics: {
      activities: 'Activities',
      alerts: 'Alerts',
      critical: 'Critical',
      decisions: 'Decisions',
      delta: 'Schedule delta',
    },
    pdf: {
      label: 'PDF',
      download: 'Download PDF',
      downloading: 'Preparing…',
    },
    empty: {
      title: 'No monthly reports yet',
      description: 'Pick a month + audience and generate the first one. Reports stay queryable forever.',
    },
    toast: {
      generatedTitle: 'Monthly report generated',
      generatedBody: '{month} · {audience} draft is ready below.',
      generateFailedTitle: 'Could not generate report',
      invalidMonthTitle: 'Pick a valid month',
      invalidMonthBody: 'Use the YYYY-MM format (e.g. 2026-05).',
      pdfFailedTitle: 'PDF download failed',
    },
  },
  summaryView: {
    sections: {
      schedule: 'Schedule status',
      alerts: 'Alerts',
      criticalFindings: 'Critical findings',
      reporting: 'Reporting',
      meta: 'Briefing',
    },
    labels: {
      project: 'Project',
      reportingPeriod: 'Reporting period',
      dataDate: 'Schedule data date',
      plannedDuration: 'Planned duration',
      activitiesTotal: 'Activities',
      completed: 'Completed',
      inProgress: 'In progress',
      notStarted: 'Not started',
      planned: 'Planned',
      actual: 'Actual',
      delta: 'Delta',
      total: 'Total',
      critical: 'Critical',
      warning: 'Warning',
      reportsInWindow: 'Reports in window',
      latestReport: 'Latest report',
      confidence: 'Data confidence',
      byRule: 'By rule',
    },
  },
};

export interface Dictionary {
  brand: { name: string; tagline: string };
  nav: {
    operations: string; admin: string;
    overview: string; input: string; review: string; evidence: string; approval: string;
    policy: string; users: string;
    signIn: string; signInWithKey: string; signOut: string;
    account: string; help: string;
    accountMenu: string; openMenu: string; closeMenu: string;
    project: string; bootstrapMode: string;
  };
  roles: { sigma_admin: string; sigma_reviewer: string; client: string; consultant: string; contractor: string };
  common: {
    loading: string; loadingWorkspace: string;
    save: string; cancel: string; confirm: string; refresh: string;
    backToOverview: string; howItWorks: string;
    deterministic: string; confidence: string;
    severity: { critical: string; warning: string; info: string };
  };
  auth: {
    title: string; subtitle: string;
    emailLabel: string; emailPlaceholder: string;
    passwordLabel: string; passwordPlaceholder: string;
    apiKeyLabel: string; apiKeyPlaceholder: string;
    show: string; hide: string;
    submit: string; verifying: string; keyRejected: string;
    loginFailed: string;
    welcome: string; signedOut: string;
    capsLock: string;
    forgotPassword: string; forgotPasswordHint: string;
    rememberMe: string;
    valueProp: { governance: string; evidence: string; fidic: string };
    bootstrap: { title: string; body: string; hint: string };
    standards: { heading: string; fidic: string; pmi: string; append: string; sha: string };
    keyHint: string;
    needHelp: string;
  };
  gate: {
    signInTo: string; signInGeneric: string; signInBody: string;
    roleNoAccess: string; roleHint: string;
  };
  overview: {
    eyebrow: string; title: string; description: string;
    cards: { ingestionRuns: string; totalAlerts: string; critical: string; warnings: string };
    latestIngestion: string; latestIngestionHint: string;
    latestSummary: string; noSummary: string; goToReview: string;
  };
  input: { eyebrow: string; title: string; description: string };
  review: {
    eyebrow: string; title: string; description: string;
    evaluate: string; weeklySummary: string;
    filter: { all: string; critical: string; warning: string; info: string };
  };
  evidence: {
    eyebrow: string; title: string; description: string;
    selectAlert: string; selectAlertHint: string;
    noAlerts: string; noAlertsHint: string;
    rationale: string; sourceFile: string; rawSnippets: string;
    structured: string; rawJson: string;
    overallConfidence: string;
    entityProject: string; entityActivity: string; entityResource: string;
    entityAssignment: string; entityReport: string; entitySourceFile: string;
    entityIngestionRun: string;
    metrics: { overall: string; completeness: string; consistency: string; source: string };
  };
  approval: {
    eyebrow: string; title: string; description: string;
    approve: string; reject: string; acknowledge: string;
    rejectConfirmTitle: string; rejectConfirmBody: string;
    noDecisions: string; noDecisionsHint: string;
    actionDone: string; actionFailed: string; by: string;
  };
  admin: {
    policy: {
      eyebrow: string; title: string; description: string;
      tabs: { structured: string; editor: string };
      sections: {
        accountability: string; accountabilityHint: string;
        fidic: string; fidicHint: string;
        pmi: string; pmiHint: string;
        escalation: string; escalationHint: string;
        intervention: string; interventionHint: string;
      };
      labels: {
        ruleCode: string; party: string; clause: string; notice: string;
        deadlineDays: string; ageDays: string; level: string; notify: string;
        days: string; noDeadline: string;
        editorLabel: string; format: string; save: string;
        savedAt: string; version: string; global: string;
        savingNew: string; fixJsonFirst: string;
      };
    };
    users:  { eyebrow: string; title: string; description: string };
    personas: {
      eyebrow: string; title: string; description: string;
      filterLabel: string;
      layers: { all: string; engineering: string; planning: string; governance: string; reports: string; simulation: string };
      headers: { slug: string; title: string; layer: string; version: string; model: string; authoredBy: string };
      empty: { title: string; description: string };
      modal: {
        title: string;
        slugLabel: string; layerLabel: string; versionLabel: string;
        modelLabel: string; tempLabel: string; ownerLabel: string; authoredByLabel: string;
        descriptionLabel: string; systemPromptLabel: string; rulesLabel: string;
        noRules: string;
        close: string; edit: string; cancelEdit: string;
        save: string; saving: string;
        savedToast: string; savedToastBody: string; saveFailed: string;
        promptRequired: string; unchanged: string;
        readOnlyHint: string; authoredByMissing: string;
      };
      authoredByConsole: string;
    };
  };
  help: { eyebrow: string; title: string };
  account: { eyebrow: string; title: string };
  signOutDialog: { title: string; body: string; confirm: string };
  projects: {
    eyebrow: string; title: string; description: string;
    open: string; activities: string; alerts: string; runs: string;
    lastIngested: string; never: string;
    empty: { title: string; description: string };
    headers: { name: string; key: string; status: string; alerts: string; runs: string; confidence: string; lastIngested: string };
  };
  decisions: {
    eyebrow: string; title: string; description: string;
    search: string;
    headers: { when: string; severity: string; code: string; party: string; clause: string; escalation: string; status: string };
    statuses: { pending: string; approve: string; reject: string; acknowledge: string };
    empty: { title: string; description: string };
  };
  audit: {
    eyebrow: string; title: string; description: string;
    search: string;
    headers: { when: string; actor: string; action: string; severity: string; code: string; party: string; clause: string };
    empty: { title: string; description: string };
    systemActor: string;
  };
  common2: {
    viewAll: string;
    search: string;
    noResults: string;
  };
  simulation: {
    eyebrow: string; title: string; description: string;
    fork: string; forking: string;
    forkDialogTitle: string; forkDialogBody: string; forkDialogCreate: string;
    forkPlaceholder: string; summaryPlaceholder: string;
    nameLabel: string; summaryLabel: string;
    forkCreated: string; forkFailed: string;
    sandboxBadge: string;
    forkedAt: string; expiresAt: string; expired: string;
    author: string;
    discard: string;
    discardConfirmTitle: string; discardConfirmBody: string; discardConfirm: string;
    discarded: string; discardFailed: string;
    commit: string; commitDisabledHint: string;
    listEmpty: string; listEmptyHint: string;
    viewDiff: string; hideDiff: string;
    diffTitle: string; diffEmpty: string;
    statuses: { open: string; committed: string; discarded: string };
    nameRequired: string; noProject: string;
    snapshotLabel: string; currentLabel: string;
  };
  reportsMonthly: {
    eyebrow: string; title: string; description: string;
    cannotGenerate: string;
    form: {
      title: string; hint: string;
      monthLabel: string; audienceLabel: string;
      generate: string; generating: string;
    };
    audiences: { owner: string; pd: string; contractor: string };
    source: { llm: string; deterministic: string };
    list: { title: string; citationsCount: string };
    detail: {
      title: string; hint: string;
      narrativeHeading: string; citationsHeading: string; noCitations: string;
    };
    metrics: {
      activities: string; alerts: string; critical: string;
      decisions: string; delta: string;
    };
    pdf: { label: string; download: string; downloading: string };
    empty: { title: string; description: string };
    toast: {
      generatedTitle: string; generatedBody: string;
      generateFailedTitle: string;
      invalidMonthTitle: string; invalidMonthBody: string;
      pdfFailedTitle: string;
    };
  };
  summaryView: {
    sections: {
      schedule: string;
      alerts: string;
      criticalFindings: string;
      reporting: string;
      meta: string;
    };
    labels: {
      project: string;
      reportingPeriod: string;
      dataDate: string;
      plannedDuration: string;
      activitiesTotal: string;
      completed: string;
      inProgress: string;
      notStarted: string;
      planned: string;
      actual: string;
      delta: string;
      total: string;
      critical: string;
      warning: string;
      reportsInWindow: string;
      latestReport: string;
      confidence: string;
      byRule: string;
    };
  };
}
