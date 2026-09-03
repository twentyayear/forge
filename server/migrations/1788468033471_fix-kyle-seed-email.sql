-- Up Migration

-- Kyle's seed email wasn't a real inbox. Fix-forward (never edit an applied
-- migration): point the existing row at a real address instead.
UPDATE users SET email = 'hey+kyle@blueroutevineyard.com' WHERE email = 'kyle@alphaecho.io';

-- Down Migration

UPDATE users SET email = 'kyle@alphaecho.io' WHERE email = 'hey+kyle@blueroutevineyard.com';
