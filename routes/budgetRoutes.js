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

        const budgets = await db.query(
            'SELECT amount FROM budgets WHERE user_id = $1 AND month = $2 AND year = $3',
            [req.session.userId, month, year]
        );

        if (budgets.rows.length > 0) {
            res.json({ amount: budgets.rows[0].amount });
        } else {
            res.json({ amount: 0 }); // No budget set
        }

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
