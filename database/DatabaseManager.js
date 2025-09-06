import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

class DatabaseManager {
    constructor(dbPath = './databases') {
        this.dbPath = dbPath;
        this.connections = new Map();

        // Ensure database directory exists
        if (!fs.existsSync(dbPath)) {
            fs.mkdirSync(dbPath, { recursive: true });
        }
    }

    getDbFileName(userId, year) {
        return `user_${userId}_${year}.db`;
    }

    getConnection(userId, year) {
        const key = `${userId}_${year}`;

        if (this.connections.has(key)) {
            return this.connections.get(key);
        }

        const dbFile = path.join(this.dbPath, this.getDbFileName(userId, year));
        const db = new sqlite3.Database(dbFile);

        this.connections.set(key, db);
        this.initializeSchema(db);

        return db;
    }

    initializeSchema(db) {
        const schema = `
            -- Categories table
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
                is_default BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- Transactions table
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount DECIMAL(10,2) NOT NULL,
                date DATETIME NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
                category_id INTEGER NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            );

            -- Insert default categories if they don't exist
            INSERT OR IGNORE INTO categories (id, name, type, is_default) VALUES
                (1, 'Monthly Fund', 'income', 1),
                (2, 'Special Fund', 'income', 1),
                (3, 'Donation', 'income', 1),
                (4, 'Personal Money', 'income', 1),
                (5, 'Bank Loan', 'income', 1),
                (6, 'Borrowed Money', 'income', 1),
                (7, 'Others', 'income', 1),
                (8, 'Employee Salary', 'expense', 1),
                (9, 'Foods & Treats', 'expense', 1),
                (10, 'Conveyances', 'expense', 1),
                (11, 'Purchase', 'expense', 1),
                (12, 'Rents', 'expense', 1),
                (13, 'Utility Bills', 'expense', 1),
                (14, 'Others', 'expense', 1);

            -- Create indexes for better performance
            CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
            CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
            CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
            CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
        `;

        db.exec(schema, (err) => {
            if (err) {
                console.error('Error initializing database schema:', err);
            }
        });
    }

    closeConnection(userId, year) {
        const key = `${userId}_${year}`;
        const db = this.connections.get(key);

        if (db) {
            db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err);
                }
            });
            this.connections.delete(key);
        }
    }

    closeAllConnections() {
        for (const [key, db] of this.connections) {
            db.close((err) => {
                if (err) {
                    console.error(`Error closing database ${key}:`, err);
                }
            });
        }
        this.connections.clear();
    }

    // Get all years for a user
    getUserYears(userId) {
        const files = fs.readdirSync(this.dbPath);
        const userFiles = files.filter(file =>
            file.startsWith(`user_${userId}_`) && file.endsWith('.db')
        );

        return userFiles.map(file => {
            const match = file.match(/user_\d+_(\d{4})\.db/);
            return match ? parseInt(match[1]) : null;
        }).filter(year => year !== null).sort((a, b) => b - a);
    }

    // Backup database file
    backupDatabase(userId, year) {
        const dbFile = path.join(this.dbPath, this.getDbFileName(userId, year));
        const backupFile = path.join(this.dbPath, `backup_${this.getDbFileName(userId, year)}_${Date.now()}`);

        if (fs.existsSync(dbFile)) {
            fs.copyFileSync(dbFile, backupFile);
            return backupFile;
        }
        return null;
    }
}

export default new DatabaseManager();