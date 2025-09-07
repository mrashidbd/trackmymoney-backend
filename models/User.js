import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

class User {
    constructor() {
        this.dbPath = './databases/users.db';
        this.initializeUsersDb();
    }

    initializeUsersDb() {
        // Ensure database directory exists
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const db = new sqlite3.Database(this.dbPath);

        const schema = `
            CREATE TABLE IF NOT EXISTS users (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 username TEXT UNIQUE NOT NULL,
                 password_hash TEXT NOT NULL,
                 name TEXT NOT NULL,
                 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                 last_login DATETIME,
                 is_active BOOLEAN DEFAULT 1
            );
        `;

        db.exec(schema, async (err) => {
            if (err) {
                console.error('Error initializing users database:', err);
                db.close();
                return;
            }

            // Check if admin user exists, if not create it
            db.get('SELECT id FROM users WHERE username = ?', ['admin'], async (err, user) => {
                if (!user) {
                    try {
                        const hashedPassword = await bcrypt.hash('admin123', 10);
                        db.run(
                            'INSERT INTO users (id, username, password_hash, name) VALUES (?, ?, ?, ?)',
                            [1, 'admin', hashedPassword, 'Admin User'],
                            (err) => {
                                if (err) console.error('Error creating admin user:', err);
                                db.close();
                            }
                        );
                    } catch (error) {
                        console.error('Error hashing password:', error);
                        db.close();
                    }
                } else {
                    db.close();
                }
            });
        });
    }

    async authenticate(username, password) {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath);

            db.get(
                'SELECT * FROM users WHERE username = ? AND is_active = 1',
                [username],
                async (err, user) => {
                    if (err) {
                        db.close();
                        return reject(err);
                    }

                    if (!user) {
                        db.close();
                        return resolve(null);
                    }

                    try {
                        // For default admin user, check if password is 'admin123'
                        if (user.id === 1 && password === 'admin123') {
                            // Update password hash for default user
                            const hashedPassword = await bcrypt.hash(password, 10);
                            db.run(
                                'UPDATE users SET password_hash = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?',
                                [hashedPassword, user.id],
                                () => {
                                    db.close();
                                    resolve({
                                        id: user.id,
                                        username: user.username,
                                        name: user.name
                                    });
                                }
                            );
                        } else {
                            const isValid = await bcrypt.compare(password, user.password_hash);

                            if (isValid) {
                                // Update last login
                                db.run(
                                    'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                                    [user.id],
                                    () => {
                                        db.close();
                                        resolve({
                                            id: user.id,
                                            username: user.username,
                                            name: user.name
                                        });
                                    }
                                );
                            } else {
                                db.close();
                                resolve(null);
                            }
                        }
                    } catch (error) {
                        db.close();
                        reject(error);
                    }
                }
            );
        });
    }

    async createUser(username, password, name) {
        return new Promise(async (resolve, reject) => {
            try {
                const hashedPassword = await bcrypt.hash(password, 10);
                const db = new sqlite3.Database(this.dbPath);

                db.run(
                    'INSERT INTO users (username, password_hash, name) VALUES (?, ?, ?)',
                    [username, hashedPassword, name],
                    function(err) {
                        if (err) {
                            db.close();
                            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                                return reject(new Error('Username already exists'));
                            }
                            return reject(err);
                        }

                        db.close();
                        resolve({
                            id: this.lastID,
                            username,
                            name
                        });
                    }
                );
            } catch (error) {
                reject(error);
            }
        });
    }

    async getUserById(id) {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath);

            db.get(
                'SELECT id, username, name, created_at, last_login FROM users WHERE id = ? AND is_active = 1',
                [id],
                (err, user) => {
                    db.close();
                    if (err) {
                        return reject(err);
                    }
                    resolve(user);
                }
            );
        });
    }
}

export default new User();