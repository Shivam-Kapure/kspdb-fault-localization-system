# 🛡️ GridGuard | KSPDB Fault Localization Console

GridGuard is an industrial-grade, high-throughput fault localization and operator telemetry platform designed for the Karnataka State Power Distribution Board (KSPDB). 

The platform monitors radial power distribution grids, ingests high-frequency device telemetries (up to 500+ msg/s), filters out physical noise and false alarms, and automatically localizes grid outages (feeders, transformers, and spans) in real time using a custom deterministic graph-traversal engine with a spatial Minimum Spanning Tree (MST) fallback.

---

## ⚡ Quick Start (One Command)

To build and launch the entire stack—including the database, backend, and frontend—run:

```bash
docker compose up --build
```

Once started:
- **Operator Console UI:** Open [http://localhost:5173](http://localhost:5173) in your browser.
- **Backend API Server:** Access [http://localhost:3000](http://localhost:3000).
- **Database Instance:** PostgreSQL is exposed on port `5432`.

The system **auto-seeds on startup** with a realistic grid layout containing **4 Substations, 8 Feeders, 40 Transformers (DTs), and ~1,500 Poles**, so you can begin testing immediately.

---

## 🚀 Live Demo & Video Walkthrough

- **Public Live Application:** [https://gridguard-production.up.railway.app](https://gridguard-production.up.railway.app) (Placeholder - Replace with your deployment URL)
- **5-Minute Technical Demo Video:** [https://youtu.be/example-walkthrough](https://youtu.be/example-walkthrough) (Placeholder - Replace with your recording)

---

## 🗺️ Documentation Directory

We have organized our technical write-ups into separate, focused documents to respect your review time:

1. [**`ARCHITECTURE.md`**](file:///d:/Downloads-D-Drive/Propel.ai%20-%20Assignment%20%282026-2027%29/ARCHITECTURE.md)
   * Detailed system dataflow diagram (Mermaid).
   * Storage layer schema & topology representation.
   * Tree-walking localization algorithm complexity & MST fallback details.
   * Noise models & false positive suppression rules.
2. [**`DEPLOYMENT.md`**](file:///d:/Downloads-D-Drive/Propel.ai%20-%20Assignment%20%282026-2027%29/DEPLOYMENT.md)
   * Step-by-step setup instructions for local development and cloud staging.
   * Comprehensive environment variable reference.
   * Real production troubleshooting log (CORS, memory bounds, container race conditions).
3. [**`DECISIONS.md`**](file:///d:/Downloads-D-Drive/Propel.ai%20-%20Assignment%20%282026-2027%29/DECISIONS.md)
   * Log of major architectural tradeoffs (Graph DB vs PostgreSQL, In-Memory caching vs Redis).
   * Assumptions made where the brief was ambiguous.
   * A roadmap for what we would implement with 2 extra weeks of engineering.
4. [**`AI-WORKFLOW.md`**](file:///d:/Downloads-D-Drive/Propel.ai%20-%20Assignment%20%282026-2027%29/AI-WORKFLOW.md)
   * Log of our interaction with AI coding assistants.
   * Honest estimation of code contributions.
   * Key failure modes where the AI hallucinated or wrote inefficient queries, and how we corrected them.

---

## 🛠️ Technology Stack
*   **Frontend:** React, Vite, Tailwind CSS v3, Lucide Icons, Leaflet (Map visualization)
*   **Backend:** Node.js, Express, TypeScript, pg-pool (High-performance connection pooling)
*   **Database:** PostgreSQL 15 (Timescale-ready structure)
*   **Containerization:** Docker, Docker Compose
*   **Testing:** Jest, ts-jest (Mock-driven graph-traversal verification)
