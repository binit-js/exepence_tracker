const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { isAuthenticated } = require('../middleware/auth');

// Get Current Month's Budget
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const userId = req.session.userId;

        // 1. Fetch budget amount
        const budgets = await db.query(
            'SELECT amount FROM budgets WHERE user_id = $1 AND month = $2 AND year = $3',
            [userId, month, year]
        );
        const monthlyBudget = budgets.rows.length > 0 ? parseFloat(budgets.rows[0].amount) : 0;

        // 2. Fetch total spent directly from database using SUM aggregation
        const totalResult = await db.query(
            'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3',
            [userId, month, year]
        );
        const totalSpent = parseFloat(totalResult.rows[0].total);

        // 3. Compute remaining budget
        const remainingBudget = monthlyBudget - totalSpent;

        res.json({
            monthlyBudget,
            totalSpent,
            remainingBudget
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Set/Update Budget
router.post('/', isAuthenticated, async (req, res) => {
    try {
        const { amount } = req.body;
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        if (!amount) {
            return res.status(400).json({ message: 'Amount is required' });
        }

        // Check if exists
        const existing = await db.query(
            'SELECT id FROM budgets WHERE user_id = $1 AND month = $2 AND year = $3',
            [req.session.userId, month, year]
        );

        if (existing.rows.length > 0) {
            // Update
            await db.query(
                'UPDATE budgets SET amount = $1 WHERE id = $2',
                [amount, existing.rows[0].id]
            );
        } else {
            // Insert
            await db.query(
                'INSERT INTO budgets (user_id, amount, month, year) VALUES ($1, $2, $3, $4)',
                [req.session.userId, amount, month, year]
            );
        }

        res.json({ message: 'Budget set successfully', amount });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
