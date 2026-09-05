-- Internal Operations Console access is deliberately separate from customer data.
-- The server's service role is the only actor that reads or writes this table.
CREATE TABLE IF NOT EXISTS public.operations_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'operator', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operations_admins ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_admins TO service_role;

-- Bootstrap the project owner. Additional people are managed through /ops.
INSERT INTO public.operations_admins (email, role)
VALUES ('l2succes@gmail.com', 'owner')
ON CONFLICT (email) DO NOTHING;
