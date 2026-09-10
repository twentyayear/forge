-- Up Migration

-- Kyle now has a real Google Workspace mailbox on the app's own domain.
-- Fix-forward (never edit an applied migration): repoint the admin row.
UPDATE users SET email = 'kyle@alphaecho.io' WHERE email = 'hey+kyle@blueroutevineyard.com';

-- Down Migration

UPDATE users SET email = 'hey+kyle@blueroutevineyard.com' WHERE email = 'kyle@alphaecho.io';
