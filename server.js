const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config();

// 🔥 HARD DEBUG (no assumptions)
console.log('ENV CHECK →');
console.log('HOST:', process.env.DB_HOST);
console.log('USER:', process.env.DB_USER);
console.log('PASS:', process.env.DB_PASSWORD);
console.log('DB:', process.env.DB_NAME);

const app = express();
const PORT = process.env.PORT || 3000;

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'budget-saathi-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// ================= ROUTES =================
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));
app.use('/api/budget', require('./routes/budgetRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));

// ================= STATIC =================
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================= DIRECT DB TEST =================
async function testDB() {
    try {
        const conn = await mysql.createConnection({
            host: '127.0.0.1', // 🔥 FORCE TCP
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('✅ DIRECT DB CONNECTION SUCCESS');

        const [tables] = await conn.query('SHOW TABLES');
        console.log('📊 Tables:', tables);

        const [categories] = await conn.query('SELECT * FROM categories');
        console.log(`📦 Categories loaded: ${categories.length}`);

        await conn.end();
    } catch (err) {
        console.error('❌ REAL DB ERROR:', err);
    }
}

// ================= START SERVER =================
app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    await testDB();
});