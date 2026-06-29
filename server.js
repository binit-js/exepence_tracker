const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(process.env.VERCEL ? os.tmpdir() : path.join(__dirname, 'uploads')));

app.use(cookieParser());

// Custom stateless JWT session middleware
app.use((req, res, next) => {
    req.session = {}; // Mock session object for compatibility
    const token = req.cookies.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.SESSION_SECRET || 'budget-saathi-secret');
            req.session.userId = decoded.userId;
            req.session.username = decoded.username;
        } catch (err) {
            // Token is invalid/expired, clear it
            res.clearCookie('token');
        }
    }
    next();
});

// ================= ROUTES =================
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));
app.use('/api/budget', require('./routes/budgetRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/ml', require('./routes/mlRoutes'));

// ================= STATIC =================
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================= START SERVER =================
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});