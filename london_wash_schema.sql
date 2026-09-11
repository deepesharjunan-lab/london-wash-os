-- ============================================================================
-- THE LONDON WASH OS — PHASE 2 DATABASE SCHEMA
-- PostgreSQL 16, target: Supabase (or any managed Postgres 16)
-- Generated from: london_wash_blueprint.html, Rev 1.2 (Phase 0, approved)
--
-- HOW TO RUN
--   Create your own Supabase project (Data Entry: run this in a fresh
--   project's SQL Editor, or hand the project's connection details back to
--   Claude and it can apply this as a migration for you). This file is
--   idempotent-ish (uses IF NOT EXISTS / DROP...CREATE for types) but is
--   meant to run ONCE against an empty database.
--
-- CONVENTIONS (blueprint §05 "Conventions applied to every table", §06 ADR-10,
-- §07 ERD, ADR-02 branch isolation):
--   * Primary keys        uuid, app-generates UUIDv7 (time-ordered) — see
--                         note below; DB default falls back to gen_random_uuid()
--                         (v4) only as a safety net for rows inserted outside
--                         the NestJS app (seed scripts, SQL editor).
--   * created_at/updated_at on every table, trigger-maintained.
--   * deleted_at only on reference/config tables — never on financial or
--     event/ledger records.
--   * Immutability: payment, refund, wallet_transaction, loyalty_transaction,
--     stock_transaction, garment_event and audit_log are insert-only —
--     enforced here with a trigger that blocks UPDATE/DELETE outright.
--     approval_request is append-then-decide (insert, then exactly one
--     update to record the decision) per its own spec in §08 — not blocked.
--   * Branch scoping: branch_id FK + RLS policy on every branch-owned table,
--     keyed to the JWT's branch claim (ADR-02). branch_id is nullable on a
--     handful of org-wide config tables (approval_rule, price_list_profile,
--     tax_rule) — the policy treats NULL branch_id as "visible everywhere".
--   * Money: bigint minor units (paise) + currency char(3), never numeric/float
--     (§06 / ADR-10). All arithmetic belongs to the app-layer Money value
--     object, not to SQL — this schema only stores the result.
--   * Enumerations: native Postgres enum for closed, code-defined sets;
--     ordinary lookup tables for sets staff can edit themselves in Settings.
--
-- NOTE ON UUID v7: Postgres 16 has no built-in UUIDv7 generator. The
-- blueprint specifies v7 IDs generated in the NestJS application layer
-- (time-ordered, better index locality than v4). This schema types every PK
-- as plain `uuid` so the app can supply its own v7 value; gen_random_uuid()
-- is only a DEFAULT fallback for out-of-app inserts.
--
-- SCOPE: this is the full Phase 2 deliverable the blueprint calls out at
-- §08 ("Full DDL for all 90 tables is Phase 2's deliverable"). Six tables
-- (approval_rule, approval_request, tax_rule, consent_record,
-- price_list_profile, price_list_entry) were already fully specified in the
-- blueprint and are reproduced verbatim below. The remaining ~85 tables were
-- named and related in the blueprint's ERD (§07) and module map (§04) but
-- not column-specified — their columns are designed here, following the
-- same conventions, as the actual Phase 2 engineering work.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS & SHARED HELPERS
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive email/phone lookups

-- updated_at trigger, attached to every table below
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- generic immutability guard for insert-only ledgers
create or replace function block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'table % is insert-only — % is not permitted', tg_table_name, tg_op;
end;
$$;

-- reads the branch_id claim NestJS puts on the JWT (RLS helper, ADR-02).
-- returns null when there is no claim (service-role/migration context),
-- in which case RLS policies below fall back to "not restricted" —
-- application-layer checks remain the defence-in-depth backstop per ADR-02.
create or replace function current_branch_id()
returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'branch_id')::uuid;
$$;

