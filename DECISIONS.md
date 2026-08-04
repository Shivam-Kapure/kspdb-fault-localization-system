# 🏛️ Architectural Decisions Log

This document records the key architectural choices, rejected alternatives, and assumptions made during the design of GridGuard.

---

## 1. Major Trade-offs & Decisions

### A. Graph Database (Neo4j) vs. Relational Database (PostgreSQL)
*   **Decision:** PostgreSQL 15.
*   **Rejected:** Neo4j or other graph-dedicated databases.
*   **Rationale:** While the power grid is inherently a graph structure, deploying a graph database adds significant container footprint and operational complexity. PostgreSQL handles the hierarchical tree structure easily using standard self-referential relationships (`parent_pole_id`). By index-optimizing our tables, we achieve sub-millisecond tree traversals for each transformer without the overhead of Neo4j.

### B. Redis vs. In-Memory Process Caching
*   **Decision:** Node.js process cache (in-memory Maps).
*   **Rejected:** Redis.
*   **Rationale:** High-throughput telemetry ingestion (500 msg/s) requires fast device-to-pole mapping. Querying Redis or Postgres for every packet introduces network and serialization overhead. Since the physical layout of the grid is static, pre-loading the mapping into an in-memory Map at backend startup is extremely fast, safe, and cost-efficient.

### C. Spatial Minimum Spanning Tree (MST) vs. Flat Geographic Clustering
*   **Decision:** Prim's MST with Haversine distance weights.
*   **Rejected:** K-Means clustering.
*   **Rationale:** For the 60% of transformers missing tree topology in the database, flat geographic clustering only tells us which poles are near a transformer, but does not construct a hierarchy. An MST is the closest mathematical model of physical distribution lines because power grids are optimized to minimize cable/conductor routing. The MST outputs parent-child edges, allowing our tree-walking algorithm to localize span faults on missing topology grids.

### D. Deterministic Template compiler vs. Generative LLM (OpenAI/Anthropic) for Dispatch Briefs
*   **Decision:** Compiled rules-based template briefs.
*   **Rejected:** Live OpenAI API integrations.
*   **Rationale:** Calling OpenAI for every generated ticket adds significant network latency (1-3 seconds), variable API usage costs, and the risk of rate-limits or hallucinations in high-stress operational control rooms. Our rules-based templates compile incident briefs instantly, for free, with 100% precision.

---

## 2. Assumptions Made

1.  **Late Packets & Jitter:** We assume that packets can arrive out-of-order due to cell tower jitter. Our SQL queries use `ORDER BY ts DESC` to ensure the latest physical state is always evaluated, regardless of arrival order.
2.  **Sequence Resets:** We assume that device reboots reset the sequence number (`seq = 1`). We handle this by verifying the event type (`event = 'boot'`) to reset our sequence check logic.
3.  **Dead Sensors:** We assume that if a single leaf pole reports power loss but its parent node is live, it represents a sensor failure (dead battery or transmitter glitch) rather than a physical span break. We filter this out to prevent false alarms.

---

## 3. What We Would Build with 2 More Weeks

1.  **WebSocket Push:** Transition from 2-second HTTP polling to WebSockets for real-time, push-based console updates.
2.  **Predictive Maintenance:** Use telemetry features like `battery_mv` decay rates and RSSI signal degradation to flag failing equipment before they trigger full outages.
3.  **Feeder Branch Analysis:** Extend tree walking from single transformers to the entire feeder level, allowing auto-identification of complex multi-transformer outages caused by main line conductor snaps.
