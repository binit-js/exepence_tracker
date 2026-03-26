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
