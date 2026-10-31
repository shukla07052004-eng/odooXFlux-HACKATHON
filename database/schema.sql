CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'customer'
        CHECK (role IN ('admin', 'staff', 'customer')),
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone VARCHAR(40),
    company VARCHAR(150),
    address TEXT,
    assigned_staff_id UUID REFERENCES users(id) ON DELETE SET NULL,
    verification_code_hash TEXT,
    verification_code_expiry TIMESTAMPTZ,
    verification_attempts INTEGER NOT NULL DEFAULT 0,
    verification_sent_at TIMESTAMPTZ,
    password_reset_token_hash TEXT,
    password_reset_token_expiry TIMESTAMPTZ,
    password_reset_requested_at TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE auth_sessions (
    jti UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX auth_sessions_user_expiry_idx ON auth_sessions(user_id, expires_at);
CREATE INDEX users_assigned_staff_idx ON users(assigned_staff_id) WHERE role='customer';

CREATE TABLE taxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    rate DECIMAL(5,2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX taxes_one_default_idx ON taxes(is_default) WHERE is_default=TRUE;
INSERT INTO taxes(name,rate,is_default) VALUES ('Standard',18,TRUE);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    product_type VARCHAR(100),
    sales_price DECIMAL(12,2) NOT NULL,
    cost_price DECIMAL(12,2) NOT NULL,
    notes TEXT,
    tax_id UUID REFERENCES taxes(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL
        REFERENCES products(id) ON DELETE CASCADE,
    variant_name VARCHAR(100) NOT NULL,
    additional_price DECIMAL(12,2) DEFAULT 0
);

CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    billing_interval VARCHAR(20) NOT NULL
        CHECK (billing_interval IN ('daily', 'weekly', 'monthly', 'yearly')),
    price DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    min_quantity INTEGER DEFAULT 1,
    start_date DATE,
    end_date DATE,
    auto_close BOOLEAN DEFAULT FALSE,
    allow_pause BOOLEAN DEFAULT TRUE,
    allow_renewal BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE plan_products (
    plan_id UUID REFERENCES plans(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    PRIMARY KEY (plan_id, product_id)
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES users(id),
    plan_id UUID REFERENCES plans(id),
    start_date DATE NOT NULL,
    expiry_date DATE,
    next_billing_date DATE,
    status VARCHAR(20) DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'quotation',
                'confirmed',
                'active',
                'paused',
                'closed'
            )
        ),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_terms VARCHAR(40) NOT NULL DEFAULT 'Due on receipt',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE subscription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    description VARCHAR(255) NOT NULL,
    quantity DECIMAL(12,2) NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    subscription_id UUID REFERENCES subscriptions(id),
    customer_id UUID REFERENCES users(id),
    period_start DATE,
    period_end DATE,
    sent_at TIMESTAMPTZ,
    invoice_date DATE NOT NULL,
    due_date DATE,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft'
        CHECK (status IN ('draft', 'confirmed', 'sent', 'paid', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id),
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(50),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    note TEXT
);

CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    description VARCHAR(255) NOT NULL,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity DECIMAL(12,2) NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE billing_invoice_number_seq START WITH 1000000;

CREATE TABLE quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_number VARCHAR(50) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES users(id),
    plan_id UUID REFERENCES plans(id),
    template_id UUID,
    valid_until DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'converted')),
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    description VARCHAR(255) NOT NULL,
    quantity DECIMAL(12,2) NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0)
);

CREATE TABLE discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('Fixed', 'Percentage')),
    discount_value DECIMAL(12,2) NOT NULL CHECK (discount_value > 0),
    minimum_purchase_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    minimum_quantity INTEGER NOT NULL DEFAULT 0,
    applicable_products UUID[] NOT NULL DEFAULT '{}',
    start_date DATE,
    end_date DATE,
    maximum_usage_count INTEGER,
    usage_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE invoices ADD COLUMN discount_id UUID REFERENCES discounts(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX invoices_subscription_period_unique ON invoices(subscription_id,period_start)
  WHERE subscription_id IS NOT NULL AND period_start IS NOT NULL;

CREATE TABLE quotation_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
    validity_days INTEGER NOT NULL DEFAULT 30 CHECK (validity_days > 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE quotations ADD CONSTRAINT quotations_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES quotation_templates(id) ON DELETE SET NULL;
CREATE TABLE quotation_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    description VARCHAR(255) NOT NULL,
    quantity DECIMAL(12,2) NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100)
);

CREATE TABLE workspace_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX invoices_customer_idx ON invoices(customer_id,invoice_date DESC);
CREATE INDEX invoices_status_due_idx ON invoices(status,due_date);
CREATE INDEX subscriptions_customer_idx ON subscriptions(customer_id,created_at DESC);
CREATE INDEX subscriptions_status_billing_idx ON subscriptions(status,next_billing_date);
CREATE INDEX payments_invoice_idx ON payments(invoice_id);
CREATE INDEX payments_date_idx ON payments(payment_date DESC);
CREATE INDEX invoice_items_invoice_idx ON invoice_items(invoice_id);
CREATE INDEX quotation_items_quotation_idx ON quotation_items(quotation_id);
CREATE INDEX subscription_items_subscription_idx ON subscription_items(subscription_id);
