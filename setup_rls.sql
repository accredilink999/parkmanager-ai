-- Enable RLS on all portal tables
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE gas_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, but add policies for authenticated users

-- customer_profiles: users can read/write their own profile
CREATE POLICY "Users can view own profile" ON customer_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON customer_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON customer_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- gas_orders: users can read/write their own orders
CREATE POLICY "Users can view own orders" ON gas_orders FOR SELECT USING (auth.uid() = customer_user_id);
CREATE POLICY "Users can insert own orders" ON gas_orders FOR INSERT WITH CHECK (auth.uid() = customer_user_id);

-- site_reports: users can read/write their own reports
CREATE POLICY "Users can view own reports" ON site_reports FOR SELECT USING (auth.uid() = customer_user_id);
CREATE POLICY "Users can insert own reports" ON site_reports FOR INSERT WITH CHECK (auth.uid() = customer_user_id);

-- certificates: users can view certs for their pitch
CREATE POLICY "Users can view own certs" ON certificates FOR SELECT USING (
  pitch_id IN (SELECT pitch_id FROM customer_profiles WHERE user_id = auth.uid())
);

-- Allow service role full access (managers use service role key)
CREATE POLICY "Service role full access profiles" ON customer_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access orders" ON gas_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access reports" ON site_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access certs" ON certificates FOR ALL USING (true) WITH CHECK (true);
