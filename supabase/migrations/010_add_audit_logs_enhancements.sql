-- ============================================================================
-- ENHANCE AUDIT LOGS FOR PRICING, PRODUCT PUBLISH, AND SOURCE CHANGES
-- ============================================================================

-- Ensure audit_logs table has proper structure (already exists, just add indexes)
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);

-- Add helper function to log pricing run
CREATE OR REPLACE FUNCTION log_pricing_run(intake_id_param UUID, user_id_param UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO audit_logs (table_name, record_id, action, user_id, new_data)
  VALUES (
    'scrape_jobs',
    NULL, -- Pricing runs create multiple jobs
    'insert',
    user_id_param,
    jsonb_build_object('intake_id', intake_id_param, 'action', 'pricing_run_initiated')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add helper function to log product publish/unpublish
CREATE OR REPLACE FUNCTION log_product_status_change(product_id_param UUID, old_status TEXT, new_status TEXT, user_id_param UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO audit_logs (table_name, record_id, action, user_id, old_data, new_data)
  VALUES (
    'products',
    product_id_param,
    'update',
    user_id_param,
    jsonb_build_object('status', old_status),
    jsonb_build_object('status', new_status, 'action', 'status_change')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add helper function to log source changes
CREATE OR REPLACE FUNCTION log_source_change(source_id_param UUID, user_id_param UUID, change_type TEXT, change_data JSONB)
RETURNS VOID AS $$
BEGIN
  INSERT INTO audit_logs (table_name, record_id, action, user_id, new_data)
  VALUES (
    'sources',
    source_id_param,
    CASE change_type 
      WHEN 'config_update' THEN 'update'
      WHEN 'enable' THEN 'update'
      WHEN 'disable' THEN 'update'
      ELSE 'update'
    END,
    user_id_param,
    jsonb_build_object('change_type', change_type, 'changes', change_data)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

