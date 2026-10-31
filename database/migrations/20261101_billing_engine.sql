BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_requested_at TIMESTAMPTZ;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS plan_products (
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (plan_id,product_id)
);

CREATE TABLE IF NOT EXISTS subscription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description VARCHAR(255) NOT NULL,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('Fixed','Percentage')),
  discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value > 0),
  minimum_purchase_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  minimum_quantity INTEGER NOT NULL DEFAULT 0,
  applicable_products UUID[] NOT NULL DEFAULT '{}',
  start_date DATE,
  end_date DATE,
  maximum_usage_count INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES users(id),
  plan_id UUID REFERENCES plans(id),
  valid_until DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','converted')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description VARCHAR(255) NOT NULL,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description VARCHAR(255) NOT NULL,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS taxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  rate NUMERIC(5,2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS taxes_one_default_idx ON taxes(is_default) WHERE is_default=TRUE;
INSERT INTO taxes(name,rate,is_default)
SELECT 'Standard', COALESCE((SELECT NULLIF(setting_value->>'tax_rate','')::numeric FROM workspace_settings WHERE setting_key='workspace'),18), TRUE
WHERE NOT EXISTS (SELECT 1 FROM taxes WHERE is_default=TRUE);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_id UUID REFERENCES taxes(id) ON DELETE SET NULL;

ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE subscription_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billing_date DATE;
UPDATE subscriptions
   SET next_billing_date = CURRENT_DATE
 WHERE status='active' AND next_billing_date IS NULL
   AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS discount_id UUID REFERENCES discounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft','confirmed','sent','paid','cancelled'));
CREATE UNIQUE INDEX IF NOT EXISTS invoices_subscription_period_unique
  ON invoices(subscription_id,period_start) WHERE subscription_id IS NOT NULL AND period_start IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS billing_invoice_number_seq START WITH 1000000;

CREATE TABLE IF NOT EXISTS quotation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  validity_days INTEGER NOT NULL DEFAULT 30 CHECK (validity_days > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES quotation_templates(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS quotation_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  description VARCHAR(255) NOT NULL,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100)
);

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invoices_customer_idx ON invoices(customer_id,invoice_date DESC);
CREATE INDEX IF NOT EXISTS invoices_status_due_idx ON invoices(status,due_date);
CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON subscriptions(customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_status_billing_idx ON subscriptions(status,next_billing_date);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS payments_date_idx ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS quotation_items_quotation_idx ON quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS subscription_items_subscription_idx ON subscription_items(subscription_id);

COMMIT;
