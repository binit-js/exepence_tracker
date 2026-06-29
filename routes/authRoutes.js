const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Register
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    // Simple validation
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        // Check if user exists
        const existing = await db.query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ message: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // Insert user
        const result = await db.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
            [username, email, hash]
        );
        const insertedId = result.rows[0].id;

        // Generate JWT Token
        const token = jwt.sign(
            { userId: insertedId, username: username },
            process.env.JWT_SECRET || process.env.SESSION_SECRET || 'budget-saathi-secret',
            { expiresIn: '24h' }
        );

        // Set token cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.status(201).json({ message: 'User registered successfully', userId: insertedId });

    } catch (err) {
        console.error('Registration failed:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        const users = await db.query('SELECT * FROM users WHERE email = $1', [email]);

        if (users.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = users.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate JWT Token
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET || process.env.SESSION_SECRET || 'budget-saathi-secret',
            { expiresIn: '24h' }
        );

        // Set token cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.json({ message: 'Login successful', user: { id: user.id, username: user.username, email: user.email } });

    } catch (err) {
        console.error('Login failed:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Logout
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logout successful' });
});

// Check Auth Status (for frontend init)
router.get('/check', (req, res) => {
    if (req.session.userId) {
        res.json({ isAuthenticated: true, user: { id: req.session.userId, username: req.session.username } });
    } else {
        res.json({ isAuthenticated: false });
    }
});

module.exports = router;