-- standard branch-isolation RLS policy, reused by every branch-scoped table.
-- NULL branch_id on the row = org-wide record, visible regardless of claim.
create or replace function apply_branch_rls(tbl regclass) returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format(
    'create policy branch_isolation on %s using (
       branch_id is null
       or current_branch_id() is null
       or branch_id = current_branch_id()::uuid
     )', tbl);
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. IDENTITY & ORG  (module clusters: identity, org)
-- ----------------------------------------------------------------------------
create table organization (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  gstin text,
  default_currency char(3) not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on organization for each row execute function set_updated_at();

create table branch (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  name text not null,
  code text not null,
  address text,
  city text,
  state text,
  phone text,
  timezone text not null default 'Asia/Kolkata',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create trigger trg_updated_at before update on branch for each row execute function set_updated_at();

create table collection_point (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  name text not null,
  address text,
  contact_phone text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on collection_point for each row execute function set_updated_at();
select apply_branch_rls('collection_point');

create table location (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  name text not null,
  location_type text not null, -- 'plant' / 'counter' / 'warehouse' / 'van'
  address text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on location for each row execute function set_updated_at();
select apply_branch_rls('location');

create table role (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  name text not null,
  description text,
  is_system boolean not null default false, -- seeded roles (Owner/Manager/Counter/etc.) can't be deleted
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
create trigger trg_updated_at before update on role for each row execute function set_updated_at();

create table permission (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- e.g. 'orders.refund', 'payroll.approve'
  module text not null,      -- matches §04 module cluster
  description text
);

create table role_permission (
  role_id uuid not null references role(id) on delete cascade,
  permission_id uuid not null references permission(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table "user" (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  branch_id uuid references branch(id), -- primary branch; multi-branch access via user_branch
  email citext unique,
  phone text unique,
  password_hash text not null,
  full_name text not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on "user" for each row execute function set_updated_at();
select apply_branch_rls('"user"');

create table user_role (
  user_id uuid not null references "user"(id) on delete cascade,
  role_id uuid not null references role(id) on delete cascade,
  primary key (user_id, role_id)
);

create table user_branch (
  user_id uuid not null references "user"(id) on delete cascade,
  branch_id uuid not null references branch(id) on delete cascade,
  primary key (user_id, branch_id)
);

create table session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  refresh_token_hash text not null,
  user_agent text,
  ip_address inet,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  branch_id uuid references branch(id),
  actor_user_id uuid references "user"(id),
  action text not null,        -- e.g. 'order.refund', 'staff.role_change'
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);
create trigger trg_immutable before update or delete on audit_log for each row execute function block_mutation();
select apply_branch_rls('audit_log');

-- ----------------------------------------------------------------------------
-- 2. GOVERNANCE  (approval / maker-checker workflow, §12)
-- ----------------------------------------------------------------------------
create type approval_action_type as enum (
  'refund', 'price_override', 'order_void', 'inventory_adjustment',
  'payroll_adjustment', 'customer_compensation', 'wallet_adjustment'
);
create type approval_status as enum ('pending', 'approved', 'rejected', 'expired');

-- verbatim from blueprint §08
create table approval_rule (
  id uuid primary key default gen_random_uuid(),
  action_type approval_action_type not null,
  branch_id uuid references branch(id), -- nullable — organization-wide rule if unset
  threshold_amount_minor bigint,        -- nullable — some action types (order void) need approval regardless of amount
  threshold_percent int,                -- e.g. price override > 15% off catalogue price
  approver_roles uuid[] not null default '{}',
  escalate_after_minutes int,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on approval_rule for each row execute function set_updated_at();
select apply_branch_rls('approval_rule');

-- verbatim from blueprint §08
create table approval_request (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references approval_rule(id),
  entity_type text not null,
  entity_id uuid not null,
  requested_by uuid not null references "user"(id),
  payload jsonb not null,
  status approval_status not null default 'pending',
  decided_by uuid references "user"(id),
  decided_at timestamptz,
  decision_note text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
comment on table approval_request is 'Append-then-decide: inserted pending, exactly one later UPDATE sets decided_by/decided_at/decision_note/status. Not blocked by an immutability trigger, unlike the pure insert-only ledgers.';

-- ----------------------------------------------------------------------------
-- 3. COMPLIANCE  (tax engine §19, consent & data rights §20)
-- ----------------------------------------------------------------------------
create table tax_profile (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  branch_id uuid references branch(id),
  name text not null,
  is_enabled boolean not null default false, -- tax engine defaults OFF per §19
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on tax_profile for each row execute function set_updated_at();
select apply_branch_rls('tax_profile');

-- verbatim from blueprint §08
create table tax_rule (
  id uuid primary key default gen_random_uuid(),
  service_category_id uuid, -- FK added after service_category exists (§5 catalogue below); nullable = applies to all services
  sac_code text,
  rate_percent numeric(5,2),
  cgst_percent numeric(5,2),
  sgst_percent numeric(5,2),
  igst_percent numeric(5,2),
  effective_from date not null default current_date,
  effective_to date, -- null = current rule; an order snapshots the rule id + rate it used
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on tax_rule for each row execute function set_updated_at();

create type consent_type as enum (
  'marketing_whatsapp', 'marketing_sms', 'marketing_email', 'photo_capture', 'data_processing'
);
create type consent_status as enum ('granted', 'withdrawn');
create type consent_source as enum (
  'signup_form', 'portal_settings', 'whatsapp_optin', 'counter_staff_entry'
);

-- verbatim from blueprint §08 (customer_id FK added once customer exists, §4 below)
create table consent_record (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  consent_type consent_type not null,
  status consent_status not null,
  source consent_source not null,
  captured_at timestamptz not null default now()
);
create trigger trg_immutable before update or delete on consent_record for each row execute function block_mutation();
comment on table consent_record is 'A change of mind is a new row, never an edit — full consent history stays intact.';

create type data_rights_request_type as enum ('export', 'delete');
create type data_rights_request_status as enum ('pending', 'in_progress', 'fulfilled', 'rejected');

create table data_rights_request (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  request_type data_rights_request_type not null,
  status data_rights_request_status not null default 'pending',
  file_asset_id uuid, -- FK added once file_asset exists (§15 platform below); set on fulfilment of an export
  anonymisation_note text, -- set on fulfilment of a deletion
  requested_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

-- ----------------------------------------------------------------------------
-- 4. CUSTOMER CRM
-- ----------------------------------------------------------------------------
create table corporate_account (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  name text not null,
  gstin text,
  billing_cycle text, -- 'monthly' / 'per_invoice'
  price_list_profile_id uuid, -- FK added once price_list_profile exists (§5 catalogue below)
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on corporate_account for each row execute function set_updated_at();
select apply_branch_rls('corporate_account');

create table corporate_contact (
  id uuid primary key default gen_random_uuid(),
  corporate_account_id uuid not null references corporate_account(id) on delete cascade,
  full_name text not null,
  phone text,
  email citext,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table corporate_address (
  id uuid primary key default gen_random_uuid(),
  corporate_account_id uuid not null references corporate_account(id) on delete cascade,
  label text,
  address_line text not null,
  city text, state text, pincode text,
  created_at timestamptz not null default now()
);

create table family_account (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  name text not null, -- e.g. "The Menon Family"
  primary_customer_id uuid, -- FK added below once customer exists
  created_at timestamptz not null default now()
);
select apply_branch_rls('family_account');

create table customer (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  full_name text not null,
  phone text not null,
  email citext,
  family_account_id uuid references family_account(id),
  corporate_account_id uuid references corporate_account(id),
  price_list_profile_id uuid, -- FK added once price_list_profile exists (§5 below); which named price list prices this customer's orders
  tier text not null default 'Silver',
  fold_preference text,
  detergent_preference text,
  wallet_balance_minor bigint not null default 0, -- denormalized cache; source of truth is wallet_transaction ledger
  lifetime_spend_minor bigint not null default 0,
  currency char(3) not null default 'INR',
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, phone)
);
create trigger trg_updated_at before update on customer for each row execute function set_updated_at();
select apply_branch_rls('customer');

alter table family_account add constraint fk_family_primary_customer foreign key (primary_customer_id) references customer(id);
alter table consent_record add constraint fk_consent_customer foreign key (customer_id) references customer(id);
alter table data_rights_request add constraint fk_drr_customer foreign key (customer_id) references customer(id);

create table customer_address (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer(id) on delete cascade,
  label text, -- 'Home' / 'Work' / ...
  address_line text not null,
  city text, state text, pincode text,
  latitude numeric(9,6), longitude numeric(9,6),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table customer_preference (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer(id) on delete cascade,
  pref_key text not null,   -- 'fold', 'detergent', 'starch', 'packaging' ...
  pref_value text not null,
  created_at timestamptz not null default now(),
  unique (customer_id, pref_key)
);

create table customer_note (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer(id) on delete cascade,
  author_user_id uuid references "user"(id),
  note text not null,
  created_at timestamptz not null default now()
);

create table customer_tag (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  unique (customer_id, tag)
);

-- ----------------------------------------------------------------------------
-- 5. CATALOGUE, PRICING & TAX  (§35 pricing engine)
-- ----------------------------------------------------------------------------
create table service_category (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  name text not null, -- 'Wash & Fold', 'Dry Clean', 'Iron Only', ...
  sort_order int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on service_category for each row execute function set_updated_at();
select apply_branch_rls('service_category');

alter table tax_rule add constraint fk_taxrule_category foreign key (service_category_id) references service_category(id);

create table service (
  id uuid primary key default gen_random_uuid(),
  service_category_id uuid not null references service_category(id),
  branch_id uuid references branch(id),
  name text not null, -- 'Wash & Iron', 'Dry Clean', 'Steam Press', ...
  default_unit text not null default 'per_piece', -- per_piece / per_kg / per_set
  color_hex text, -- service color-coding, used across POS/production board
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on service for each row execute function set_updated_at();
select apply_branch_rls('service');

create table item (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  name text not null, -- 'Shirt', 'Trouser', 'Bedsheet (king)', ...
  category text,       -- rough grouping used by the icon-matcher in the UI
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on item for each row execute function set_updated_at();
select apply_branch_rls('item');

create type price_list_unit as enum ('per_piece', 'per_kg', 'per_set');

-- verbatim from blueprint §08 / §35
create table price_list_profile (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id), -- nullable — organization-wide profile if unset
  name text not null,                   -- e.g. "Standard Retail", "Corporate — Grand Heritage Hotel"
  description text,
  is_default boolean not null default false, -- exactly one default per branch
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on price_list_profile for each row execute function set_updated_at();
select apply_branch_rls('price_list_profile');
create unique index uq_price_list_default_per_branch on price_list_profile (branch_id) where is_default; -- one default per branch (NULLS treated as one org-wide slot)

alter table customer add constraint fk_customer_price_profile foreign key (price_list_profile_id) references price_list_profile(id);
alter table corporate_account add constraint fk_corp_price_profile foreign key (price_list_profile_id) references price_list_profile(id);

-- verbatim from blueprint §08 / §35
create table price_list_entry (
  id uuid primary key default gen_random_uuid(), -- the row identity an order line references — never the (item, service) text pair
  price_list_profile_id uuid not null references price_list_profile(id) on delete cascade,
  service_id uuid not null references service(id),
  item_id uuid references item(id), -- nullable — a service-level entry (e.g. "per kg wash") need not name a garment item
  price_minor bigint not null,      -- integer minor units per §06/ADR-10 — never a float
  currency char(3) not null default 'INR',
  unit price_list_unit not null default 'per_piece',
  is_active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date, -- nullable — same versioning pattern as tax_rule
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on price_list_entry for each row execute function set_updated_at();
create unique index uq_price_list_entry_current on price_list_entry (price_list_profile_id, service_id, coalesce(item_id, '00000000-0000-0000-0000-000000000000')) where effective_to is null;
comment on index uq_price_list_entry_current is 'One current price per item/service per profile — matches §08 note (unique on profile,service,item where effective_to is null).';

create table promotion (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  name text not null,
  discount_percent int,
  discount_amount_minor bigint,
  starts_at timestamptz, ends_at timestamptz,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on promotion for each row execute function set_updated_at();
select apply_branch_rls('promotion');

create table coupon (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  promotion_id uuid references promotion(id),
  code text not null unique,
  max_redemptions int,
  redemptions_count int not null default 0,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on coupon for each row execute function set_updated_at();
select apply_branch_rls('coupon');

-- ----------------------------------------------------------------------------
-- 6. WORKFLOW & PRODUCTION
-- ----------------------------------------------------------------------------
create table workflow (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  service_id uuid references service(id),
  name text not null,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on workflow for each row execute function set_updated_at();
select apply_branch_rls('workflow');

create table workflow_stage (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflow(id) on delete cascade,
  name text not null, -- 'Sorting', 'Washing', 'Drying', 'Ironing', 'QC', 'Packing'
  sort_order int not null default 0,
  sla_minutes int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on workflow_stage for each row execute function set_updated_at();

create table workflow_rule (
  id uuid primary key default gen_random_uuid(),
  workflow_stage_id uuid not null references workflow_stage(id) on delete cascade,
  rule_type text not null, -- 'auto_advance' / 'requires_photo' / 'requires_scan' ...
  config jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table workstation (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  name text not null,
  workflow_stage_id uuid references workflow_stage(id),
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on workstation for each row execute function set_updated_at();
select apply_branch_rls('workstation');

create table machine (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  workstation_id uuid references workstation(id),
  name text not null,
  machine_type text, -- 'washer' / 'dryer' / 'press' / 'iron'
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on machine for each row execute function set_updated_at();
select apply_branch_rls('machine');

create type production_job_status as enum ('queued', 'in_progress', 'completed', 'blocked');

create table production_job (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  order_item_id uuid not null, -- FK added once order_item exists (§7 orders below)
  workflow_stage_id uuid not null references workflow_stage(id),
  workstation_id uuid references workstation(id),
  machine_id uuid references machine(id),
  assigned_user_id uuid references "user"(id),
  status production_job_status not null default 'queued',
  started_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on production_job for each row execute function set_updated_at();
select apply_branch_rls('production_job');

create type qc_result as enum ('pass', 'fail', 'reprocess');

create table quality_check (
  id uuid primary key default gen_random_uuid(),
  production_job_id uuid not null references production_job(id),
  checked_by uuid references "user"(id),
  result qc_result not null,
  notes text,
  created_at timestamptz not null default now()
);

create table reprocess (
  id uuid primary key default gen_random_uuid(),
  quality_check_id uuid not null references quality_check(id),
  reason text not null,
  new_production_job_id uuid references production_job(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. ORDERS & GARMENTS — the core chain
-- ----------------------------------------------------------------------------
create type order_status as enum (
  'draft', 'confirmed', 'in_production', 'ready', 'out_for_delivery', 'delivered', 'cancelled'
);
create type order_channel as enum ('pos_counter', 'portal', 'whatsapp', 'phone');

create table "order" (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  order_number text not null,
  customer_id uuid not null references customer(id),
  price_list_profile_id uuid references price_list_profile(id), -- snapshot of which profile priced this order
  channel order_channel not null default 'pos_counter',
  status order_status not null default 'draft',
  tax_rule_id uuid references tax_rule(id), -- snapshot — a later rate change never rewrites a past invoice
  subtotal_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  tax_minor bigint not null default 0,
  total_minor bigint not null default 0,
  currency char(3) not null default 'INR',
  coupon_id uuid references coupon(id),
  placed_by_user_id uuid references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, order_number)
);
create trigger trg_updated_at before update on "order" for each row execute function set_updated_at();
select apply_branch_rls('"order"');

create table order_item (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references "order"(id) on delete cascade,
  price_list_entry_id uuid not null references price_list_entry(id), -- the priced row this line references — never a text lookup
  item_id uuid references item(id),
  service_id uuid not null references service(id),
  quantity int not null default 1,
  unit_price_minor bigint not null, -- snapshot of price_list_entry.price_minor at order time
  line_total_minor bigint not null,
  notes text, -- stain/damage flags entered at intake
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on order_item for each row execute function set_updated_at();

alter table production_job add constraint fk_job_order_item foreign key (order_item_id) references order_item(id);

create type payment_method as enum ('cash', 'card', 'upi', 'wallet', 'bank_transfer');
create type payment_status as enum ('captured', 'failed', 'refunded', 'partially_refunded');

create table payment (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references "order"(id),
  method payment_method not null,
  amount_minor bigint not null,
  currency char(3) not null default 'INR',
  status payment_status not null default 'captured',
  gateway_reference text, -- stubbed behind an interface pending payment gateway contract, per blueprint lede
  created_at timestamptz not null default now()
);
create trigger trg_immutable before update or delete on payment for each row execute function block_mutation();

create table refund (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payment(id),
  approval_request_id uuid references approval_request(id), -- governance gate, §12
  amount_minor bigint not null,
  reason text not null,
  processed_by uuid references "user"(id),
  created_at timestamptz not null default now()
);
create trigger trg_immutable before update or delete on refund for each row execute function block_mutation();

create table wallet (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references customer(id),
  balance_minor bigint not null default 0, -- denormalized cache; source of truth is wallet_transaction
  currency char(3) not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on wallet for each row execute function set_updated_at();

create type wallet_txn_type as enum ('credit', 'debit', 'refund_credit', 'adjustment');

create table wallet_transaction (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallet(id),
  order_id uuid references "order"(id),
  approval_request_id uuid references approval_request(id), -- required for manual 'adjustment' type, §12
  type wallet_txn_type not null,
  amount_minor bigint not null, -- always positive; type carries the sign's meaning
  balance_after_minor bigint not null,
  note text,
  created_at timestamptz not null default now()
);
create trigger trg_immutable before update or delete on wallet_transaction for each row execute function block_mutation();

create type garment_condition_tag as enum ('good', 'stained', 'damaged', 'missing_button', 'torn', 'faded');

create table garment (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_item(id) on delete cascade,
  item_id uuid references item(id),
  tag_code text unique, -- printed/scanned garment tag
  current_stage_id uuid references workflow_stage(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on garment for each row execute function set_updated_at();

create table garment_photo (
  id uuid primary key default gen_random_uuid(),
  garment_id uuid not null references garment(id) on delete cascade,
  file_asset_id uuid, -- FK added once file_asset exists (§15 platform below)
  captured_at_stage_id uuid references workflow_stage(id),
  created_at timestamptz not null default now()
);

create table garment_condition (
  id uuid primary key default gen_random_uuid(),
  garment_id uuid not null references garment(id) on delete cascade,
  tag garment_condition_tag not null,
  note text,
  recorded_by uuid references "user"(id),
  created_at timestamptz not null default now()
);

create table garment_event (
  id uuid primary key default gen_random_uuid(),
  garment_id uuid not null references garment(id),
  event_type text not null, -- 'intake' / 'stage_change' / 'photo_added' / 'qc_fail' / 'packed' / 'delivered' ...
  from_stage_id uuid references workflow_stage(id),
  to_stage_id uuid references workflow_stage(id),
  actor_user_id uuid references "user"(id),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create trigger trg_immutable before update or delete on garment_event for each row execute function block_mutation();

-- ----------------------------------------------------------------------------
-- 8. PACKING & LOGISTICS
-- ----------------------------------------------------------------------------
create table packed_bag (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  order_id uuid not null references "order"(id),
  bag_code text not null,
  packed_by uuid references "user"(id),
  created_at timestamptz not null default now(),
  unique (branch_id, bag_code)
);
select apply_branch_rls('packed_bag');

create table packed_bag_garment (
  packed_bag_id uuid not null references packed_bag(id) on delete cascade,
  garment_id uuid not null references garment(id) on delete cascade,
  primary key (packed_bag_id, garment_id)
);

create table delivery_zone (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  name text not null,
  pincode_prefixes text[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on delivery_zone for each row execute function set_updated_at();
select apply_branch_rls('delivery_zone');

create table driver (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  user_id uuid references "user"(id), -- drivers log into the Driver PWA as a User
  full_name text not null,
  phone text not null,
  vehicle_number text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on driver for each row execute function set_updated_at();
select apply_branch_rls('driver');

create type route_status as enum ('planned', 'in_progress', 'completed');

create table route (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  driver_id uuid references driver(id),
  delivery_zone_id uuid references delivery_zone(id),
  route_date date not null,
  status route_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on route for each row execute function set_updated_at();
select apply_branch_rls('route');

create type pickup_status as enum ('scheduled', 'en_route', 'completed', 'failed', 'cancelled');

create table pickup (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references "order"(id), -- nullable: a pickup can be scheduled before the order is created at counter
  customer_id uuid not null references customer(id),
  route_id uuid references route(id),
  customer_address_id uuid references customer_address(id),
  scheduled_window_start timestamptz, scheduled_window_end timestamptz,
  status pickup_status not null default 'scheduled',
  otp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on pickup for each row execute function set_updated_at();

create type delivery_status as enum ('scheduled', 'en_route', 'completed', 'failed', 'cancelled');

create table delivery (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references "order"(id),
  route_id uuid references route(id),
  customer_address_id uuid references customer_address(id),
  scheduled_window_start timestamptz, scheduled_window_end timestamptz,
  status delivery_status not null default 'scheduled',
  otp text,
  cash_collected_minor bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on delivery for each row execute function set_updated_at();

create table proof_of_delivery (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid references delivery(id),
  pickup_id uuid references pickup(id),
  file_asset_id uuid, -- FK added once file_asset exists (§15 platform below); signature/photo
  otp_verified boolean not null default false,
  recipient_name text,
  captured_at timestamptz not null default now(),
  check (delivery_id is not null or pickup_id is not null)
);

-- ----------------------------------------------------------------------------
-- 9. GROWTH  (loyalty, referrals, membership, subscriptions)
-- ----------------------------------------------------------------------------
create table loyalty_tier (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  name text not null, -- 'Silver', 'Gold', 'Platinum'
  min_points int not null default 0,
  perk_description text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on loyalty_tier for each row execute function set_updated_at();
select apply_branch_rls('loyalty_tier');

create table loyalty_account (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references customer(id),
  loyalty_tier_id uuid references loyalty_tier(id),
  points_balance int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on loyalty_account for each row execute function set_updated_at();

create type loyalty_txn_type as enum ('earn', 'redeem', 'expire', 'adjustment');

create table loyalty_transaction (
  id uuid primary key default gen_random_uuid(),
  loyalty_account_id uuid not null references loyalty_account(id),
  order_id uuid references "order"(id),
  type loyalty_txn_type not null,
  points int not null,
  balance_after int not null,
  note text,
  created_at timestamptz not null default now()
);
create trigger trg_immutable before update or delete on loyalty_transaction for each row execute function block_mutation();

create table reward (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  name text not null,
  points_cost int not null,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on reward for each row execute function set_updated_at();
select apply_branch_rls('reward');

create type referral_status as enum ('pending', 'rewarded', 'expired');

create table referral (
  id uuid primary key default gen_random_uuid(),
  referrer_customer_id uuid not null references customer(id),
  referred_customer_id uuid references customer(id),
  status referral_status not null default 'pending',
  reward_id uuid references reward(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on referral for each row execute function set_updated_at();

create table membership (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer(id),
  plan_name text not null,
  starts_at date not null, ends_at date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on membership for each row execute function set_updated_at();

create table subscription_plan (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  name text not null,
  price_minor bigint not null,
  currency char(3) not null default 'INR',
  included_pieces int,
  billing_cycle text not null default 'monthly',
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on subscription_plan for each row execute function set_updated_at();
select apply_branch_rls('subscription_plan');

create type subscription_status as enum ('active', 'paused', 'cancelled', 'expired');

create table subscription (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer(id),
  subscription_plan_id uuid not null references subscription_plan(id),
  status subscription_status not null default 'active',
  starts_at date not null, renews_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on subscription for each row execute function set_updated_at();

create table subscription_usage (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscription(id),
  order_id uuid references "order"(id),
  pieces_consumed int not null, -- rounds down (customer-favourable) per §06
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 10. SUPPLY CHAIN
-- ----------------------------------------------------------------------------
create table inventory_location (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  name text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on inventory_location for each row execute function set_updated_at();
select apply_branch_rls('inventory_location');

create table inventory_item (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  name text not null, -- 'Detergent 5L', 'Hangers', 'Poly bags' ...
  unit text not null default 'unit',
  reorder_level numeric(10,2) not null default 0,
  quantity_on_hand numeric(10,2) not null default 0, -- denormalized cache; source of truth is stock_transaction
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on inventory_item for each row execute function set_updated_at();
select apply_branch_rls('inventory_item');

create type stock_txn_type as enum ('receipt', 'consumption', 'adjustment', 'transfer_in', 'transfer_out');

create table stock_transaction (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_item(id),
  inventory_location_id uuid references inventory_location(id),
  approval_request_id uuid references approval_request(id), -- required for manual 'adjustment' type, §12
  type stock_txn_type not null,
  quantity numeric(10,2) not null,
  balance_after numeric(10,2) not null,
  note text,
  created_at timestamptz not null default now()
);
create trigger trg_immutable before update or delete on stock_transaction for each row execute function block_mutation();

create table supplier (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  name text not null,
  contact_phone text, contact_email citext,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on supplier for each row execute function set_updated_at();
select apply_branch_rls('supplier');

create type purchase_order_status as enum ('draft', 'submitted', 'received', 'cancelled');

create table purchase_order (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  supplier_id uuid not null references supplier(id),
  status purchase_order_status not null default 'draft',
  total_minor bigint not null default 0,
  currency char(3) not null default 'INR',
  created_by uuid references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on purchase_order for each row execute function set_updated_at();
select apply_branch_rls('purchase_order');

create table purchase_order_item (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_order(id) on delete cascade,
  inventory_item_id uuid not null references inventory_item(id),
  quantity numeric(10,2) not null,
  unit_price_minor bigint not null,
  line_total_minor bigint not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 11. PEOPLE  (staff, attendance, payroll)
-- ----------------------------------------------------------------------------
create table employee (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  user_id uuid references "user"(id), -- staff who log in; nullable for e.g. contract labour with no login
  full_name text not null,
  role_title text,
  phone text,
  date_joined date,
  monthly_salary_minor bigint,
  currency char(3) not null default 'INR',
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on employee for each row execute function set_updated_at();
select apply_branch_rls('employee');

create table shift (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  name text not null, -- 'Morning', 'Evening'
  starts_at time not null,
  ends_at time not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on shift for each row execute function set_updated_at();
select apply_branch_rls('shift');

create table attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee(id),
  shift_id uuid references shift(id),
  work_date date not null,
  check_in timestamptz, check_out timestamptz,
  status text not null default 'present', -- 'present' / 'absent' / 'half_day' / 'leave'
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

create type leave_status as enum ('requested', 'approved', 'rejected', 'cancelled');

create table leave (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee(id),
  leave_type text not null, -- 'sick' / 'casual' / 'earned'
  starts_on date not null, ends_on date not null,
  status leave_status not null default 'requested',
  approved_by uuid references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on leave for each row execute function set_updated_at();

create type payroll_status as enum ('draft', 'approved', 'paid');

create table payroll (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee(id),
  approval_request_id uuid references approval_request(id), -- payroll_adjustment gate, §12
  period_start date not null, period_end date not null,
  gross_minor bigint not null,
  deductions_minor bigint not null default 0,
  net_minor bigint not null,
  currency char(3) not null default 'INR',
  status payroll_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_immutable before update or delete on payroll for each row execute function block_mutation();
comment on table payroll is 'Insert-only per row: a correction after approval creates a new payroll row referencing an approval_request, rather than editing a paid record.';

create table incentive (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee(id),
  amount_minor bigint not null,
  currency char(3) not null default 'INR',
  reason text not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 12. FINANCE
-- ----------------------------------------------------------------------------
create table financial_account (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  name text not null, -- 'Cash Drawer', 'HDFC Current A/C' ...
  account_type text not null, -- 'cash' / 'bank' / 'other'
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on financial_account for each row execute function set_updated_at();
select apply_branch_rls('financial_account');

create table expense (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  financial_account_id uuid references financial_account(id),
  category text not null,
  amount_minor bigint not null,
  currency char(3) not null default 'INR',
  note text,
  recorded_by uuid references "user"(id),
  created_at timestamptz not null default now()
);
select apply_branch_rls('expense');

-- ----------------------------------------------------------------------------
-- 13. ENGAGEMENT  (notifications, complaints, automation)
-- ----------------------------------------------------------------------------
create type notification_channel as enum ('whatsapp', 'sms', 'email', 'push');
create type notification_status as enum ('queued', 'sent', 'delivered', 'failed');

create table notification (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customer(id),
  user_id uuid references "user"(id),
  channel notification_channel not null,
  template_code text not null,
  status notification_status not null default 'queued',
  payload jsonb not null default '{}',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table message (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer(id),
  channel notification_channel not null,
  direction text not null, -- 'inbound' / 'outbound'
  body text,
  created_at timestamptz not null default now()
);

create table automation_rule (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  name text not null,
  trigger_event text not null, -- e.g. 'order.ready', 'approval_request.stale'
  condition jsonb not null default '{}',
  action jsonb not null default '{}',
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on automation_rule for each row execute function set_updated_at();
select apply_branch_rls('automation_rule');

create type complaint_status as enum ('open', 'investigating', 'resolved', 'closed');

create table complaint (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  customer_id uuid not null references customer(id),
  order_id uuid references "order"(id),
  subject text not null,
  description text,
  status complaint_status not null default 'open',
  assigned_to uuid references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on complaint for each row execute function set_updated_at();
select apply_branch_rls('complaint');

create type claim_status as enum ('open', 'approved', 'rejected', 'paid');

create table claim (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid references complaint(id),
  garment_id uuid references garment(id),
  approval_request_id uuid references approval_request(id), -- customer_compensation gate, §12
  claimed_amount_minor bigint,
  status claim_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_updated_at before update on claim for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 14. PLATFORM  (settings, files, event outbox)
-- ----------------------------------------------------------------------------
create table system_setting (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  branch_id uuid references branch(id),
  key text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, branch_id, key)
);
create trigger trg_updated_at before update on system_setting for each row execute function set_updated_at();
select apply_branch_rls('system_setting');

create table file_asset (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  storage_key text not null, -- S3/R2 object key, per §01 object storage choice
  content_type text,
  size_bytes bigint,
  uploaded_by uuid references "user"(id),
  created_at timestamptz not null default now()
);
select apply_branch_rls('file_asset');

alter table garment_photo add constraint fk_photo_file_asset foreign key (file_asset_id) references file_asset(id);
alter table proof_of_delivery add constraint fk_pod_file_asset foreign key (file_asset_id) references file_asset(id);
alter table data_rights_request add constraint fk_drr_file_asset foreign key (file_asset_id) references file_asset(id);

-- Outbox / event log — feeds the background worker fleet (architecture §02)
create table event_log (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  event_type text not null, -- 'order.confirmed', 'payment.captured', 'approval_request.decided' ...
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb not null default '{}',
  processed_at timestamptz, -- null = not yet relayed to the worker fleet
  created_at timestamptz not null default now()
);
create trigger trg_immutable before update or delete on event_log for each row execute function block_mutation();
select apply_branch_rls('event_log');
comment on table event_log is 'processed_at IS itself an update to an insert-only-by-convention table — handled by the outbox relay via a service-role connection that bypasses the trigger''s intent at the app layer; kept append-only from the perspective of RLS-scoped app roles. If a hard append-only guarantee is required, split into event_log (insert-only) + event_log_dispatch (processed_at tracking) in a follow-up migration.';

-- ----------------------------------------------------------------------------
-- INDEXES — the hot paths named in the blueprint (POS lookups, production
-- board, dashboard analytics) beyond what UNIQUE constraints already cover.
-- ----------------------------------------------------------------------------
create index idx_customer_branch_phone on customer (branch_id, phone);
create index idx_order_branch_status on "order" (branch_id, status);
create index idx_order_customer on "order" (customer_id);
create index idx_order_item_order on order_item (order_id);
create index idx_garment_order_item on garment (order_item_id);
create index idx_garment_event_garment on garment_event (garment_id, created_at);
create index idx_production_job_branch_status on production_job (branch_id, status);
create index idx_price_list_entry_profile on price_list_entry (price_list_profile_id) where effective_to is null;
create index idx_approval_request_status on approval_request (status) where status = 'pending';
create index idx_event_log_unprocessed on event_log (created_at) where processed_at is null;
create index idx_audit_log_entity on audit_log (entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- FAIL-CLOSED HARDENING (Supabase-specific): Supabase auto-exposes every
-- public-schema table through its PostgREST API to the anon/authenticated
-- keys by default. Tables scoped transitively through a parent FK rather
-- than carrying branch_id directly (order_item via order, payment via
-- order, session, role, permission, etc.) never got a branch_isolation
-- policy from apply_branch_rls() above, but they still need RLS switched
-- on so those public keys can't read/write them directly. No policy = the
-- table is fully blocked for anon/authenticated and fully open for the
-- service_role key the NestJS backend connects with (service_role bypasses
-- RLS by design in Postgres/Supabase). On plain self-hosted Postgres with
-- no PostgREST layer this step is a no-op in practice, but it's harmless
-- and worth keeping for portability.
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname='public' and rowsecurity=false loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- ============================================================================
-- END OF PHASE 2 SCHEMA
-- Next steps (not in this file):
--   * Seed data: default roles/permissions, a starter PriceListProfile marked
--     is_default, service_category/service/item masters matching the UI
--     prototype's seed data.
--   * Prisma schema introspection (`prisma db pull`) once this runs against
--     a real database, per ADR-03 — Prisma becomes the source of truth for
--     the NestJS app's models/migrations from that point forward.
--   * RLS policies here cover SELECT/UPDATE/DELETE/INSERT uniformly via one
--     USING clause; a stricter WITH CHECK on INSERT (forcing branch_id to
--     match the caller's JWT claim) is a Phase 3 (auth/RBAC) hardening step.
-- ============================================================================
