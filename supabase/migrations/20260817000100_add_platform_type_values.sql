-- Widen platform_type for the next wave of Matrix bridges.
--
-- MUST stay in its own migration with no other statements. Postgres allows
-- ALTER TYPE ... ADD VALUE inside a transaction, but the new label cannot be
-- *used* until that transaction commits — so anything referencing 'slack' has
-- to live in a later migration (see 20260817000200).
--
-- The enum is the wrong shape for a set that grows with the product roadmap:
-- packages/platform-catalog already lists 17 platforms and every addition pays
-- this two-migration tax. Tracked as a follow-up to convert `platform` to TEXT
-- validated against the catalog. See docs/LOOPS_REVAMP_PLAN.md §11.

ALTER TYPE platform_type ADD VALUE IF NOT EXISTS 'slack';
ALTER TYPE platform_type ADD VALUE IF NOT EXISTS 'signal';
ALTER TYPE platform_type ADD VALUE IF NOT EXISTS 'discord';
ALTER TYPE platform_type ADD VALUE IF NOT EXISTS 'messenger';

COMMENT ON TYPE platform_type IS
  'Supported messaging platforms. Mirrors packages/platform-catalog; adding a value '
  'requires a separate migration before that value can be referenced.';
