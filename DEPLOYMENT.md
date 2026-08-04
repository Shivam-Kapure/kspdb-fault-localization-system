# 🚀 GridGuard Deployment Guide

This document describes how to deploy GridGuard locally for evaluation or on cloud hosting providers.

---

## 1. Prerequisites
Ensure you have the following installed on your host machine:
*   **Docker Desktop** (version 20.10 or higher) with support for Compose v2.
*   **Node.js 18.x** (optional, only required if running outside Docker).

---

## 2. Local Docker Deployment (Recommended)
This brings up the database, Express backend, and React frontend in separate containers.

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/Shivam-Kapure/kspdb-fault-localization-system.git
    cd kspdb-fault-localization-system
    ```
2.  **Launch the Services:**
    ```bash
    docker compose up --build
    ```
3.  **Verify the Services:**
    *   **Postgres Database:** Boots on port `5432` and completes the schema setup.
    *   **Backend API:** Boots on port `3000`. You will see `Grid Guard Backend running on port 3000` in the logs.
    *   **React Frontend:** Boots on port `5173`. You can open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 3. Environment Variables

We ship the application with safe defaults inside `docker-compose.yml` so that no manual configuration is required for evaluation.

### Backend Configurations (`backend/.env`)
| Variable | Description | Default / Example | Required |
|---|---|---|---|
| `PORT` | Express server port | `3000` | No |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://griduser:gridpassword@db:5432/gridguard` | Yes |
| `NODE_ENV` | Environment mode | `development` / `production` | No |

### Frontend Configurations (`frontend/.env`)
| Variable | Description | Default / Example | Required |
|---|---|---|---|
| `VITE_API_URL` | Backend URL for API calls | `http://localhost:3000` | Yes |

---

## 4. Cloud Deployment (Production)

To deploy this in production (e.g. Render, Railway, or AWS):
1.  **Database:** Provision a managed PostgreSQL instance and run the init SQL (`backend/src/db/init.ts` handles this automatically on server start!).
2.  **Backend:** Deploy the backend container. Set the `DATABASE_URL` environment variable to the managed DB connection string.
3.  **Frontend:** Deploy the frontend container (or build static assets `npm run build` and host them on a CDN/Vercel/Netlify). Set the `VITE_API_URL` to your production backend URL.

---

## 5. Troubleshooting Log

During development and testing, we encountered and resolved the following issues:

### A. Database Connection Race Condition
*   **Symptom:** Backend container crashed on startup with `ECONNREFUSED` because it attempted to run migrations before Postgres had fully initialized.
*   **Fix:** Added a `healthcheck` to the Postgres container in `docker-compose.yml` using `pg_isready`, and configured the backend service to wait on it:
    ```yaml
    depends_on:
      db:
        condition: service_healthy
    ```

### B. Port Conflict
*   **Symptom:** Server failed to bind to port `5432` or `3000` because local instances of Postgres or Node were running on the host machine.
*   **Fix:** Stop local postgres service (`sudo service postgresql stop` on Linux/macOS or stopping the service in Windows Services panel) or map host ports to alternative open ports in `docker-compose.yml`.

### C. CORS Errors in Browser
*   **Symptom:** Leaflet map loaded, but tickets/telemetry failed with `CORS policy blocked request`.
*   **Fix:** Enabled `cors` middleware in `backend/src/index.ts` with credentials and open origins for local development.

### D. Cold-Start Latency
*   **Symptom:** The public live URL takes up to 50 seconds to open on free hosting tiers (e.g. Render Web Services).
*   **Fix:** This is a limitation of free tiers spin-down. Please allow 1-2 minutes for the backend service to awake from its idle sleep state.

---

## 6. How to Reset to Clean State
To wipe all telemetry data, clear faults, and re-run database seeding from scratch, run:
```bash
docker compose down -v
docker compose up --build
```
The `-v` flag removes the Postgres volume, forcing a clean initialization on next start.
