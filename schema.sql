CREATE DATABASE IF NOT EXISTS budget_saathi;
USE budget_saathi;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20) DEFAULT '#4F46E5',
    icon VARCHAR(50) DEFAULT 'fa-tag'
);

INSERT IGNORE INTO categories (name, color, icon) VALUES 
('Food & Dining', '#F59E0B', 'fa-utensils'),
('Transportation', '#3B82F6', 'fa-bus'),
('Shopping', '#EC4899', 'fa-shopping-bag'),
('Entertainment', '#8B5CF6', 'fa-film'),
('Bills & Utilities', '#EF4444', 'fa-file-invoice-dollar'),
('Healthcare', '#10B981', 'fa-heartbeat'),
('Education', '#6366F1', 'fa-graduation-cap'),
('Travel', '#0EA5E9', 'fa-plane'),
('Other', '#6B7280', 'fa-ellipsis-h');

CREATE TABLE IF NOT EXISTS budgets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    month INT NOT NULL,
    year INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY unique_budget (user_id, month, year)
);

CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    category_id INT,
    date DATETIME NOT NULL,
    payment_mode VARCHAR(50),
    location TEXT,
    image_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);
