-- ============================================================================
-- INTAKE STATUS AUTOMATION
-- Automatically update coin_intakes.status based on workflow progress
-- ============================================================================

-- Function to update intake status based on current state
CREATE OR REPLACE FUNCTION public.update_intake_status()
RETURNS TRIGGER AS $$
DECLARE
  v_intake_id UUID;
  v_has_attribution BOOLEAN := false;
  v_has_price_points BOOLEAN := false;
  v_has_valuation BOOLEAN := false;
  v_current_status TEXT;
  v_new_status TEXT;
BEGIN
  -- Get intake_id from the triggering table
  IF TG_TABLE_NAME = 'attributions' THEN
    v_intake_id := NEW.intake_id;
  ELSIF TG_TABLE_NAME = 'price_points' THEN
    v_intake_id := NEW.intake_id;
  ELSIF TG_TABLE_NAME = 'valuations' THEN
    v_intake_id := NEW.intake_id;
  END IF;

  IF v_intake_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get current status
  SELECT status INTO v_current_status
  FROM coin_intakes
  WHERE id = v_intake_id;

  -- Don't update if already archived or productized
  IF v_current_status IN ('archived', 'productized') THEN
    RETURN NEW;
  END IF;

  -- Check if attribution exists
  SELECT EXISTS(
    SELECT 1 FROM attributions WHERE intake_id = v_intake_id
  ) INTO v_has_attribution;

  -- Check if price points exist
  SELECT EXISTS(
    SELECT 1 FROM price_points 
    WHERE intake_id = v_intake_id 
    AND filtered_out = false
  ) INTO v_has_price_points;

  -- Check if valuation exists
  SELECT EXISTS(
    SELECT 1 FROM valuations WHERE intake_id = v_intake_id
  ) INTO v_has_valuation;

  -- Determine new status based on workflow progression
  v_new_status := v_current_status;

  IF v_has_valuation OR v_has_price_points THEN
    -- Has pricing data
    IF v_current_status IN ('pending', 'attributed') THEN
      v_new_status := 'priced';
    END IF;
  ELSIF v_has_attribution THEN
    -- Has attribution but no pricing yet
    IF v_current_status = 'pending' THEN
      v_new_status := 'attributed';
    END IF;
  END IF;

  -- Update status if it changed
  IF v_new_status != v_current_status THEN
    UPDATE coin_intakes
    SET status = v_new_status,
        updated_at = NOW()
    WHERE id = v_intake_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers to automatically update status
CREATE TRIGGER trigger_update_status_on_attribution
  AFTER INSERT OR UPDATE ON attributions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_intake_status();

CREATE TRIGGER trigger_update_status_on_price_point
  AFTER INSERT OR UPDATE ON price_points
  FOR EACH ROW
  EXECUTE FUNCTION public.update_intake_status();

CREATE TRIGGER trigger_update_status_on_valuation
  AFTER INSERT OR UPDATE ON valuations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_intake_status();

