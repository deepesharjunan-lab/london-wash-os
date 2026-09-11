# The London Wash OS

Laundry operating system for The Art of Laundry, Kerala. A single Next.js 14 app (App Router) with Server Actions, talking directly to Supabase (Postgres + Auth).

## Stack

- Next.js 14, React 18, TypeScript
- Tailwind CSS (custom Modernist theme)
- Supabase Postgres + Supabase Auth (@supabase/ssr, cookie-based sessions)
- Row Level Security on every table (branch-scoped policies, fail-closed elsewhere)
- Hosted on Vercel, deployed from this repo

## Project layout

- app/login - staff sign-in page (email + password against Supabase Auth)
- app/(app) - authenticated shell (sidebar, header, sign-out) wrapping every internal page
- app/(app)/dashboard - live KPI dashboard (revenue, orders, garments, AOV over the last 30 days)
- lib/supabase - browser and server Supabase client factories
- middleware.ts - session refresh and auth gate
- london_wash_schema.sql - full Phase 2 database DDL (91 tables across 16 domains)
- london_wash_blueprint.html - the approved technical architecture blueprint

## Environment variables

Copy .env.example to .env.local and fill in:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable key)

## Status

This is a live, in-progress build. Stage 1 (auth + dashboard shell) is complete. Remaining admin pages (Orders, Customers, POS, Production, QC, Packing & Dispatch, Inventory, Staff, Approvals, Settings, Wallet, Loyalty, Price Lists), the Customer Portal, and the Driver App are being added incrementally.

<!-- trigger first Vercel build from connected Git repo -->
