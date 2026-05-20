"""
Generates: Sigma_PMO_Contract_Package.pdf
Formal contract package: Service Agreement + NDA + Banking Details + Delay Penalty Clause.
Clean professional layout with light visual hierarchy.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    ListFlowable, ListItem, Table, TableStyle, KeepTogether
)
from reportlab.lib import colors

OUTPUT = r"e:\Sigma PMO\Sigma_PMO_Contract_Package.pdf"

# ---------- Palette (subtle, professional) ----------
NAVY     = colors.HexColor("#0E2A47")
DEEP     = colors.HexColor("#1A3D63")
SLATE    = colors.HexColor("#4A5A6E")
LINE     = colors.HexColor("#C7CEDB")
SOFT_BG  = colors.HexColor("#F4F6FA")
ACCENT   = colors.HexColor("#7A1F1F")  # used only for the penalty highlight
COVER_BG = colors.HexColor("#0E2A47")

styles = getSampleStyleSheet()

# ---------- Cover styles ----------
cover_eyebrow = ParagraphStyle(
    "CoverEyebrow", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=10, leading=12,
    textColor=colors.HexColor("#A9B4C5"), alignment=TA_CENTER, spaceAfter=10
)
cover_title = ParagraphStyle(
    "CoverTitle", parent=styles["Title"],
    fontName="Helvetica-Bold", fontSize=28, leading=34,
    textColor=colors.white, alignment=TA_CENTER, spaceAfter=8
)
cover_sub = ParagraphStyle(
    "CoverSub", parent=styles["Normal"],
    fontName="Helvetica", fontSize=14, leading=20,
    textColor=colors.HexColor("#D9DFEA"), alignment=TA_CENTER, spaceAfter=6
)
cover_meta = ParagraphStyle(
    "CoverMeta", parent=styles["Normal"],
    fontName="Helvetica", fontSize=11, leading=16,
    textColor=colors.white, alignment=TA_CENTER, spaceAfter=4
)
cover_meta_bold = ParagraphStyle(
    "CoverMetaBold", parent=cover_meta,
    fontName="Helvetica-Bold", fontSize=12, textColor=colors.white,
)

# ---------- Body styles ----------
part_title = ParagraphStyle(
    "PartTitle", parent=styles["Heading1"],
    fontName="Helvetica-Bold", fontSize=16, leading=22,
    textColor=NAVY, spaceBefore=0, spaceAfter=12,
    alignment=TA_LEFT, keepWithNext=1
)
part_eyebrow = ParagraphStyle(
    "PartEyebrow", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=9, leading=12,
    textColor=SLATE, alignment=TA_LEFT, spaceAfter=2,
    keepWithNext=1
)
h1 = ParagraphStyle(
    "H1", parent=styles["Heading1"],
    fontName="Helvetica-Bold", fontSize=12.5, leading=17,
    textColor=NAVY, spaceBefore=14, spaceAfter=6,
    keepWithNext=1
)
h2 = ParagraphStyle(
    "H2", parent=styles["Heading2"],
    fontName="Helvetica-Bold", fontSize=11, leading=15,
    textColor=DEEP, spaceBefore=8, spaceAfter=3,
    keepWithNext=1
)
body = ParagraphStyle(
    "Body", parent=styles["BodyText"],
    fontName="Helvetica", fontSize=10.5, leading=15,
    textColor=colors.black, alignment=TA_JUSTIFY, spaceAfter=6
)
bullet = ParagraphStyle(
    "Bullet", parent=body, leftIndent=14, bulletIndent=2, spaceAfter=2
)
sig_label = ParagraphStyle(
    "SigLabel", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=10.5, leading=14,
    textColor=NAVY, alignment=TA_LEFT
)
sig_text = ParagraphStyle(
    "SigText", parent=styles["Normal"],
    fontName="Helvetica", fontSize=10, leading=14,
    textColor=colors.black, alignment=TA_LEFT
)
sig_handwritten = ParagraphStyle(
    "SigHandwritten", parent=styles["Normal"],
    fontName="Times-BoldItalic", fontSize=18, leading=22,
    textColor=colors.HexColor("#0B2A56"), alignment=TA_LEFT
)
toc_item = ParagraphStyle(
    "TocItem", parent=styles["Normal"],
    fontName="Helvetica", fontSize=11, leading=18,
    textColor=colors.black, alignment=TA_LEFT
)
toc_section = ParagraphStyle(
    "TocSection", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=11.5, leading=18,
    textColor=NAVY, alignment=TA_LEFT
)

# ---------- Helpers ----------
def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(i, bullet), leftIndent=10, value="circle") for i in items],
        bulletType="bullet", start="circle", leftIndent=14
    )

def section_banner(eyebrow, title):
    """Numbered part banner — eyebrow above, title below, soft underline."""
    flow = []
    flow.append(Paragraph(eyebrow.upper(), part_eyebrow))
    flow.append(Paragraph(title, part_title))
    underline = Table([[""]], colWidths=[16.6 * cm], rowHeights=[0.6])
    underline.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, -1), 1.4, NAVY)]))
    flow.append(underline)
    flow.append(Spacer(1, 0.35 * cm))
    return flow

def callout_box(title, paragraphs, accent=NAVY, bg=SOFT_BG):
    """Soft callout box for important clauses (e.g., penalty)."""
    inner = []
    inner.append(Paragraph(f"<b>{title}</b>", ParagraphStyle(
        "CalloutTitle", parent=h2, textColor=accent, spaceBefore=0, spaceAfter=4
    )))
    for p in paragraphs:
        if isinstance(p, str):
            inner.append(Paragraph(p, body))
        else:
            inner.append(p)
    t = Table([[inner]], colWidths=[16.6 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LINEBEFORE", (0, 0), (0, -1), 3, accent),
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
    ]))
    return t

def signature_block(party_a_label, party_a_name, party_b_label, party_b_name):
    # Service Provider (right column) is pre-signed by Khaled Ahmed (date: 1 May 2026)
    signed_signature = Paragraph("<i>Khaled Ahmed</i>", sig_handwritten)
    data = [
        [Paragraph(f"<b>{party_a_label}</b>", sig_label),
         Paragraph(f"<b>{party_b_label}</b>", sig_label)],
        [Spacer(1, 1.4 * cm), signed_signature],
        [Paragraph(f"Name: {party_a_name}", sig_text),
         Paragraph(f"Name: {party_b_name}", sig_text)],
        [Paragraph("Title: __________________________", sig_text),
         Paragraph("Title: Independent Engineer / Consultant", sig_text)],
        [Paragraph("Signature: ______________________", sig_text),
         Paragraph("Signature: <i>Khaled Ahmed</i>", ParagraphStyle(
             "SigInline", parent=sig_text,
             fontName="Times-BoldItalic", fontSize=11,
             textColor=colors.HexColor("#0B2A56")))],
        [Paragraph("Date: __________________________", sig_text),
         Paragraph("Date: 1 May 2026", sig_text)],
    ]
    t = Table(data, colWidths=[8.3 * cm, 8.3 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEABOVE", (0, 0), (-1, 0), 0.6, NAVY),
    ]))
    return KeepTogether(t)

def fee_summary_table():
    headers = ["Layer", "Cycles", "Duration", "Total (USD)"]
    rows = [
        ["Layer 1 — Technical Governance Engine", "4", "8 weeks",  "2,000"],
        ["Layer 2 — Sigma Governance Intelligence Layer", "2", "4 weeks", "1,400"],
        ["Layer 3 — Full Commercial Platform Layer", "2", "4 weeks", "1,600"],
        ["Full Build Path", "8", "16 weeks", "5,000"],
    ]
    data = [headers] + rows
    t = Table(data, colWidths=[8.6 * cm, 1.8 * cm, 2.6 * cm, 3.6 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), SOFT_BG),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 1), (-1, -1), "CENTER"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, LINE),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, SOFT_BG]),
    ]))
    return t

def cycle_schedule_table():
    headers = ["#", "Cycle", "Days", "Fee (USD)", "Layer"]
    rows = [
        ["1", "Layer 1 — Cycle 1: Data Foundation",        "1–14",   "700", "Engine"],
        ["2", "Layer 1 — Cycle 2: Rule Engine v1",         "15–28",  "600", "Engine"],
        ["3", "Layer 1 — Cycle 3: Governance Layer",       "29–42",  "400", "Engine"],
        ["4", "Layer 1 — Cycle 4: Output & Handover",      "43–56",  "300", "Engine"],
        ["5", "Layer 2 — Cycle 5: FIDIC + PMI / PMBOK",    "57–70",  "700", "Intelligence"],
        ["6", "Layer 2 — Cycle 6: Sigma Proprietary Logic","71–84",  "700", "Intelligence"],
        ["7", "Layer 3 — Cycle 7: Platform Core + RBAC",   "85–98",  "800", "Commercial"],
        ["8", "Layer 3 — Cycle 8: Integrations + UI + Handover", "99–112", "800", "Commercial"],
        ["", "Total", "112 days", "5,000", ""],
    ]
    data = [headers] + rows
    t = Table(data, colWidths=[0.8 * cm, 7.6 * cm, 2.0 * cm, 2.4 * cm, 3.8 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (3, -1), "CENTER"),
        ("ALIGN", (4, 0), (4, -1), "CENTER"),
        ("ALIGN", (1, 0), (1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, LINE),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, SOFT_BG]),
        ("BACKGROUND", (0, -1), (-1, -1), NAVY),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    return t

# ---------- Page templates ----------
def cover_page(canvas, doc):
    canvas.saveState()
    # Full-page navy background
    canvas.setFillColor(COVER_BG)
    canvas.rect(0, 0, A4[0], A4[1], stroke=0, fill=1)
    # Thin gold accent strip
    canvas.setFillColor(colors.HexColor("#C9A961"))
    canvas.rect(0, A4[1] - 0.4 * cm, A4[0], 0.15 * cm, stroke=0, fill=1)
    canvas.restoreState()

def content_page(canvas, doc):
    canvas.saveState()
    # Top bar
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1] - 1.0 * cm, A4[0], 1.0 * cm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9.5)
    canvas.drawString(2 * cm, A4[1] - 0.65 * cm, "SIGMA PMO")
    canvas.setFont("Helvetica", 9)
    canvas.drawRightString(A4[0] - 2 * cm, A4[1] - 0.65 * cm, "Contract Package  ·  v1.0")

    # Bottom bar
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.4)
    canvas.line(2 * cm, 1.5 * cm, A4[0] - 2 * cm, 1.5 * cm)
    canvas.setFillColor(SLATE)
    canvas.setFont("Helvetica", 8.5)
    canvas.drawString(2 * cm, 1.05 * cm, "Khaled Ahmed  ·  khaledahmed.net  ·  Confidential")
    canvas.drawRightString(A4[0] - 2 * cm, 1.05 * cm, f"Page {doc.page}")
    canvas.restoreState()

# ---------- Document ----------
doc = SimpleDocTemplate(
    OUTPUT, pagesize=A4,
    leftMargin=2.2 * cm, rightMargin=2.2 * cm,
    topMargin=1.8 * cm, bottomMargin=2.0 * cm,
    title="Sigma PMO - Contract Package",
    author="Khaled Ahmed",
)

story = []

# ============================================================
# COVER PAGE
# ============================================================
story.append(Spacer(1, 5 * cm))
story.append(Paragraph("CONTRACT PACKAGE  ·  v1.0", cover_eyebrow))
story.append(Paragraph("Sigma PMO", cover_title))
story.append(Paragraph("Service Agreement &middot; Mutual NDA &middot; Banking Details", cover_sub))
story.append(Spacer(1, 4.5 * cm))

between_table = Table([
    [Paragraph("BETWEEN", ParagraphStyle("BetweenLabel", parent=cover_meta,
                                          fontName="Helvetica-Bold", fontSize=9,
                                          textColor=colors.HexColor("#A9B4C5")))],
    [Paragraph("<b>Sigma</b>", cover_meta_bold)],
    [Paragraph("represented by Al Ayham &mdash; the &ldquo;Client&rdquo;", cover_meta)],
    [Spacer(1, 0.4 * cm)],
    [Paragraph("AND", ParagraphStyle("AndLabel", parent=cover_meta,
                                      fontName="Helvetica-Bold", fontSize=9,
                                      textColor=colors.HexColor("#A9B4C5")))],
    [Paragraph("<b>Khaled Ahmed</b>", cover_meta_bold)],
    [Paragraph("Independent Engineer &mdash; the &ldquo;Service Provider&rdquo;", cover_meta)],
], colWidths=[16.6 * cm])
between_table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
story.append(between_table)

story.append(Spacer(1, 2.5 * cm))
story.append(Paragraph("Effective Date  ·  1 May 2026", cover_meta))
story.append(Paragraph("khaledahmed.net", cover_meta))
story.append(PageBreak())

# ============================================================
# TABLE OF CONTENTS
# ============================================================
story.extend(section_banner("Document Index", "Table of Contents"))
toc = [
    [Paragraph("Part A &mdash; Service Agreement", toc_section), Paragraph("3", toc_item)],
    [Paragraph("Part B &mdash; Mutual Non-Disclosure Agreement", toc_section), Paragraph("8", toc_item)],
    [Paragraph("Part C &mdash; Banking Details", toc_section), Paragraph("11", toc_item)],
    [Paragraph("Annex 1 &mdash; Cycle Plan &amp; Fee Schedule", toc_section), Paragraph("12", toc_item)],
    [Paragraph("Annex 2 &mdash; Re-scope Triggers by Layer", toc_section), Paragraph("14", toc_item)],
    [Paragraph("Annex 3 &mdash; Assumptions", toc_section), Paragraph("15", toc_item)],
]
toc_table = Table(toc, colWidths=[14.6 * cm, 2.0 * cm])
toc_table.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LINEBELOW", (0, 0), (-1, -1), 0.3, LINE),
    ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ("TOPPADDING", (0, 0), (-1, -1), 9),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
]))
story.append(toc_table)

story.append(Spacer(1, 0.8 * cm))
story.append(Paragraph(
    "This contract package is executed as a single integrated agreement. All Parts and Annexes are "
    "binding together upon signature.",
    body
))
story.append(Spacer(1, 0.3 * cm))
story.append(callout_box(
    "Headline Commercial Summary",
    [
        Paragraph(
            "<b>USD 5,000 total</b>  &middot;  <b>8 build cycles of 14 days</b>  &middot;  "
            "<b>16 weeks of build</b>  &middot;  three layers, full build path.",
            body),
        fee_summary_table()
    ],
    accent=NAVY, bg=SOFT_BG
))
story.append(PageBreak())

# ============================================================
# PART A — SERVICE AGREEMENT
# ============================================================
story.extend(section_banner("Part A", "Service Agreement"))

story.append(Paragraph("1. Parties", h1))
story.append(Paragraph(
    "This Service Agreement (the &ldquo;Agreement&rdquo;) is entered into between <b>Sigma</b>, "
    "represented by <b>Al Ayham</b> (the &ldquo;Client&rdquo;), and <b>Khaled Ahmed</b>, an "
    "independent engineer (the &ldquo;Service Provider&rdquo;), collectively the &ldquo;Parties&rdquo;.",
    body
))

story.append(Paragraph("2. Subject of the Agreement", h1))
story.append(Paragraph(
    "The Service Provider shall design, build, and deliver the <b>Sigma PMO</b>, an "
    "internal AI-assisted PM Office operating system, structured across three distinct layers and "
    "delivered through eight (8) consecutive 14-day build cycles, in accordance with the scope, "
    "deliverables, and acceptance gates set out in this Agreement and its Annexes.",
    body
))

story.append(Paragraph("3. Scope &mdash; Three-Layer Build Path", h1))

story.append(Paragraph("3.1 Layer 1 &mdash; Technical Governance Engine", h2))
story.append(Paragraph(
    "The structural core of the platform: ingestion pipelines (Primavera P6, Excel, CSV), canonical "
    "data model, rule engine, evidence chain, traceability, alerts, weekly executive summary, "
    "anomaly detection baseline, and governance scoring baseline. Delivered across 4 cycles.",
    body
))

story.append(Paragraph("3.2 Layer 2 &mdash; Sigma Governance Intelligence Layer", h2))
story.append(Paragraph(
    "The proprietary operating logic: FIDIC-linked governance logic, notice triggers, entitlement / "
    "claim logic, contractual causality mapping, delay ownership and responsibility attribution, "
    "PMI / PMBOK governance mapping, stage-gate logic, approval routing, escalation, intervention "
    "pathways, risk governance flow, Sigma proprietary governance logic, causality model, fault "
    "weighting, accountability balancing, intervention scoring, governance override, commercial "
    "behaviour logic, and decision causality weighting. Delivered across 2 cycles.",
    body
))

story.append(Paragraph("3.3 Layer 3 &mdash; Full Commercial Platform Layer", h2))
story.append(Paragraph(
    "The production-grade product layer: modular service architecture, environment separation, "
    "secrets management, scheduled backups, RBAC, admin and workflow controls, configurable "
    "governance logic, versioned API, selected system integrations (Primavera P6, Microsoft Project, "
    "email, Slack / Teams), commercial-grade UI / UX, hardening, scale plan, stress test, and "
    "enterprise deployment readiness. Delivered across 2 cycles.",
    body
))

story.append(Paragraph("4. Engagement Structure", h1))
story.append(bullets([
    "Total duration: <b>16 weeks</b>, structured as <b>8 consecutive build cycles of 14 days</b>.",
    "Each cycle has a defined scope, a defined fee, a working demo, and a written acceptance gate.",
    "The next cycle does not begin until the previous cycle is signed off in writing.",
    "Cycle deliverables and per-cycle fees are set out in <b>Annex 1</b>.",
]))

story.append(Paragraph("5. Commercial Structure", h1))
story.append(Paragraph(
    "The total commercial value of this Agreement is <b>USD 5,000 (Five Thousand United States "
    "Dollars)</b>, distributed across the eight cycles as set out in Annex 1. Cycle fees vary by the "
    "technical weight delivered in each cycle.",
    body
))
story.append(Spacer(1, 0.15 * cm))
story.append(fee_summary_table())

story.append(Paragraph("6. Payment Terms", h1))
story.append(Paragraph(
    "Cycle release, cycle start, and cycle payment are three separate, independently-actioned "
    "controls. None of them is an automatic consequence of the others. Each cycle&rsquo;s fee is "
    "split into a kickoff deposit and a completion payment, as set out below.",
    body
))

story.append(callout_box(
    "6.1  Cycle Payment is NOT Released as Full Upfront Salary",
    [
        "<b>Full cycle payment is not released at the start of the 14-day cycle.</b> Cycle payment "
        "is split per cycle and controlled by two separate triggers:",
        bullets([
            "<b>30% kickoff deposit</b> &mdash; released at <b>cycle release</b> (cycle start).",
            "<b>70% completion payment</b> &mdash; released only after <b>delivery and written acceptance</b> of that cycle.",
        ]),
        "This split applies to <b>Cycle 1 and all subsequent cycles</b> without exception. <b>No "
        "cycle is fully prepaid at cycle start.</b> The 70% portion is contingent on delivery and "
        "explicit written acceptance under Clause 10.1; until acceptance is issued, the 70% does "
        "not become due."
    ],
    accent=NAVY, bg=SOFT_BG
))

story.append(Paragraph("6.2 Operational Mechanics", h2))
story.append(bullets([
    "Each cycle&rsquo;s work begins only after both (a) the cycle has been <b>released in writing</b> by the Client (per Clause 10.2), and (b) the <b>30% kickoff deposit</b> has been received in the Service Provider&rsquo;s account.",
    "The <b>70% completion payment</b> is released only upon <b>written acceptance</b> of the cycle under Clause 10.1. No cycle is paid in full until written acceptance is issued.",
    "Cycle release, cycle start, and cycle payment remain three independently-actioned controls. The Client may release the next cycle, withhold release, or terminate at any cycle close (per Clause 13.3).",
    "Payments are made by bank transfer to the Service Provider&rsquo;s account set out in <b>Part C &mdash; Banking Details</b>.",
    "Bank charges on the Client&rsquo;s side are borne by the Client; intermediary or beneficiary bank charges are borne by the Service Provider.",
    "No retainer, no on-call fee, and no minimum commitment beyond the cycle currently in progress.",
]))

story.append(Paragraph("6.3 Per-Cycle Payment Schedule", h2))
story.append(Paragraph(
    "The 30% / 70% split applied to each cycle&rsquo;s fee is as follows:",
    body
))

split_data = [
    ["Cycle", "Cycle Fee (USD)", "30% Kickoff Deposit", "70% Completion Payment"],
    ["Cycle 1 — Layer 1",  "700",  "210", "490"],
    ["Cycle 2 — Layer 1",  "600",  "180", "420"],
    ["Cycle 3 — Layer 1",  "400",  "120", "280"],
    ["Cycle 4 — Layer 1",  "300",   "90", "210"],
    ["Cycle 5 — Layer 2",  "700",  "210", "490"],
    ["Cycle 6 — Layer 2",  "700",  "210", "490"],
    ["Cycle 7 — Layer 3",  "800",  "240", "560"],
    ["Cycle 8 — Layer 3",  "800",  "240", "560"],
    ["Total",            "5,000","1,500","3,500"],
]
split_t = Table(split_data, colWidths=[4.4 * cm, 3.2 * cm, 4.4 * cm, 4.6 * cm])
split_t.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9.5),
    ("ALIGN", (1, 0), (-1, -1), "CENTER"),
    ("ALIGN", (0, 0), (0, -1), "LEFT"),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("LINEBELOW", (0, 0), (-1, -1), 0.3, LINE),
    ("BOX", (0, 0), (-1, -1), 0.5, LINE),
    ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, SOFT_BG]),
    ("BACKGROUND", (0, -1), (-1, -1), NAVY),
    ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
]))
story.append(split_t)

story.append(PageBreak())

story.append(Paragraph("7. Intellectual Property &amp; Ownership", h1))
story.append(bullets([
    "Full source code ownership transfers to the Client at the close of every cycle, conditional on payment of that cycle.",
    "All platform logic, models, schemas, configurations, scripts, and assets built for the Client transfer to the Client.",
    "All Sigma governance logic &mdash; including FIDIC mapping, causality model, fault weighting, accountability balancing, intervention scoring, governance override, commercial behaviour logic, and decision causality weighting &mdash; is and remains the Client&rsquo;s proprietary intellectual property.",
    "The Service Provider shall not reuse, replicate, license, or adapt any Sigma proprietary governance logic in any other implementation, project, client engagement, product, or derivative work.",
    "The Service Provider retains the right to use generic, non-Sigma-specific engineering patterns and publicly available libraries.",
    "No retained dependency on the Service Provider for platform continuity. The system shall be fully operable, deployable, and modifiable by the Client without the Service Provider&rsquo;s involvement after handover.",
]))

story.append(Paragraph("8. Handover &amp; Dependency Control", h1))
story.append(bullets([
    "Source code is hosted in a Client-owned repository from Cycle 1, Day 1; the Service Provider&rsquo;s access is granted by the Client and may be revoked at any cycle close.",
    "Hosting is on Client-owned infrastructure (Hostinger, or as later agreed in writing); credentials remain Client-controlled at all times.",
    "Documentation, runbooks (operations, incident, backup, restore, monitoring), and reproducible deployment instructions are delivered cycle by cycle and finalised at the end of Layer 3.",
    "No hidden services, no hidden dependencies, no external lock-in. Every external dependency (library, third-party service, API) is documented with its purpose, license, version, and a documented replacement path.",
    "All credentials, API keys, and secrets generated during the engagement are handed over to the Client at the close of the relevant cycle.",
]))

story.append(Paragraph("9. Change Control &amp; Re-scope Discipline", h1))
story.append(bullets([
    "No price reopening, fee adjustment, or scope change shall occur except through a written re-scope event.",
    "A re-scope event may be triggered only by the conditions explicitly listed in the per-layer re-scope triggers (Annex 2).",
    "Each re-scope event produces a written variation note &mdash; revised cycle scope, revised cycle count, and revised cycle fee &mdash; signed by both Parties before any work begins on the changed scope.",
    "No silent scope expansion. No silent commercial drift.",
    "Verbal requests, chat messages, and email exchanges do not constitute a re-scope event unless formalised in a signed variation note.",
]))

story.append(Paragraph("10. Execution Control: Acceptance &amp; Cycle Release", h1))

story.append(Paragraph("10.1 Acceptance Gate", h2))
story.append(bullets([
    "Each cycle ends with a working demo on real or anonymised data and a written acceptance gate.",
    "Acceptance must be granted <b>explicitly in writing</b> by the Client. Silence does not constitute acceptance.",
    "The Client&rsquo;s review window is five (5) business days from the demo date.",
    "Within the review window, the Client shall issue either (a) written acceptance or (b) a written list of specific deficiencies.",
    "If neither written acceptance nor a written deficiency list is issued within the review window, the cycle <b>remains under review</b> until one of them is issued. <b>No cycle is deemed accepted by default.</b>",
]))

story.append(Paragraph("10.2 Cycle Release (Separate Control)", h2))
story.append(bullets([
    "Acceptance of a cycle does <b>not</b> automatically authorise the next cycle.",
    "The next cycle may begin only after <b>both</b> of the following have occurred: (a) the prior cycle has been explicitly accepted in writing, <b>and</b> (b) the next cycle has been explicitly released in writing by the Client.",
    "Cycle acceptance and cycle release are independent controls and must be actioned separately by the Client.",
    "Upon written cycle release, the 30% kickoff deposit becomes due (per Clause 6); cycle work begins once the deposit has been received.",
]))

story.append(Paragraph("10.3 Code &amp; Logic Review", h2))
story.append(Paragraph(
    "The Client may conduct code and logic review at the end of every cycle, with full read access "
    "to the repository, logic, and outputs.",
    body
))

story.append(Paragraph("10.4 Architecture Review Checkpoint", h2))
story.append(Paragraph(
    "A formal architecture review checkpoint is held after Layer 1 acceptance and before Layer 2 "
    "begins. Layer 2 Cycle 5 does not start until both the architecture review is closed in writing "
    "<b>and</b> Cycle 5 is explicitly released in writing by the Client.",
    body
))

story.append(PageBreak())

story.append(Paragraph("11. Delay Penalty Clause", h1))
story.append(Paragraph(
    "Delivery delay is governed by the following clause, which distinguishes between delay caused by "
    "<b>delivery failure</b> and delay caused by <b>client-side dependency or approved scope change</b>. "
    "Only delivery-side delay triggers a financial penalty.",
    body
))

story.append(Paragraph("11.1 Definitions", h2))
story.append(bullets([
    "<b>Cycle Duration:</b> 14 calendar days from the cycle start date.",
    "<b>Acceptance Gate:</b> the explicit written sign-off issued by the Client at the end of a cycle (no deemed acceptance applies).",
    "<b>Delivery-Side Delay:</b> a cycle that is not ready for demo by its agreed end date for reasons attributable to the Service Provider (engineering failure, capacity failure, missed scope).",
    "<b>Client-Side Delay:</b> any delay caused by missing inputs, blocked access, unresponsive review, unprovided sample data, unprovided credentials, or approved re-scope events.",
    "<b>Justified Delay:</b> a delay accepted in writing by the Client, or a delay caused by a force majeure event (illness with documented evidence, infrastructure outage outside the Service Provider&rsquo;s control, or similar).",
]))

story.append(Spacer(1, 0.15 * cm))
story.append(callout_box(
    "11.2  Penalty for Delivery-Side Delay",
    [
        "If a cycle is not ready for demo by its agreed end date due to <b>Delivery-Side Delay</b>, "
        "a penalty of <b>1.5% of that cycle&rsquo;s fee</b> applies for each business day of delay.",
        "The penalty is <b>capped at 15% of that cycle&rsquo;s fee</b>.",
        "Penalty amounts are deducted from the next cycle&rsquo;s payment, or refunded by the Service "
        "Provider within seven (7) business days if no further cycle follows.",
        "If Delivery-Side Delay on the same cycle exceeds <b>twenty (20) business days</b>, the "
        "Client may terminate the Agreement under Clause 13.2 with no further liability beyond "
        "cycles already delivered and accepted.",
    ],
    accent=ACCENT, bg=colors.HexColor("#FBF3F3")
))

story.append(Paragraph("11.3 Exclusions from Penalty", h2))
story.append(Paragraph(
    "No penalty under Clause 11.2 shall apply to delays that are wholly or materially caused by:",
    body
))
story.append(bullets([
    "Missing or late client-side inputs (sample data, business inputs, decisions).",
    "Blocked or unprovided access (repository, hosting, third-party systems, integrations).",
    "Unresponsive review (acceptance gate not actioned within the agreed five business days).",
    "Approved re-scope events under Clause 9.",
    "Force majeure events as defined in Clause 11.1.",
]))

story.append(Paragraph("11.4 Burden of Distinction", h2))
story.append(Paragraph(
    "Where a delay is part Delivery-Side and part Client-Side, the Parties shall determine the "
    "attributable share in writing within three (3) business days of the affected cycle&rsquo;s "
    "scheduled end date. The penalty applies only to the Delivery-Side share. Failing such written "
    "determination, the delay is treated as Justified Delay (no penalty).",
    body
))

story.append(PageBreak())

story.append(Paragraph("12. Confidentiality", h1))
story.append(Paragraph(
    "The Parties shall maintain mutual confidentiality of all information, materials, data, and "
    "logic exchanged in connection with this Agreement, in accordance with <b>Part B &mdash; Mutual "
    "Non-Disclosure Agreement</b>, which forms an integral part of this Agreement.",
    body
))

story.append(Paragraph("13. Termination", h1))
story.append(Paragraph("13.1 Termination at the End of a Phase", h2))
story.append(Paragraph(
    "Either Party may terminate this Agreement at the end of any layer (Layer 1, Layer 2, or Layer "
    "3) by providing written notice within five (5) business days of the layer&rsquo;s final "
    "acceptance gate. In such case, no further fees are due, and all deliverables of accepted cycles "
    "remain with the Client.",
    body
))
story.append(Paragraph("13.2 Termination for Cause", h2))
story.append(Paragraph(
    "Either Party may terminate this Agreement immediately for material breach (including, without "
    "limitation, non-payment of an accepted cycle, persistent Delivery-Side Delay exceeding the "
    "twenty-business-day threshold under Clause 11.2, or breach of confidentiality). Accepted "
    "cycles up to the date of termination remain payable; future cycles are cancelled.",
    body
))
story.append(Paragraph("13.3 Termination for Convenience (Client)", h2))
story.append(Paragraph(
    "The Client may terminate this Agreement at its sole discretion, without cause, at the close of "
    "any cycle, by providing written notice to the Service Provider. Upon such termination:",
    body
))
story.append(bullets([
    "Only accepted cycles remain payable (i.e., cycles for which written acceptance has been issued under Clause 10.1).",
    "All work completed up to the termination point shall be handed over to the Client &mdash; source code, documentation, runbooks, credentials, evidence, and any in-progress assets.",
    "No future cycle fees become due.",
    "<b>No penalty</b> applies to the Client for termination at cycle close.",
    "Any 30% kickoff deposit already received for a cycle that has not yet reached its acceptance gate is reconciled against work completed to date and refunded or retained <b>strictly on demonstrable completed work against the documented cycle scope at the date of termination</b>.",
]))

story.append(Paragraph("14. Liability", h1))
story.append(Paragraph(
    "The aggregate liability of the Service Provider under this Agreement, whether in contract, "
    "tort, or otherwise, is limited to the total fees paid by the Client under this Agreement at "
    "the date the liability arises. Neither Party is liable for indirect, consequential, or "
    "exemplary damages.",
    body
))

story.append(Paragraph("15. Governing Law &amp; Dispute Resolution", h1))
story.append(Paragraph(
    "This Agreement is governed by the laws of the jurisdiction agreed in writing by the Parties at "
    "signing. Any dispute arising out of or in connection with this Agreement shall first be the "
    "subject of good-faith negotiation between the Parties for a period of fifteen (15) business "
    "days, and, failing resolution, shall be referred to arbitration under rules to be agreed in "
    "writing at signing.",
    body
))

story.append(Paragraph("16. Entire Agreement", h1))
story.append(Paragraph(
    "This Agreement, together with its Annexes and the documents referenced herein (Mutual NDA, "
    "Banking Details, Cycle Plan, Re-scope Triggers, Assumptions), constitutes the entire agreement "
    "between the Parties on the subject matter and supersedes all prior negotiations, drafts, and "
    "communications.",
    body
))

story.append(Paragraph("17. Conditions Precedent to Cycle 1", h1))
story.append(Paragraph(
    "Cycle 1 of Layer 1 begins within five (5) business days of all of the following being in place:",
    body
))
story.append(bullets([
    "This Agreement signed by both Parties.",
    "Mutual NDA signed by both Parties.",
    "Client-owned repository created with Service Provider access added.",
    "Hosting (Hostinger) credentials provided to the Service Provider.",
    "Sample data set provided (anonymised acceptable).",
    "<b>Cycle 1 release</b> issued in writing by the Client (per Clause 10.2).",
    "<b>Cycle 1 kickoff deposit (30% of Cycle 1 fee = USD 210)</b> received in the Service Provider&rsquo;s account (per Clause 6).",
]))

story.append(KeepTogether([
    Paragraph("18. Signatures", h1),
    Paragraph(
        "Signed by the duly authorised representatives of the Parties on the dates set out below.",
        body
    ),
    Spacer(1, 0.3 * cm),
    signature_block(
        "For the Client (Sigma)", "Al Ayham",
        "For the Service Provider", "Khaled Ahmed"
    ),
]))

story.append(PageBreak())

# ============================================================
# PART B — NDA
# ============================================================
story.extend(section_banner("Part B", "Mutual Non-Disclosure Agreement"))

story.append(Paragraph("1. Parties &amp; Purpose", h1))
story.append(Paragraph(
    "This Mutual Non-Disclosure Agreement (the &ldquo;NDA&rdquo;) is entered into between "
    "<b>Sigma</b>, represented by Al Ayham, and <b>Khaled Ahmed</b>, in connection with the design, "
    "build, and delivery of the Sigma PMO under the Service Agreement of even date.",
    body
))

story.append(Paragraph("2. Definition of Confidential Information", h1))
story.append(Paragraph(
    "&ldquo;Confidential Information&rdquo; means any non-public information disclosed by one Party "
    "(the &ldquo;Disclosing Party&rdquo;) to the other (the &ldquo;Receiving Party&rdquo;) in any "
    "form, including but not limited to:",
    body
))
story.append(bullets([
    "Sigma proprietary governance logic, causality model, fault weighting, accountability balancing, intervention scoring, governance override logic, commercial behaviour logic, and decision causality weighting.",
    "Project data, schedule data, report data, business processes, contractual positions, and stakeholder information.",
    "Source code, architecture documents, data models, schemas, scripts, configurations, and runbooks created or shared in the course of the engagement.",
    "Commercial terms, pricing, payment details, contractual structure, and engagement model.",
    "Any information marked or reasonably understood to be confidential.",
]))

story.append(Paragraph("3. Obligations of the Receiving Party", h1))
story.append(bullets([
    "Use Confidential Information solely for the purpose of performing or supervising the Service Agreement.",
    "Protect Confidential Information with at least the same degree of care it uses for its own confidential information of similar sensitivity, and in any event no less than reasonable care.",
    "Not disclose Confidential Information to any third party without the prior written consent of the Disclosing Party.",
    "Not reproduce, copy, or store Confidential Information except as strictly necessary for the purpose of the engagement.",
    "Restrict access to Confidential Information to personnel with a strict need-to-know, who are bound by equivalent confidentiality obligations.",
]))

story.append(Paragraph("4. Exclusions", h1))
story.append(Paragraph("Confidential Information does not include information that:", body))
story.append(bullets([
    "Is or becomes publicly available through no breach of this NDA.",
    "Was rightfully known to the Receiving Party before disclosure, with documentary evidence.",
    "Is rightfully received from a third party without restriction and without breach of any duty of confidentiality.",
    "Is independently developed by the Receiving Party without use of or reference to the Disclosing Party&rsquo;s Confidential Information.",
    "Is required to be disclosed by law, regulation, or court order &mdash; in which case the Receiving Party shall notify the Disclosing Party in writing in advance, where legally permitted.",
]))

story.append(PageBreak())

story.append(Paragraph("5. Sigma Proprietary Logic &mdash; Specific Obligation", h1))
story.append(callout_box(
    "Indefinite Survival of the Sigma Proprietary Logic Obligation",
    [
        "The Service Provider expressly acknowledges that all Sigma governance logic (as defined in "
        "Clause 7 of the Service Agreement) is the sole and exclusive intellectual property of the "
        "Client and that the Service Provider shall not, at any time, use, reuse, replicate, "
        "license, adapt, derive, teach, publish, or transfer any part of such logic in or for any "
        "other implementation, project, client, product, or derivative work, whether during or "
        "after the term of this NDA. <b>This obligation survives termination of the Service "
        "Agreement indefinitely.</b>"
    ],
    accent=NAVY, bg=SOFT_BG
))

story.append(Paragraph("6. Term", h1))
story.append(bullets([
    "This NDA enters into force on the date of last signature and remains in effect for a period of <b>five (5) years</b> from such date.",
    "The obligation in Clause 5 (Sigma Proprietary Logic) survives termination indefinitely.",
    "Confidentiality obligations relating to information that constitutes a trade secret survive for as long as such information remains a trade secret.",
]))

story.append(Paragraph("7. Return or Destruction", h1))
story.append(Paragraph(
    "Upon written request by the Disclosing Party, or upon termination of the Service Agreement, "
    "the Receiving Party shall promptly return or, at the Disclosing Party&rsquo;s option, destroy "
    "all Confidential Information in its possession, control, or custody, and certify such return "
    "or destruction in writing within ten (10) business days.",
    body
))

story.append(Paragraph("8. Remedies", h1))
story.append(Paragraph(
    "The Parties acknowledge that breach of this NDA may cause irreparable harm for which monetary "
    "damages may be inadequate, and that the non-breaching Party shall be entitled to seek "
    "injunctive and other equitable relief, in addition to any other remedies available at law or "
    "in equity.",
    body
))

story.append(Paragraph("9. General", h1))
story.append(bullets([
    "This NDA is governed by the same law and dispute-resolution provisions as the Service Agreement.",
    "Failure to enforce any provision shall not be construed as a waiver.",
    "If any provision is held unenforceable, the remaining provisions remain in full force.",
    "This NDA may be signed in counterparts, each of which is an original.",
]))

story.append(KeepTogether([
    Paragraph("10. Signatures", h1),
    Spacer(1, 0.3 * cm),
    signature_block(
        "For the Client (Sigma)", "Al Ayham",
        "For the Service Provider", "Khaled Ahmed"
    ),
]))

story.append(PageBreak())

# ============================================================
# PART C — BANKING DETAILS
# ============================================================
story.extend(section_banner("Part C", "Banking Details"))
story.append(Paragraph(
    "All payments under this Agreement shall be made by bank transfer to the following beneficiary "
    "account. The Client may also request alternative payment rails (e.g., Wise, PayPal Business) "
    "in writing &mdash; alternative-rail fees are deducted from the cycle fee at the prevailing rate.",
    body
))

story.append(Paragraph("Beneficiary Information", h1))
bank_data = [
    ["Beneficiary Name (Legal)", "Khalid Ahmad Hajaji Sanari"],
    ["Trading Name", "Khaled Ahmed (khaledahmed.net)"],
    ["Email", "khaledahmedhaggagy@gmail.com"],
    ["Phone", "+20 120 459 3124"],
    ["Address", "Sharea al Sheikh Ibrahim, Qina 45431, Egypt"],
    ["Bank Name", "National Bank of Egypt"],
    ["Account Number", "5255001899311000014"],
    ["IBAN", "EG380003052550018993110000140"],
    ["SWIFT / BIC Code", "NBEGEGCX525"],
    ["Currency", "USD (United States Dollars)"],
    ["Payment Reference", "Sigma PMO — Cycle [N]"],
]
bt = Table(bank_data, colWidths=[5.0 * cm, 11.6 * cm])
bt.setStyle(TableStyle([
    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
    ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
    ("FONTSIZE", (0, 0), (-1, -1), 10.5),
    ("BACKGROUND", (0, 0), (0, -1), SOFT_BG),
    ("TEXTCOLOR", (0, 0), (0, -1), NAVY),
    ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ("LINEBELOW", (0, 0), (-1, -1), 0.3, LINE),
    ("BOX", (0, 0), (-1, -1), 0.5, LINE),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
]))
story.append(bt)
story.append(Spacer(1, 0.4 * cm))

story.append(Paragraph("Payment Reference", h2))
story.append(Paragraph(
    "Each transfer must include a clear reference of the form &ldquo;<b>Sigma PMO &mdash; "
    "Cycle [N]</b>&rdquo; (where [N] is the cycle number, 1 to 8). This is required for cycle-level "
    "reconciliation and audit traceability.",
    body
))

story.append(Paragraph("Bank Charges", h2))
story.append(Paragraph(
    "All bank charges on the Client&rsquo;s side are borne by the Client. Intermediary or "
    "beneficiary bank charges are borne by the Service Provider, and are deducted from the received "
    "amount &mdash; meaning the cycle fee stated in this Agreement is the amount before such charges.",
    body
))

story.append(PageBreak())

# ============================================================
# ANNEX 1 — CYCLE PLAN
# ============================================================
story.extend(section_banner("Annex 1", "Cycle Plan & Fee Schedule"))

story.append(Paragraph("Schedule Overview", h1))
story.append(cycle_schedule_table())
story.append(Spacer(1, 0.4 * cm))

story.append(Paragraph("Layer 1 &mdash; Technical Governance Engine (4 cycles / 8 weeks / USD 2,000)", h1))
story.append(bullets([
    "<b>Cycle 1 &mdash; USD 700 &mdash; Days 1&ndash;14.</b> Data foundation: ingestion pipelines (P6, Excel, CSV), canonical schema (projects, activities, reports, resources), version-controlled storage, initial validation layer. Acceptance: ingest sample P6 + Excel and verify normalised state.",
    "<b>Cycle 2 &mdash; USD 600 &mdash; Days 15&ndash;28.</b> Core rule engine v1: planned-vs-actual comparison, deviation calculations, resource-based signals, threshold-based alert generation. Acceptance: a deviation is detected with full traceback to source rows.",
    "<b>Cycle 3 &mdash; USD 400 &mdash; Days 29&ndash;42.</b> Governance layer: evidence linking, decision traceability, basic data confidence scoring (completeness, consistency, source reliability), flagging of suspicious reporting patterns. Acceptance: end-to-end evidence trail proven on real sample data.",
    "<b>Cycle 4 &mdash; USD 300 &mdash; Days 43&ndash;56.</b> Output layer: alert dashboard (minimal internal UI), weekly executive summary (LLM-assisted, grounded in data), end-to-end integration, hardening, handover pack. Acceptance: usable internal MVP and full handover.",
]))

story.append(PageBreak())

story.append(Paragraph("Layer 2 &mdash; Sigma Governance Intelligence Layer (2 cycles / 4 weeks / USD 1,400)", h1))
story.append(bullets([
    "<b>Cycle 5 &mdash; USD 700 &mdash; Days 57&ndash;70.</b> FIDIC-linked logic + notice triggers + entitlement / claim baseline + contractual causality mapping + PMI / PMBOK governance mapping + stage-gate, approval routing, escalation, intervention pathways, risk governance flow. Acceptance: contractual + governance flow executed on a sample portfolio.",
    "<b>Cycle 6 &mdash; USD 700 &mdash; Days 71&ndash;84.</b> Sigma proprietary logic + causality model + fault weighting + accountability balancing + intervention scoring + governance override + commercial behaviour logic + decision causality weighting. Acceptance: full intelligence layer running over the engine, with explainable outputs.",
]))

story.append(Paragraph("Layer 3 &mdash; Full Commercial Platform Layer (2 cycles / 4 weeks / USD 1,600)", h1))
story.append(bullets([
    "<b>Cycle 7 &mdash; USD 800 &mdash; Days 85&ndash;98.</b> Modular service architecture + environment separation + secrets management + scheduled backups + RBAC + admin / workflow controls + configurable governance + versioned API. Acceptance: dev / staging / production stack live with backup and restore proven; roles enforced end-to-end; API consumed externally.",
    "<b>Cycle 8 &mdash; USD 800 &mdash; Days 99&ndash;112.</b> Selected integrations (P6, MS Project, email, Slack / Teams) + commercial-grade UI / UX + hardening + scale plan + stress test + enterprise deployment readiness + handover. Acceptance: integrations exchanging data; load test results; deployment runbook; full handover package.",
]))

story.append(callout_box(
    "Layer 3 — Implementation Depth Clarification",
    [
        "For the avoidance of doubt and to lock implementation depth contractually, Layer 3 is delivered as a <b>single unified web application</b>, served from one codebase and one deployment, accessible via modern desktop, tablet, and mobile web browsers as a responsive web application. Native mobile applications (iOS / Android) remain a Re-scope Trigger.",
        "The platform applies role-based access control (RBAC), the admin / workflow controls, and the configurable governance logic to expose, for each stakeholder type &mdash; <b>Contractor, Consultant, Client, and Sigma</b> &mdash; that role's own permissioned operating view of the same underlying system. Role views are configured through RBAC and are not delivered as separate applications.",
        "For each role, the operating view consists of four standard surfaces drawn from the data, logic, and outputs already produced by Layer 1 and Layer 2: <b>(i) input</b> surfaces for data and evidence that role is permitted to submit, <b>(ii) review</b> surfaces for data and outputs that role is permitted to see, <b>(iii) approval</b> surfaces for actions that role is permitted to approve or reject, and <b>(iv) evidence</b> surfaces exposing the traceable record visible to that role.",
        "The four standard surfaces above are <b>functional operating surfaces, not view-only pages</b>. Each surface supports the relevant role actions where applicable &mdash; including <b>create, submit, upload, review, approve, and reject</b> &mdash; enforced within the same role-permission model defined by RBAC, the admin / workflow controls, and the configurable governance logic.",
        "Bespoke role-specific workflow screens, sector-specific UX flows, or surfaces beyond the four standard surfaces above remain a Re-scope Trigger and are not implied by this clarification.",
    ],
    accent=NAVY, bg=SOFT_BG
))

story.append(callout_box(
    "Total",
    ["<b>USD 5,000 across 8 cycles, 16 weeks of build, full three-layer build path.</b>"],
    accent=NAVY, bg=SOFT_BG
))

story.append(PageBreak())

# ============================================================
# ANNEX 2 — RE-SCOPE TRIGGERS
# ============================================================
story.extend(section_banner("Annex 2", "Re-scope Triggers by Layer"))

story.append(Paragraph("Layer 1 &mdash; Re-scope Triggers", h1))
story.append(bullets([
    "Additional schedule formats beyond P6 / Excel / CSV.",
    "Additional report formats requiring OCR or non-text PDF parsing.",
    "More than two simultaneous project domains in the same window.",
    "Hosting environment change after Cycle 1 has begun.",
    "Additional output languages beyond English.",
    "Real-time / streaming ingestion (default is batch).",
]))

story.append(Paragraph("Layer 2 &mdash; Re-scope Triggers", h1))
story.append(bullets([
    "Sigma proprietary logic specification changes substantially after layer kick-off.",
    "Additional contract families introduced beyond FIDIC (e.g., NEC, JCT, AIA, custom bespoke contracts).",
    "Multi-jurisdiction overlay required.",
    "Custom ML / statistical anomaly models requested in addition to rule and heuristic logic.",
    "Real-time governance flow required (default is event-driven).",
]))

story.append(Paragraph("Layer 3 &mdash; Re-scope Triggers", h1))
story.append(bullets([
    "Move to a multi-tenant architecture after Layer 3 has begun.",
    "Additional integrations beyond the agreed locked list.",
    "Mobile-native delivery added to the scope.",
    "Compliance certification (SOC 2 / ISO 27001) added to the scope.",
    "Hosting migration after Layer 3 Cycle 1 has begun.",
    "Bespoke role-specific workflow screens, sector-specific UX flows, or stakeholder surfaces beyond the four standard surfaces (input / review / approval / evidence) defined in the Layer 3 Implementation Depth Clarification.",
    "Additional stakeholder roles beyond Contractor, Consultant, Client, and Sigma.",
]))

story.append(PageBreak())

# ============================================================
# ANNEX 3 — ASSUMPTIONS
# ============================================================
story.extend(section_banner("Annex 3", "Assumptions"))
story.append(bullets([
    "One project domain (construction / EPC) for Layer 1 Cycle 1 onwards; additional domains are re-scope triggers.",
    "Schedules in P6 (XER) or compatible Excel; reports in structured or semi-structured format with text layer.",
    "Hosting on Hostinger or equivalent VPS, provided by the Client.",
    "Internal use by the PMO &mdash; no external client-facing UI in Layer 1.",
    "Single output language (English) for alerts and summaries.",
    "Sample data is made available within three (3) working days of cycle start.",
    "FIDIC reference editions (Red / Yellow / Silver, year) and PMBOK reference edition are confirmed at Layer 2 kick-off.",
    "Sigma proprietary logic is documented by the Client in writing before Layer 2 Cycle 6 begins.",
    "Final integration list for Layer 3 is locked, in writing, at the start of Layer 3 Cycle 7.",
    "Branding, logos, and visual style guide are provided before Layer 3 Cycle 8 begins.",
]))

story.append(Spacer(1, 0.6 * cm))
story.append(callout_box(
    "End of Contract Package",
    [
        "This contract package consists of: <b>Part A &mdash; Service Agreement</b>, <b>Part B &mdash; "
        "Mutual Non-Disclosure Agreement</b>, <b>Part C &mdash; Banking Details</b>, <b>Annex 1 &mdash; "
        "Cycle Plan &amp; Fee Schedule</b>, <b>Annex 2 &mdash; Re-scope Triggers</b>, and <b>Annex 3 &mdash; "
        "Assumptions</b>.",
        "All parts are executed together as a single integrated agreement upon signature.",
    ],
    accent=NAVY, bg=SOFT_BG
))

# ---------- Build with different first-page template ----------
from reportlab.platypus import PageTemplate, Frame, BaseDocTemplate

class ContractDoc(BaseDocTemplate):
    def __init__(self, filename, **kw):
        BaseDocTemplate.__init__(self, filename, **kw)
        cover_frame = Frame(0, 0, A4[0], A4[1], id="cover",
                            leftPadding=2.2 * cm, rightPadding=2.2 * cm,
                            topPadding=0, bottomPadding=0)
        content_frame = Frame(2.2 * cm, 1.7 * cm,
                              A4[0] - 4.4 * cm, A4[1] - 1.8 * cm - 1.7 * cm,
                              id="content")
        self.addPageTemplates([
            PageTemplate(id="Cover", frames=[cover_frame], onPage=cover_page),
            PageTemplate(id="Content", frames=[content_frame], onPage=content_page),
        ])

doc = ContractDoc(
    OUTPUT, pagesize=A4,
    title="Sigma PMO - Contract Package",
    author="Khaled Ahmed",
)

# Wrap to switch templates after cover
from reportlab.platypus.doctemplate import NextPageTemplate
new_story = [NextPageTemplate("Cover")]
new_story.extend(story[:story.index(next(s for s in story if isinstance(s, PageBreak)))])
# Find first PageBreak (end of cover) and switch
idx = next(i for i, s in enumerate(story) if isinstance(s, PageBreak))
final_story = []
final_story.append(NextPageTemplate("Content"))
final_story.extend(story[:idx])
final_story.append(PageBreak())
final_story.extend(story[idx + 1:])

doc.build(final_story)
print(f"Wrote: {OUTPUT}")
