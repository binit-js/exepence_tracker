const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
    try {
        // Read the schema file
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

        // Create a connection to the server (not the specific DB yet)
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            multipleStatements: true // Important for running the whole script
        });

        console.log('Connected to MySQL server...');

        // Execute the schema script
        await connection.query(schema);

        console.log('✅ Database and tables created successfully!');
        console.log('You can now run "npm start" to launch the application.');

        await connection.end();

    } catch (err) {
        console.error('❌ Error creating database:', err.message);
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('\n--> Please check your password in the .env file.');
        } else if (err.code === 'ECONNREFUSED') {
            console.error('\n--> Is your MySQL server running?');
        }
    }
}

setupDatabase();
