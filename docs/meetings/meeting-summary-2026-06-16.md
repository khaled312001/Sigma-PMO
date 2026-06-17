# Sigma — Meeting digest (2026-06-16, 18:56 GMT+3)

Source: `transcript-2026-06-16-video.txt` (30:19, AR). The first ~15 min carry the
content; the later "ايوه" run is a transcription artifact on a quiet/one-sided passage.
Plus the WhatsApp voice note `transcript-2026-06-17-voicenote.txt` (LLM-Council question).

## 1. Hosting / where to launch (Ayham's main technical concern)
- Ayham is weighing **launching the platform from the UK (or US)** rather than the
  UAE/Middle East — he believes a UK/US launch gives stronger positioning. He has a
  UK company, **"Mod Max"**, and can register the platform as a UK legal entity (easy/fast).
- Khaled's current proposal = a **single VPS in Germany** (the German host), not cloud.
  Ayham understands this fits a startup with no clients yet; the natural next step is
  **AWS/Azure** (cloud, multi-region) which support every tier.
- Ayham's objection (he read it out, wants it answered **in writing**): a single German
  server is a **single point of failure** — no redundancy/failover like cloud that spans
  multiple data centres. He wants **data safety**: real-time replication to a secondary
  server, a **backup** in the worst case, and clarity on **cybersecurity** (port/IP
  monitoring, injection detection, 24/7 monitoring + reports).
- He wants an **extended offer with tiers — Option 1 / Option 2 / Option 3** — so that if he
  contracts a large company he can present graduated options. Pricing flexibility matters
  (paying out of pocket vs. a company covering income).
- Concrete figures mentioned: managed **cybersecurity ≈ $400–500/year** (acceptable if
  negotiated, annually). He wants the **shared-hosting vs VPS vs cloud** difference spelled out.
- The German host offers a **free trial (1–2 months)** to test first.
- Ayham's **brother-in-law is a CTO** and will review the technical offer.

## 2. First real test — the Horse & Camel Hospital project
- Ayham wants to **test the platform on his last consulting project**: a horse & camel
  hospital, **≈ AED/USD 65–70 million**, whose real problems they already know.
- He will send the **Critical Path + baseline + IFC drawings (from the start)**; the data
  arrives **within 1–2 days**, then they run the test.
- Direct tie-in: this exercises P6 schedule ingestion + IFC/BIM ingestion — exactly the
  Primavera + Autodesk integration paths.

## 3. Branding & marketing (Ayham / others — not engineering)
- Launch the platform under a **name different from the company name**.
- The marketing lead is preparing a plan for **UAE + KSA, starting with UAE** (per-market
  marketing; a UK launch would need a UK-specific plan).

## 4. Voice note (2026-06-17) — LLM Council
- Ayham asks whether the platform, when it **adjudicates/judges any information internally**,
  uses an **"LLM Council / Guild"** (several model passes deliberating to a consensus)
  rather than a single LLM call.

## Action items for Khaled (service-provider side)
- [ ] **Hosting architecture proposal — in writing**, with Option 1/2/3, redundancy +
      real-time backup, cybersecurity, shared-vs-VPS-vs-cloud, free-trial, UK/US launch path.
- [ ] **Be test-ready** for the hospital project: verify P6 Critical-Path/baseline + IFC
      ingestion end-to-end so the test runs the moment the data lands.
- [ ] **LLM Council** — decide/implement the multi-pass adjudication (voice-note ask).
- (Ayham/others) platform name, UK company (Mod Max), marketing plan.
