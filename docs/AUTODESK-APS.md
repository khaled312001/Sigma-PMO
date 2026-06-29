# Autodesk APS — DWG / RVT translation path

This document states precisely what the platform does **natively today** versus
what needs **Autodesk Platform Services (APS)**, which API is used, the exact
environment variables required, how to enable it, how the UI surfaces job
status and errors, and how to verify the path with a real DWG/RVT once
credentials are set.

It is written to be factual to the code in
`backend/src/modules/integrations/autodesk/` and `backend/src/modules/drawings/`.

---

## 1. Native today vs APS-required

The platform's core chain is **AutoCAD/DWG/RVT → BIM/Revit/IFC → Clash → BOQ →
Cost**. The geometry-extraction boundary is:

| Capability | Native today (no APS) | Needs Autodesk APS |
| --- | --- | --- |
| IFC (STEP `.ifc`) element counts / quantities | **Yes** — hand-rolled STEP parser (`/bim` surface) | — |
| IFC model-validation + governance checks at upload | **Yes** — deterministic, no geometry kernel | — |
| Clash review from IFC models | **Yes** — native clash engine on the `/clashes` surface | — |
| DWG geometry / quantity extraction | No — DWG is archive-only without APS | **Yes** — APS Model Derivative translation |
| RVT (Revit) geometry / quantity extraction | No | **Yes** — APS Model Derivative translation |
| SVF2 viewer (browser 3D viewing) | No | **Yes** — APS (2-legged `viewables:read` token) |
| Live in-cloud clash (Model Coordination) | No | Needs a **paid Autodesk Construction Cloud** account — not just APS creds |

In short: **IFC works natively right now.** DWG and RVT geometry/quantities
need APS. The platform does **not** run a clash engine in the cloud — native IFC
clash is local; in-cloud Model Coordination is a separate paid ACC product.

---

## 2. Which API — Model Derivative, 2-legged

Server-side translation uses the **Model Derivative API** with **2-legged OAuth
(client-credentials)**. It is **not** the Design Automation ("Automation") API.

A browser-side 3-legged SSO flow is **not used**: when the front-end Autodesk
Viewer needs a token, the connector issues a short-lived **2-legged
`viewables:read`** token instead (`GET /integrations/autodesk/viewer-token`).

Because everything is 2-legged client-credentials:

- **No callback / redirect URL is required.**
- **No 3-legged scopes are required.**

(Those are only relevant to a browser user-login SSO flow, which this pipeline
deliberately avoids.)

---

## 3. The exact pipeline

`POST /integrations/autodesk/import` (`AutodeskApsService.importModel`) runs:

1. **Validate credentials** — `isEnabled()`; if no creds, returns HTTP 503 with a
   clear "APS is not configured" message. Nothing is uploaded.
2. **Ensure bucket** — create (or reuse) a `transient` OSS bucket; the bucket key
   is derived from the client id so tenants never collide.
3. **Upload to Autodesk OSS** — direct-to-S3 signed upload (OSS v2, single-part).
4. **Create the URN** — base64url of the OSS `objectId`.
5. **Translate** — start a Model Derivative job. Output format is `svf2` (viewer
   + property tree the QS counts read) by default, or `ifc` (the DWG→IFC export)
   when requested.
6. **Poll the manifest** (`waitForTranslation`) until `success` / `failed` /
   `timeout`, or until the poll budget elapses (then it reports `inprogress` and
   the URN can be re-polled later).
7. **Read viewable GUIDs + properties** — collect element properties from the 3D
   viewable(s).
8. **Derive counts + categories** — map Revit categories ("Walls", "Floors",
   "Structural Columns", …) and IFC entities ("IfcWall", "IfcSlab", …) into the
   eight governed `BimCounts` families (walls, slabs, columns, beams, doors,
   windows, spaces, storeys), plus a raw category histogram.

The controller then writes the **same `bim-model`** record the Quantity-Survey
pipeline already consumes (`BimModelService.ingestFromCounts`, origin
`autodesk-aps`), carrying the URN, translation status, object count and category
histogram in its `extra`. From there the existing chain takes over:

```
Upload DWG/RVT
  → APS Model Derivative translation job (svf2 | ifc)
  → viewable GUIDs + element properties
  → BimCounts + category histogram
  → bim-model record (origin: autodesk-aps)
  → Quantity Survey → BOQ → Cost
  → Clash review (native IFC clash, or ingested Navisworks export)
```

The secret is **never logged and never returned** to any caller.

---

## 4. Required environment variables

For the server-side Model Derivative pipeline you need **only**:

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTODESK_CLIENT_ID` | **Yes** | APS app client id (2-legged). |
| `AUTODESK_CLIENT_SECRET` | **Yes** | APS app client secret. Never logged, never returned. |
| `AUTODESK_BASE_URL` | Optional | APS host. Defaults to `https://developer.api.autodesk.com`; override only for a sovereign region. |

You do **not** need `APS_CALLBACK_URL`, a redirect URL, or any 3-legged scope
variables for this pipeline — they are only relevant to a browser SSO login,
which the connector does not use.

`GET /integrations/autodesk/status` returns this honestly, with no secret value:

```json
{
  "enabled": false,
  "credentialSource": "none",
  "configuredVia": null,
  "baseUrl": "https://developer.api.autodesk.com",
  "requiredEnv": ["AUTODESK_CLIENT_ID", "AUTODESK_CLIENT_SECRET"],
  "reachable": null,
  "detail": null
}
```

