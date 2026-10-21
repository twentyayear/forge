-- Up Migration
-- MESSAGE_EMAILS IS THE ONE-EMAIL-PER-MESSAGE LEDGER: THE ROW IS INSERTED BEFORE THE SEND, AND A FAILED SEND DELETES IT SO THE NEXT RUN MAY TRY AGAIN.
-- MONEY IS INTEGER CENTS.
CREATE TABLE message_emails (
  message_id uuid PRIMARY KEY REFERENCES messages (id) ON DELETE CASCADE,
  resend_id text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  blurb text CHECK (blurb IS NULL OR length(blurb) <= 500),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  kind text NOT NULL CHECK (kind IN ('session', 'call', 'program', 'other')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offers_trainer_id_idx ON offers (trainer_id);
CREATE TABLE offer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES offers (id),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offer_requests_offer_id_idx ON offer_requests (offer_id);

-- Down Migration
DROP TABLE IF EXISTS offer_requests;
DROP TABLE IF EXISTS offers;
DROP TABLE IF EXISTS message_emails;
