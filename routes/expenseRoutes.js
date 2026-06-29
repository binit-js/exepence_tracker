const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../config/db');
const { isAuthenticated } = require('../middleware/auth');

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) return cb(null, true);
        cb(new Error('Only images are allowed'));
    }
});

const uploadCsv = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: (req, file, cb) => {
        const extname = path.extname(file.originalname).toLowerCase() === '.csv';
        if (extname) return cb(null, true);
        cb(new Error('Only CSV files are allowed'));
    }
});

// Get All Expenses (with optional filters)
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const { category, month, year } = req.query;
        let query = 'SELECT * FROM expenses WHERE user_id = ?';
        let params = [req.session.userId];

        if (category && category !== 'all') {
            query += ' AND category_id = ?';
            params.push(category);
        }

        // Default list ordering
        query += ' ORDER BY date DESC';

        const [expenses] = await db.query(query, params);
        res.json(expenses);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Recent Expenses (Limit 5)
router.get('/recent', isAuthenticated, async (req, res) => {
    try {
        const [expenses] = await db.query(
            'SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC LIMIT 5',
            [req.session.userId]
        );
        res.json(expenses);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Monthly Summary
router.get('/summary', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        // Total Spent this month
        const [totalResult] = await db.query(
            'SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND MONTH(date) = ? AND YEAR(date) = ?',
            [userId, currentMonth, currentYear]
        );

        // Category Breakdown
        const [categoryResult] = await db.query(
            `SELECT c.name, SUM(e.amount) as total 
             FROM expenses e 
             JOIN categories c ON e.category_id = c.id 
             WHERE e.user_id = ? AND MONTH(e.date) = ? AND YEAR(e.date) = ? 
             GROUP BY c.name`,
            [userId, currentMonth, currentYear]
        );

        // Daily Trend
        const [dailyResult] = await db.query(
            `SELECT DATE(date) as day, SUM(amount) as total 
             FROM expenses 
             WHERE user_id = ? AND MONTH(date) = ? AND YEAR(date) = ? 
             GROUP BY DATE(date) 
             ORDER BY day ASC`,
            [userId, currentMonth, currentYear]
        );

        res.json({
            totalSpent: totalResult[0].total || 0,
            categoryBreakdown: categoryResult,
            dailyTrend: dailyResult
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add Expense
router.post('/', isAuthenticated, upload.single('image'), async (req, res) => {
    try {
        const { amount, description, category, date, payment_mode } = req.body;
        const image_path = req.file ? req.file.path.replace(/\\/g, "/") : null;

        if (!amount || !category || !date) {
            return res.status(400).json({ message: 'Amount, Category, and Date are required' });
        }

        await db.query(
            'INSERT INTO expenses (user_id, amount, description, category_id, date, payment_mode, image_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.session.userId, amount, description, category, date, payment_mode, image_path]
        );

        res.status(201).json({ message: 'Expense added successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Import Expenses from CSV
router.post('/import', isAuthenticated, (req, res, next) => {
    uploadCsv.single('file')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ message: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const fs = require('fs');
        let csvData = fs.readFileSync(req.file.path, 'utf8');
        
        // Delete the temporary file
        fs.unlinkSync(req.file.path);

        // Remove UTF-8 BOM if present (e.g. from Excel exports)
        if (csvData.startsWith('\ufeff')) {
            csvData = csvData.slice(1);
        }

        const lines = csvData.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) {
            return res.status(400).json({ message: 'CSV file is empty or missing data rows' });
        }

        // Dynamically detect delimiter (comma or semicolon)
        const delimiter = lines[0].includes(';') ? ';' : ',';

        // Parse Header Row
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
        
        const dateIdx = headers.indexOf('date');
        const catIdx = headers.indexOf('category');
        const descIdx = headers.indexOf('description');
        const amountIdx = headers.indexOf('amount');
        const payIdx = headers.indexOf('payment mode');

        if (amountIdx === -1 || catIdx === -1 || dateIdx === -1) {
            return res.status(400).json({ message: 'Missing columns: Date, Category, and Amount are mandatory' });
        }

        // Fetch categories to map names to IDs
        const [categories] = await db.query('SELECT * FROM categories');
        const categoryMap = {};
        categories.forEach(c => {
            categoryMap[c.name.toLowerCase()] = c.id;
        });

        const defaultCategoryId = categoryMap['other'] || 9; // Fallback to 'Other'
        const insertedExpenses = [];
        const errors = [];

        // Parse Data Rows
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            
            // Robust character-by-character CSV splitter
            const values = [];
            let current = '';
            let inQuotes = false;
            for (let char of line) {
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === delimiter && !inQuotes) {
                    values.push(current.trim().replace(/^["']|["']$/g, ''));
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current.trim().replace(/^["']|["']$/g, ''));

            if (values.length < headers.length) {
                errors.push(`Row ${i + 1}: Columns count mismatch`);
                continue;
            }

            const rawDate = values[dateIdx];
            const rawCat = values[catIdx];
            const rawDesc = values[descIdx] || '';
            const rawAmount = values[amountIdx];
            const rawPay = payIdx !== -1 ? values[payIdx] : 'Cash';

            const amount = parseFloat(rawAmount);
            if (isNaN(amount) || amount <= 0) {
                errors.push(`Row ${i + 1}: Invalid amount "${rawAmount}"`);
                continue;
            }

            // Parse Date
            let date = new Date(rawDate);
            if (isNaN(date.getTime())) {
                const parts = rawDate.split('/');
                if (parts.length === 3) {
                    date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
            }
            if (isNaN(date.getTime())) {
                date = new Date();
            }

            const categoryId = categoryMap[rawCat.toLowerCase()] || defaultCategoryId;

            insertedExpenses.push([
                req.session.userId,
                amount,
                rawDesc,
                categoryId,
                date,
                rawPay
            ]);
        }

        if (insertedExpenses.length === 0) {
            return res.status(400).json({ message: 'No valid rows found to import', errors });
        }

        // Batch Insert
        for (const exp of insertedExpenses) {
            await db.query(
                'INSERT INTO expenses (user_id, amount, description, category_id, date, payment_mode) VALUES (?, ?, ?, ?, ?, ?)',
                exp
            );
        }

        res.status(201).json({
            message: `Successfully imported ${insertedExpenses.length} expenses.`,
            insertedCount: insertedExpenses.length,
            errors: errors.length > 0 ? errors : null
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error parsing CSV' });
    }
});

// Delete Expense
router.delete('/:id', isAuthenticated, async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM expenses WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Expense not found or unauthorized' });
        }

        res.json({ message: 'Expense deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