`configuredVia` is `"settings"` (encrypted `/admin/settings`), `"env"`, or
`null` when unconfigured.

---

## 5. How to enable

Two equivalent ways — the connector prefers the encrypted DB value over the env
value (same precedence as the Claude key):

1. **Environment (server-side)** — set `AUTODESK_CLIENT_ID` and
   `AUTODESK_CLIENT_SECRET` in the backend environment and restart. The keys are
   set by the server operator; they are never entered or shown in the public UI.
2. **Encrypted SystemSetting** — set the APS client id/secret from
   `/admin/settings`. These are stored encrypted; the service hot-reloads them on
   change (no restart) and clears any cached token.

To confirm validity, call `GET /integrations/autodesk/status?probe=true` — it
requests a real 2-legged token and returns `reachable: true|false` (with a
`detail` message on failure), still without exposing the secret.

---

## 6. How the UI shows status / job / errors

On `/drawings`, the **"Autodesk APS · DWG/RVT translation"** section:

- Calls `GET /integrations/autodesk/status` and shows an **ENABLED/DISABLED**
  badge — "APS configured" (green) or "APS not configured" (amber). No secret is
  ever displayed.
- When **disabled**, it lists the exact env vars to set
  (`AUTODESK_CLIENT_ID`, `AUTODESK_CLIENT_SECRET`), notes that no callback /
  3-legged scopes are needed, and states that **IFC keeps working natively
  today**.
- When **enabled**, it offers an upload affordance for DWG / RVT / IFC that
  `POST`s to `/integrations/autodesk/import` and then renders the job result:
  - **Job id / URN**, translation **status** (`success` / `inprogress` /
    `failed` / `timeout`),
  - **output**: object count, the eight governed element counts, and the top
    element categories,
  - a clear **ERROR state** when translation fails or times out.
- Once a model is imported it links to **View clashes** (`/clashes`) and
  **View BOQ** (`/quantity-survey`).

---

## 7. How to verify with a real DWG/RVT (once creds are set)

1. Set `AUTODESK_CLIENT_ID` + `AUTODESK_CLIENT_SECRET` (env or `/admin/settings`).
2. Hit `GET /integrations/autodesk/status?probe=true` — confirm
   `enabled: true` and `reachable: true`.
3. Open `/drawings`, scroll to **Autodesk APS · DWG/RVT translation** — confirm
   the badge reads **APS configured**.
4. Pick a real `.dwg` or `.rvt` (≤ 50 MB) and click **Translate via APS**.
5. Watch the job run (upload → Model Derivative → poll). On success the result
   card shows the URN, `status: success`, object count, the governed element
   counts and categories.
6. Click **View BOQ** — the translated quantities now feed Quantity Survey →
   BOQ → Cost. Click **View clashes** to review clashes for the project.
7. If translation **fails/times out**, the result card surfaces the status and an
   error explanation; re-check the file is a valid DWG/RVT and the credentials,
   then retry. The URN remains valid for re-polling at Autodesk.

> Note: live in-cloud **Model Coordination** clash (as opposed to native IFC
> clash) additionally requires a **paid Autodesk Construction Cloud** account; it
> is not unlocked by APS credentials alone.

---

## ملخّص عربي (Arabic summary)

- **اليوم بدون APS:** تعمل ملفات **IFC (STEP)** محلياً بالكامل — يُحصى عناصرها
  وتُجرى فحوصات التحقّق والحوكمة، وتُراجَع تعارضاتها عبر المحرّك الأصلي.
- **يتطلّب APS:** استخراج هندسة وكمّيات ملفات **DWG** و**RVT**، وكذلك عارض
  **SVF2** ثلاثي الأبعاد في المتصفّح.
- **الواجهة المستخدمة:** **Model Derivative API** بمصادقة **ثنائية الطرف
  (client_credentials)** — وليست واجهة الأتمتة (Design Automation).
- **المتغيّرات المطلوبة فقط:** `AUTODESK_CLIENT_ID` و`AUTODESK_CLIENT_SECRET`
  (و`AUTODESK_BASE_URL` اختياري). **لا حاجة** إلى عنوان رد نداء (callback) ولا إلى
  نطاقات ثلاثية الطرف لهذا المسار — فهي تخصّ تسجيل دخول المتصفّح فقط.
- **التهيئة:** عبر متغيّرات البيئة على الخادم، أو من شاشة `/admin/settings`
  المشفّرة (تُفضَّل القيمة المشفّرة في قاعدة البيانات). يضبط الخادم المفاتيح بنفسه
  ولا تُعرض في الواجهة أبداً.
- **المسار:** رفع DWG/RVT ← مهمّة تحويل Model Derivative ← مخرجات SVF2/IFC مع
  البيانات الوصفية ← إدخال في المنصّة ← الربط مع التعارضات وجدول الكمّيات والكلفة.
- **التحقّق:** اضبط المفاتيح ← `status?probe=true` يُظهر `reachable: true` ← من
  `/drawings` اضغط "تحويل عبر APS" على ملف DWG/RVT حقيقي ← تظهر بطاقة النتيجة
  بمعرّف المهمّة (URN) والحالة وعدّادات العناصر، مع روابط "عرض التعارضات" و"عرض
  جدول الكمّيات (BOQ)". عند الفشل تُعرض الحالة وسبب الخطأ لإعادة المحاولة.
