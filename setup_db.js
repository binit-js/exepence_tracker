const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
    console.log('Reading supabase_schema.sql...');
    let schema;
    try {
        schema = fs.readFileSync(path.join(__dirname, 'supabase_schema.sql'), 'utf8');
    } catch (e) {
        console.error('❌ Failed to read supabase_schema.sql:', e.message);
        return;
    }

    const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('❌ Error: SUPABASE_DB_URL or DATABASE_URL environment variable is missing in .env file!');
        console.error('Please configure your database connection string and try again.');
        return;
    }

    const client = new Client({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('Connecting to PostgreSQL database (Supabase)...');
        await client.connect();
        console.log('Connected! Executing schema script...');
        
        await client.query(schema);
        
        console.log('✅ Supabase database schema loaded successfully!');
    } catch (err) {
        console.error('❌ Error executing database setup:', err.message);
    } finally {
        await client.end();
    }
}

setupDatabase();
