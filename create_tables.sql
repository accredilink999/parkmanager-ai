CREATE TABLE IF NOT EXISTS customer_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  org_id UUID,
  pitch_id UUID,
  lead_occupier TEXT,
  email TEXT,
  phone TEXT,
  home_address TEXT,
  other_occupants JSONB DEFAULT '[]',
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  onboarding_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID,
  pitch_id UUID,
  customer_user_id UUID REFERENCES auth.users(id),
  cylinder_size TEXT,
  cylinder_type TEXT DEFAULT 'propane',
  quantity INT DEFAULT 1,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  manager_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID,
  pitch_id UUID,
  customer_user_id UUID REFERENCES auth.users(id),
  category TEXT,
  subject TEXT,
  description TEXT,
  urgency TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'open',
  manager_response TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certificates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID,
  pitch_id UUID,
  cert_type TEXT,
  cert_name TEXT,
  issued_date DATE,
  expiry_date DATE,
  file_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
