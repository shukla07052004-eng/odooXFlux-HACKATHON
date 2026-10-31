CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(150) NOT NULL,

    email VARCHAR(255) UNIQUE NOT NULL,

    phone VARCHAR(20),

    company VARCHAR(150),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT * FROM customers;