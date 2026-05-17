-- Fix platform_chat_id values that incorrectly contain Matrix room IDs
-- instead of actual platform contact IDs (phone numbers, Instagram numeric IDs, etc.)

-- Also fix historical from_me values where user's messages are incorrectly marked

BEGIN;

-- Step 1: Create temp table to store chat ID corrections
CREATE TEMP TABLE chat_id_corrections AS
SELECT DISTINCT
  c.id as chat_id,
  c.platform,
  c.platform_chat_id as old_chat_id,
  -- Extract contact ID from messages.contact_phone where available
  COALESCE(
    (SELECT DISTINCT m.contact_phone
     FROM messages m
     WHERE m.chat_id = c.id
       AND m.from_me = false
       AND m.contact_phone IS NOT NULL
     LIMIT 1),
    -- If no contact_phone, keep the old value (we'll handle manually)
    c.platform_chat_id
  ) as new_chat_id
FROM chats c
WHERE
  c.platform_chat_id LIKE '!%:claire.local'  -- Matrix room IDs start with !
  OR c.platform_chat_id LIKE 'lid-%';         -- WhatsApp community/announcement list IDs

-- Step 2: Show what will change (for review)
-- Run this query manually if needed: SELECT * FROM chat_id_corrections WHERE old_chat_id != new_chat_id;

-- Step 3: Update chats table
UPDATE chats c
SET platform_chat_id = cc.new_chat_id
FROM chat_id_corrections cc
WHERE c.id = cc.chat_id
  AND cc.old_chat_id != cc.new_chat_id;

-- Step 4: Report results
-- Run this query manually if needed:
-- SELECT platform, COUNT(*) as chats_fixed FROM chat_id_corrections WHERE old_chat_id != new_chat_id GROUP BY platform;

-- Step 5: Fix historical from_me values
-- Find user's phone/contact ID from messages they already sent
CREATE TEMP TABLE user_contacts AS
SELECT DISTINCT contact_phone
FROM messages
WHERE from_me = true
  AND contact_phone IS NOT NULL;

-- Update messages where contact matches user but from_me is false
UPDATE messages m
SET from_me = true
WHERE from_me = false
  AND (m.contact_name = 'Luc Succes' OR m.contact_name = 'Luc Succès' OR m.contact_name LIKE 'Luc Succ%');  -- User's display name with or without accent

-- Report how many messages were fixed
-- Run this query manually if needed:
-- SELECT COUNT(*) as messages_fixed FROM messages WHERE contact_name = 'Luc Succes' AND from_me = true;

COMMIT;
