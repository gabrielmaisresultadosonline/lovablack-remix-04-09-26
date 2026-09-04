CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  whatsapp text,
  language text NOT NULL DEFAULT 'pt' CHECK (language IN ('pt', 'en')),
  access_password text NOT NULL,
  registration_ip inet,
  blocked boolean NOT NULL DEFAULT false,
  custom_message text NOT NULL DEFAULT '',
  session_id text,
  last_login_at timestamptz,
  last_heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS web_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extension_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  device_id text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('trial', 'monthly', 'semiannual', 'annual', 'lifetime', 'paid')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_nsu text NOT NULL UNIQUE,
  amount integer NOT NULL CHECK (amount > 0),
  plan_name text NOT NULL,
  plan_duration_days integer NOT NULL CHECK (plan_duration_days > 0),
  payment_link text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL', 'USD')),
  provider text NOT NULL,
  session_id text,
  transaction_nsu text,
  invoice_slug text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extension_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id text NOT NULL,
  notice_type text NOT NULL CHECK (notice_type IN ('info', 'block')),
  content_type text NOT NULL CHECK (content_type IN ('text', 'video', 'image', 'button')),
  content text NOT NULL,
  image_thumb_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extension_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Garante que todos os planos usados pelo painel sejam aceitos (inclui 'fortnight').
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_type_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_type_check
  CHECK (type IN ('trial', 'fortnight', 'monthly', 'semiannual', 'annual', 'lifetime', 'paid'));

CREATE INDEX IF NOT EXISTS users_registration_ip_idx ON users(registration_ip);
CREATE INDEX IF NOT EXISTS subscriptions_expiry_idx ON subscriptions(status, expires_at);
CREATE INDEX IF NOT EXISTS transactions_user_idx ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS extension_sessions_user_idx ON extension_sessions(user_id, revoked_at);

INSERT INTO app_settings(key, value) VALUES
  ('global_announcement', '""'::jsonb),
  ('min_version', '"1.0.0"'::jsonb),
  ('multi_login_block', 'false'::jsonb),
  ('community_link', '""'::jsonb),
  ('ip_allowlist', '[]'::jsonb),
  ('download_link', '""'::jsonb),

  ('tutorials', '[{"title":"Instalando LOVABLACK","url":"https://youtu.be/NC3t-t6vtpA","thumbnail":"https://img.youtube.com/vi/NC3t-t6vtpA/maxresdefault.jpg"},{"title":"Utilizando LOVABLACK","url":"https://youtu.be/vx066YJhFw8","thumbnail":"https://img.youtube.com/vi/vx066YJhFw8/maxresdefault.jpg"},{"title":"Ainda está gastando créditos? Shadowban","url":"https://youtu.be/aG83VquD9is","thumbnail":"https://img.youtube.com/vi/aG83VquD9is/maxresdefault.jpg"}]'::jsonb)
ON CONFLICT (key) DO NOTHING;
