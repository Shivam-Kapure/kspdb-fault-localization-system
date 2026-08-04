# 🤖 AI Collaboration Workflow

This document outlines the collaborative workflow between the candidate and the AI assistant during the construction of GridGuard.

---

## 1. Collaboration Breakdown

### Delegated to AI
*   **Boilerplate & Infrastructure:** Writing standard Dockerfiles, `docker-compose.yml`, and initial package dependencies.
*   **Map Rendering:** Writing the Leaflet map overlay syntax and styling elements.
*   **Database Seeding:** Generating synthetic coordinate matrices for the radial branches.
*   **Mathematical Helpers:** Implementing the Haversine distance formula and Prim's MST algorithm.

### Manually Steered & Refactored
*   **Post-Order Tree Logic:** Refining the DFS subtree statistics (`darkCount` and `liveCount`) to ensure that isolated leaf nodes were correctly identified and suppressed as dead sensors.
*   **Ingestion Pipeline:** Restructuring the telemetry ingestion from direct DB writes to a 100ms buffering batch queue to support high-frequency loads.
*   **Safety Closure Checks:** Modifying the manual ticket closure route to check physical downstream status rather than relying on state values.

---

## 2. Code Contribution Estimate
*   **AI-Generated Code:** 85%
*   **Manual Refactoring / Steering / Integration:** 15%

---

## 3. Key AI Errors and Resolutions

### Error A: Database Bottlenecks
*   *Symptom:* The AI assistant originally suggested looking up `device_id -> pole_id` in the database on every HTTP request.
*   *Resolution:* During load testing, this caused high connection count warnings and latency spikes. We corrected this by steering the assistant to load the device-to-pole map in memory on server boot, making mapping checks $O(1)$ in-memory lookups.

### Error B: TypeScript Project Reference Typo
*   *Symptom:* The TS configuration generator emitted `"references": [{ "path": "./tsconfig.node" }]` in `frontend/tsconfig.json`. This failed with a missing compiler reference error.
*   *Resolution:* We manually corrected the path to `./tsconfig.node.json` which resolved the compiler gate.

---

## 4. Prompts of Note
> *"Write a typescript function to build a Minimum Spanning Tree from an array of poles with lat/lon coordinates. Root the MST at the pole closest to the DT coordinates. Return a Map representing the parent relationships."*
