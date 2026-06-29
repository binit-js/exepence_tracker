const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = {
    query: async (text, params) => {
        // Translate MySQL date functions to PostgreSQL equivalents
        let pgText = text
            .replace(/MONTH\((.*?)\)/gi, 'EXTRACT(MONTH FROM $1)')
            .replace(/YEAR\((.*?)\)/gi, 'EXTRACT(YEAR FROM $1)')
            .replace(/DATE\((.*?)\)/gi, '$1::date');

        const upperText = pgText.trim().toUpperCase();
        const isInsert = upperText.startsWith('INSERT');
        const isUpdate = upperText.startsWith('UPDATE');
        const isDelete = upperText.startsWith('DELETE');

        // Append RETURNING id to INSERT statements to fetch key insertions
        if (isInsert && !upperText.includes('RETURNING')) {
            pgText += ' RETURNING id';
        }

        // Convert MySQL style "?" parameters to PostgreSQL style "$1, $2, $3"
        if (params && params.length > 0) {
            let index = 1;
            pgText = pgText.replace(/\?/g, () => `$${index++}`);
        }

        try {
            const res = await pool.query(pgText, params);
            
            // Format returning results for INSERT/UPDATE/DELETE queries
            if (isInsert || isUpdate || isDelete) {
                const insertId = (res.rows.length > 0 && res.rows[0].id) ? res.rows[0].id : null;
                const mockResult = {
                    insertId: insertId,
                    affectedRows: res.rowCount,
                    warningStatus: 0
                };
                return [mockResult, res.fields];
            }

            // Return standard select rows structure
            return [res.rows, res.fields];
        } catch (err) {
            console.error('Database Query Translation Error:', err.message);
            console.error('Transformed SQL:', pgText);
            console.error('Parameters:', params);
            throw err;
        }
    },
    end: () => pool.end()
};