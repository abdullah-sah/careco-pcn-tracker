# Graph Report - .  (2026-07-04)

## Corpus Check
- Corpus is ~25,563 words - fits in a single context window. You may not need a graph.

## Summary
- 223 nodes · 332 edges · 18 communities (14 shown, 4 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Excel Export & Conversion|Excel Export & Conversion]]
- [[_COMMUNITY_Project Plans & Specs|Project Plans & Specs]]
- [[_COMMUNITY_Core App & Database|Core App & Database]]
- [[_COMMUNITY_Package Scripts & DevDeps|Package Scripts & DevDeps]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Data & Export Design Docs|Data & Export Design Docs]]
- [[_COMMUNITY_PCN Portal UI|PCN Portal UI]]
- [[_COMMUNITY_Runtime Dependencies|Runtime Dependencies]]
- [[_COMMUNITY_XLSX Round-Trip Tests|XLSX Round-Trip Tests]]
- [[_COMMUNITY_Auth & Security Docs|Auth & Security Docs]]
- [[_COMMUNITY_OCR Extraction|OCR Extraction]]
- [[_COMMUNITY_Login & Session Auth|Login & Session Auth]]
- [[_COMMUNITY_Auth Middleware|Auth Middleware]]
- [[_COMMUNITY_App Layout|App Layout]]
- [[_COMMUNITY_Deploy & Env Docs|Deploy & Env Docs]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `scripts` - 9 edges
3. `buildXlsx()` - 8 edges
4. `toView()` - 7 edges
5. `PcnPortal Client Component` - 7 edges
6. `PcnRow` - 6 edges
7. `parseWorkbook()` - 6 edges
8. `buildXlsx Exporter` - 6 edges
9. `PcnPortal()` - 5 edges
10. `poundsToPence()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `PcnPortal Client Component` --conceptually_related_to--> `Recovery Desk / PCN Register App`  [INFERRED]
  docs/superpowers/plans/2026-06-30-pcn-register-2-app.md → README.md
- `State` --references--> `PcnView`  [EXTRACTED]
  components/pcn-portal.tsx → lib/pcn/view.ts
- `getAllPcns()` --indirect_call--> `toView()`  [INFERRED]
  db/queries.ts → lib/pcn/view.ts
- `Shared error State (pcn-portal)` --references--> `PcnPortal Client Component`  [EXTRACTED]
  .superpowers/sdd/groupB-report.md → docs/superpowers/plans/2026-06-30-pcn-register-2-app.md
- `Recovery Desk / PCN Register App` --conceptually_related_to--> `PCN Register (Careco)`  [INFERRED]
  README.md → docs/superpowers/specs/2026-06-30-pcn-register-design.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **OCR Add-a-PCN Flow** — docs_superpowers_plans_2026_06_30_pcn_register_2_app_pcn_portal, docs_superpowers_plans_2026_06_30_pcn_register_2_app_ocr_route, docs_superpowers_plans_2026_06_30_pcn_register_2_app_extract_pcn, docs_superpowers_specs_2026_06_30_pcn_register_design_vercel_blob, docs_superpowers_plans_2026_06_30_pcn_register_2_app_server_actions [EXTRACTED 1.00]
- **Shared-Password Auth Gate Stack** — docs_superpowers_plans_2026_06_30_pcn_register_2_app_middleware_gate, docs_superpowers_plans_2026_06_30_pcn_register_2_app_sign_session, docs_superpowers_plans_2026_06_30_pcn_register_2_app_image_proxy, docs_superpowers_specs_2026_06_30_pcn_register_design_shared_password_auth [EXTRACTED 1.00]
- **Identical XLSX Export Pipeline** — docs_superpowers_plans_2026_06_30_pcn_register_1_data_and_export_buildxlsx, docs_superpowers_plans_2026_06_30_pcn_register_1_data_and_export_convert_helpers, docs_superpowers_plans_2026_06_30_pcn_register_1_data_and_export_column_specs, docs_superpowers_specs_2026_06_30_pcn_register_design_template_round_trip_export, docs_superpowers_specs_2026_06_30_pcn_register_design_range_bumping [EXTRACTED 1.00]

## Communities (18 total, 4 thin omitted)

### Community 0 - "Excel Export & Conversion"
Cohesion: 0.12
Nodes (26): GET(), getRowsForExport(), dateToSerial(), EXCEL_EPOCH_MS, penceToPounds(), poundsToPence(), serialToDate(), ColKind (+18 more)

### Community 1 - "Project Plans & Specs"
Cohesion: 0.09
Nodes (31): Plan 1: Data Foundation & Export, extractPcn OCR Function, POST /api/ocr Route, PCN-Number Dedupe Check, PcnPortal Client Component, PcnView / toView, Plan 2: App (UI/Auth/OCR/Export), Server Actions (createPcn/updatePcn) (+23 more)

### Community 2 - "Core App & Database"
Cohesion: 0.14
Nodes (18): createPcn(), CreatePcnInput, updatePcn(), UpdatePcnInput, Page(), State, main(), db (+10 more)

### Community 3 - "Package Scripts & DevDeps"
Cohesion: 0.09
Nodes (21): devDependencies, dotenv, drizzle-kit, tsx, @types/node, @types/react, @types/react-dom, typescript (+13 more)

### Community 4 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 5 - "Data & Export Design Docs"
Cohesion: 0.13
Nodes (18): PCN Register Spreadsheet Data Source, buildXlsx Exporter, Per-Sheet Column Specs (Private 9 / Council 13), Convert Helpers (money + serial dates), GET /api/export Route, Export Fidelity Test, parseWorkbook Importer, Embedded Template Base64 (TEMPLATE_B64) (+10 more)

### Community 6 - "PCN Portal UI"
Cohesion: 0.23
Nodes (10): Category, css(), cssCache, Draft, Field(), fmtDate(), gbp(), merge() (+2 more)

### Community 7 - "Runtime Dependencies"
Cohesion: 0.18
Nodes (11): dependencies, @anthropic-ai/sdk, drizzle-orm, fflate, @neondatabase/serverless, next, react, react-dom (+3 more)

### Community 8 - "XLSX Round-Trip Tests"
Cohesion: 0.20
Nodes (6): A, B, out, rows, template, rows

### Community 9 - "Auth & Security Docs"
Cohesion: 0.29
Nodes (8): Auth-Gated Image Proxy (/api/pcn-image/[id]), Middleware Cookie Gate (Web Crypto), signSession HMAC Cookie, Four Runtime Secrets, Private Blob Store + Signed Fetch, Image-Proxy SSRF Guard (Task 3), Shared-Password Auth Gate, Vercel Blob Image Storage

### Community 10 - "OCR Extraction"
Cohesion: 0.43
Nodes (4): POST(), Extracted, ExtractedSchema, extractPcn()

### Community 12 - "Auth Middleware"
Cohesion: 0.60
Nodes (4): config, middleware(), timingSafeEqualHex(), valid()

## Knowledge Gaps
- **79 isolated node(s):** `UpdatePcnInput`, `metadata`, `MONTHS`, `cssCache`, `Category` (+74 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `POST /api/ocr Route` connect `Project Plans & Specs` to `Auth & Security Docs`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `sort_seq Ordering` connect `Project Plans & Specs` to `Data & Export Design Docs`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `UpdatePcnInput`, `metadata`, `MONTHS` to the rest of the system?**
  _80 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Excel Export & Conversion` be split into smaller, more focused modules?**
  _Cohesion score 0.12121212121212122 - nodes in this community are weakly interconnected._
- **Should `Project Plans & Specs` be split into smaller, more focused modules?**
  _Cohesion score 0.08817204301075268 - nodes in this community are weakly interconnected._
- **Should `Core App & Database` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `Package Scripts & DevDeps` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._