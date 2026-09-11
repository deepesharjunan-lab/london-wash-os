# The London Wash OS

Working prototype and architecture for The London Wash's laundry operating system (The Art of Laundry, Kerala).

## In this repo

- `london_wash_ui.html` — interactive UI working model (admin console, customer portal, driver app). In-memory demo data, no backend. Served at `/` on the live site.
- `london_wash_blueprint.html` — Technical Architecture Blueprint (Rev 1.2): tech stack, system architecture, database design, ADRs. Served at `/blueprint` on the live site.
- `london_wash_schema.sql` — Phase 2 database DDL: full PostgreSQL 16 schema (91 tables, 16 domains) generated from the blueprint. Applied to the project's Supabase database.

## Status

- Phase 0 (architecture blueprint) — approved
- UI working model — built, in review
- Phase 2 (database architecture) — schema live on Supabase
- Phase 1 (project foundation) and Phase 3 (auth/RBAC) — not started
