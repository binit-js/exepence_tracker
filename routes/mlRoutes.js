const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Blob } = require('buffer');
const db = require('../config/db');
const { isAuthenticated } = require('../middleware/auth');

// Multer Config for temporary uploads before sending to Python OCR
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, 'ocr_' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Self-healing database initialization check
async function initDB() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS chat_history (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                message TEXT NOT NULL,
                sender VARCHAR(10) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log("✅ Chat history table verified/created in database");
    } catch (err) {
        console.error("❌ Failed to initialize chat_history table:", err.message);
    }
}
initDB();

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

// Helper to fetch with a timeout
async function fetchWithTimeout(url, options, timeout = 2500) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

// 1. Predict Budget Overrun Risk
router.get('/predict-budget-risk', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const day = now.getDate();

        // Query current budget limit
        const budgets = await db.query(
            'SELECT amount FROM budgets WHERE user_id = $1 AND month = $2 AND year = $3',
            [userId, month, year]
        );
        const limit = budgets.rows.length > 0 ? parseFloat(budgets.rows[0].amount) : 0.0;

        // Query total spent
        const spentRes = await db.query(
            'SELECT SUM(amount) as total FROM expenses WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3',
            [userId, month, year]
        );
        const spent = spentRes.rows[0].total ? parseFloat(spentRes.rows[0].total) : 0.0;

        // Query category breakdown
        const breakdown = await db.query(
            `SELECT c.name, SUM(e.amount) as total 
             FROM expenses e 
             JOIN categories c ON e.category_id = c.id 
             WHERE e.user_id = $1 AND EXTRACT(MONTH FROM e.date) = $2 AND EXTRACT(YEAR FROM e.date) = $3 
             GROUP BY c.name`,
            [userId, month, year]
        );
        const breakdownRows = breakdown.rows;

        try {
            // Forward to FastAPI with timeout
            const response = await fetchWithTimeout(`${ML_URL}/predict-budget-risk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    budget_limit: limit,
                    total_spent: spent,
                    day_of_month: day,
                    category_breakdown: breakdownRows.map(b => ({ name: b.name, total: parseFloat(b.total) }))
                })
            }, 2000);

            if (!response.ok) {
                throw new Error('ML Service Error');
            }

            const data = await response.json();
            return res.json(data);
        } catch (fetchErr) {
            console.warn('FastAPI Service Offline or slow. Falling back to direct calculation:', fetchErr.message);
            
            // Fallback rule-based calculations directly in JS
            const spentRatio = limit > 0 ? spent / limit : 0;
            const elapsedRatio = day / 30.0;
            const velocityRatio = elapsedRatio > 0 ? spentRatio / elapsedRatio : 0;
            
            let risk = "Low";
            let confidence = 85.0;
            
            if (spentRatio >= 1.0 || velocityRatio > 1.25) {
                risk = "High";
            } else if (velocityRatio > 0.9) {
                risk = "Medium";
            }
            
            const projected = day > 0 ? (spent / day) * 30 : spent;
            const expectedOverspend = Math.max(0, projected - limit);
            
            let rec = "Keep tracking your daily expenses!";
            if (risk !== "Low" && breakdownRows.length > 0) {
                const sortedCats = [...breakdownRows].sort((a, b) => parseFloat(b.total) - parseFloat(a.total));
                rec = `Reduce ${sortedCats[0].name} spending by 10% to stay within budget.`;
            } else if (risk !== "Low") {
                rec = "Reduce restaurant & shopping spending by 10% to stay within budget.";
            }
            
            return res.json({
                risk,
                confidence,
                expectedOverspend: parseFloat(expectedOverspend.toFixed(2)),
                recommendation: rec
            });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error checking budget predictions' });
    }
});

// 2. Predict Category
router.post('/predict-category', isAuthenticated, async (req, res) => {
    try {
        const { description } = req.body;
        if (!description) {
            return res.status(400).json({ message: 'Description is required' });
        }

        const response = await fetch(`${ML_URL}/predict-category`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description })
        });

        if (!response.ok) {
            throw new Error('ML Service Error');
        }

        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error predicting category' });
    }
});

// 3. OCR Receipt Scanner
router.post('/ocr', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'File is required' });
        }

        // Read uploaded file and prepare formData for FastAPI forwarding
        const filePath = req.file.path;
        const fileBuffer = fs.readFileSync(filePath);
        const fileBlob = new Blob([fileBuffer], { type: req.file.mimetype });
        
        const formData = new FormData();
        formData.append('file', fileBlob, req.file.originalname);

        const response = await fetch(`${ML_URL}/ocr`, {
            method: 'POST',
            body: formData
        });

        // Cleanup temporary ocr file locally
        fs.unlinkSync(filePath);

        if (!response.ok) {
            const errDetail = await response.text();
            throw new Error(`ML Service OCR failed: ${errDetail}`);
        }

        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message || 'Error parsing receipt image' });
    }
});

// 4. Monthly Expense Forecast
router.get('/forecast', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        // Fetch last 6 months of history totals
        const results = await db.query(
            `SELECT EXTRACT(YEAR FROM date) as year, EXTRACT(MONTH FROM date) as month, SUM(amount) as total 
             FROM expenses 
             WHERE user_id = $1 
             GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date) 
             ORDER BY year ASC, month ASC 
             LIMIT 6`,
            [userId]
        );
        const resultsRows = results.rows;

        const history = resultsRows.map(r => parseFloat(r.total));
        if (history.length === 0) {
            history.push(0.0);
        }

        try {
            // Call FastAPI with timeout
            const response = await fetchWithTimeout(`${ML_URL}/forecast`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history })
            }, 2000);

            if (!response.ok) {
                throw new Error('ML Service Error');
            }

            const data = await response.json();
            return res.json({
                history: resultsRows, // send raw array back too for frontend graphing
                forecast: data
            });
        } catch (fetchErr) {
            console.warn('FastAPI Service Offline or slow. Falling back to linear regression in JS:', fetchErr.message);
            
            // Fallback regression directly in JS
            const current = history[history.length - 1] || 0.0;
            let fc = current;
            const nPoints = history.length;
            
            if (nPoints >= 2) {
                let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
                for (let i = 0; i < nPoints; i++) {
                    sumX += i;
                    sumY += history[i];
                    sumXY += i * history[i];
                    sumXX += i * i;
                }
                const m = (nPoints * sumXY - sumX * sumY) / (nPoints * sumXX - sumX * sumX) || 0;
                const c = (sumY - m * sumX) / nPoints;
                fc = Math.max(0.0, m * nPoints + c);
            }
            
            const growth = current > 0 ? ((fc - current) / current) * 100 : 0.0;
            
            return res.json({
                history: resultsRows,
                forecast: {
                    current: parseFloat(current.toFixed(2)),
                    forecast: parseFloat(fc.toFixed(2)),
                    growth: parseFloat(growth.toFixed(1))
                }
            });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error forecasting monthly expenses' });
    }
});

// 5. Chatbot Send Message
router.post('/chat', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ message: 'Message is required' });
        }

        // Log user message first
        await db.query(
            'INSERT INTO chat_history (user_id, message, sender) VALUES ($1, $2, $3)',
            [userId, message, 'user']
        );

        // Fetch response from FastAPI Assistant
        const response = await fetch(`${ML_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                user_id: userId
            })
        });

        if (!response.ok) {
            throw new Error('AI Assistant Service Error');
        }

        const data = await response.json();
        const botResponse = data.response;

        // Log bot response
        await db.query(
            'INSERT INTO chat_history (user_id, message, sender) VALUES ($1, $2, $3)',
            [userId, botResponse, 'bot']
        );

        res.json({ response: botResponse });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'AI Chat failed' });
    }
});

// 6. Get Chat History
router.get('/chat/history', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const history = await db.query(
            'SELECT message, sender, created_at FROM chat_history WHERE user_id = $1 ORDER BY created_at ASC',
            [userId]
        );
        res.json(history.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error retrieving chat logs' });
    }
});

module.exports = router;
