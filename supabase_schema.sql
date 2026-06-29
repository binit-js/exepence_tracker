CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20) DEFAULT '#4F46E5',
    icon VARCHAR(50) DEFAULT 'fa-tag'
);

INSERT INTO categories (id, name, color, icon) VALUES 
(1, 'Food & Dining', '#F59E0B', 'fa-utensils'),
(2, 'Transportation', '#3B82F6', 'fa-bus'),
(3, 'Shopping', '#EC4899', 'fa-shopping-bag'),
(4, 'Entertainment', '#8B5CF6', 'fa-film'),
(5, 'Bills & Utilities', '#EF4444', 'fa-file-invoice-dollar'),
(6, 'Healthcare', '#10B981', 'fa-heartbeat'),
(7, 'Education', '#6366F1', 'fa-graduation-cap'),
(8, 'Travel', '#0EA5E9', 'fa-plane'),
(9, 'Other', '#6B7280', 'fa-ellipsis-h')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS budgets (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    month INT NOT NULL,
    year INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_budget UNIQUE (user_id, month, year)
);

CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    category_id INT REFERENCES categories(id) ON DELETE SET NULL,
    date TIMESTAMP NOT NULL,
    payment_mode VARCHAR(50),
    location TEXT,
    image_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    sender VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
