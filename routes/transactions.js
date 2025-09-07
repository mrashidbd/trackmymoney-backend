import express from 'express';
import DatabaseManager from '../database/DatabaseManager.js';

const router = express.Router();

// Get all transactions for current year
// Get all transactions for current year with pagination
router.get('/', (req, res) => {
    const userId = req.user.id;
    const year = req.query.year || new Date().getFullYear();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const db = DatabaseManager.getConnection(userId, year);

    // Get total count first
    const countQuery = 'SELECT COUNT(*) as total FROM transactions';

    db.get(countQuery, [], (err, countResult) => {
        if (err) {
            console.error('Error counting transactions:', err);
            return res.status(500).json({
                success: false,
                message: 'Failed to count transactions'
            });
        }

        const totalCount = countResult.total;
        const totalPages = Math.ceil(totalCount / limit);

        // Get paginated transactions
        const query = `
            SELECT t.*, c.name as category_name, c.type as category_type
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            ORDER BY t.date DESC, t.id DESC
            LIMIT ? OFFSET ?
        `;

        db.all(query, [limit, offset], (err, transactions) => {
            if (err) {
                console.error('Error fetching transactions:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch transactions'
                });
            }

            res.json({
                success: true,
                data: transactions.map(t => ({
                    id: t.id,
                    amount: parseFloat(t.amount),
                    date: t.date,
                    type: t.type,
                    categoryId: t.category_id,
                    categoryName: t.category_name,
                    description: t.description || '',
                    createdAt: t.created_at,
                    updatedAt: t.updated_at
                })),
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalCount,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            });
        });
    });
});

// Get transactions by date range
router.get('/range', (req, res) => {
    const userId = req.user.id;
    const year = req.query.year || new Date().getFullYear();
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({
            success: false,
            message: 'Start date and end date are required'
        });
    }

    const db = DatabaseManager.getConnection(userId, year);

    const query = `
        SELECT t.*, c.name as category_name, c.type as category_type
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE DATE(t.date) BETWEEN DATE(?) AND DATE(?)
        ORDER BY t.date DESC, t.id DESC
    `;

    db.all(query, [startDate, endDate], (err, transactions) => {
        if (err) {
            console.error('Error fetching transactions by range:', err);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch transactions'
            });
        }

        res.json({
            success: true,
            data: transactions.map(t => ({
                id: t.id,
                amount: parseFloat(t.amount),
                date: t.date,
                type: t.type,
                categoryId: t.category_id,
                categoryName: t.category_name,
                description: t.description || '',
                createdAt: t.created_at,
                updatedAt: t.updated_at
            }))
        });
    });
});

// Add new transaction
router.post('/', (req, res) => {
    const userId = req.user.id;
    const { amount, date, type, categoryId, description } = req.body;

    if (!amount || !date || !type || !categoryId) {
        return res.status(400).json({
            success: false,
            message: 'Amount, date, type, and category are required'
        });
    }

    if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({
            success: false,
            message: 'Type must be income or expense'
        });
    }

    if (parseFloat(amount) <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Amount must be greater than 0'
        });
    }

    const transactionYear = new Date(date).getFullYear();
    const db = DatabaseManager.getConnection(userId, transactionYear);

    // Verify category exists
    db.get(
        'SELECT id FROM categories WHERE id = ?',
        [categoryId],
        (err, category) => {
            if (err) {
                console.error('Error checking category:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to verify category'
                });
            }

            if (!category) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid category'
                });
            }

            // Insert transaction
            db.run(
                'INSERT INTO transactions (amount, date, type, category_id, description) VALUES (?, ?, ?, ?, ?)',
                [amount, date, type, categoryId, description || ''],
                function(err) {
                    if (err) {
                        console.error('Error creating transaction:', err);
                        return res.status(500).json({
                            success: false,
                            message: 'Failed to create transaction'
                        });
                    }

                    // Fetch the created transaction with category info
                    db.get(
                        `SELECT t.*, c.name as category_name, c.type as category_type
                         FROM transactions t
                         LEFT JOIN categories c ON t.category_id = c.id
                         WHERE t.id = ?`,
                        [this.lastID],
                        (err, transaction) => {
                            if (err) {
                                console.error('Error fetching created transaction:', err);
                                return res.status(500).json({
                                    success: false,
                                    message: 'Transaction created but failed to fetch'
                                });
                            }

                            res.status(201).json({
                                success: true,
                                data: {
                                    id: transaction.id,
                                    amount: parseFloat(transaction.amount),
                                    date: transaction.date,
                                    type: transaction.type,
                                    categoryId: transaction.category_id,
                                    categoryName: transaction.category_name,
                                    description: transaction.description || '',
                                    createdAt: transaction.created_at,
                                    updatedAt: transaction.updated_at
                                }
                            });
                        }
                    );
                }
            );
        }
    );
});

// Update transaction
router.put('/:id', (req, res) => {
    const userId = req.user.id;
    const transactionId = req.params.id;
    const { amount, date, type, categoryId, description } = req.body;

    if (!amount || !date || !type || !categoryId) {
        return res.status(400).json({
            success: false,
            message: 'Amount, date, type, and category are required'
        });
    }

    if (parseFloat(amount) <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Amount must be greater than 0'
        });
    }

    const transactionYear = new Date(date).getFullYear();
    const db = DatabaseManager.getConnection(userId, transactionYear);

    // Verify category exists
    db.get(
        'SELECT id FROM categories WHERE id = ?',
        [categoryId],
        (err, category) => {
            if (err) {
                console.error('Error checking category:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to verify category'
                });
            }

            if (!category) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid category'
                });
            }

            // Update transaction
            db.run(
                'UPDATE transactions SET amount = ?, date = ?, type = ?, category_id = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [amount, date, type, categoryId, description || '', transactionId],
                function(err) {
                    if (err) {
                        console.error('Error updating transaction:', err);
                        return res.status(500).json({
                            success: false,
                            message: 'Failed to update transaction'
                        });
                    }

                    if (this.changes === 0) {
                        return res.status(404).json({
                            success: false,
                            message: 'Transaction not found'
                        });
                    }

                    // Fetch the updated transaction with category info
                    db.get(
                        `SELECT t.*, c.name as category_name, c.type as category_type
                         FROM transactions t
                         LEFT JOIN categories c ON t.category_id = c.id
                         WHERE t.id = ?`,
                        [transactionId],
                        (err, transaction) => {
                            if (err) {
                                console.error('Error fetching updated transaction:', err);
                                return res.status(500).json({
                                    success: false,
                                    message: 'Transaction updated but failed to fetch'
                                });
                            }

                            res.json({
                                success: true,
                                data: {
                                    id: transaction.id,
                                    amount: parseFloat(transaction.amount),
                                    date: transaction.date,
                                    type: transaction.type,
                                    categoryId: transaction.category_id,
                                    categoryName: transaction.category_name,
                                    description: transaction.description || '',
                                    createdAt: transaction.created_at,
                                    updatedAt: transaction.updated_at
                                }
                            });
                        }
                    );
                }
            );
        }
    );
});

// Delete transaction
router.delete('/:id', (req, res) => {
    const userId = req.user.id;
    const transactionId = req.params.id;
    const year = req.query.year || new Date().getFullYear();
    const db = DatabaseManager.getConnection(userId, year);

    db.run(
        'DELETE FROM transactions WHERE id = ?',
        [transactionId],
        function(err) {
            if (err) {
                console.error('Error deleting transaction:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to delete transaction'
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found'
                });
            }

            res.json({
                success: true,
                message: 'Transaction deleted successfully'
            });
        }
    );
});

// Get statistics
router.get('/stats', (req, res) => {
    const userId = req.user.id;
    const year = req.query.year || new Date().getFullYear();
    const db = DatabaseManager.getConnection(userId, year);

    const queries = {
        totalIncome: 'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = "income"',
        totalExpenses: 'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = "expense"',
        transactionCount: 'SELECT COUNT(*) as count FROM transactions',
        monthlyStats: `
            SELECT 
                strftime('%Y-%m', date) as month,
                type,
                SUM(amount) as total
            FROM transactions 
            WHERE strftime('%Y', date) = ?
            GROUP BY strftime('%Y-%m', date), type
            ORDER BY month
        `
    };

    const results = {};

    // Execute queries
    db.get(queries.totalIncome, [], (err, result) => {
        if (err) {
            console.error('Error getting income stats:', err);
            return res.status(500).json({ success: false, message: 'Failed to get statistics' });
        }
        results.totalIncome = parseFloat(result.total);

        db.get(queries.totalExpenses, [], (err, result) => {
            if (err) {
                console.error('Error getting expense stats:', err);
                return res.status(500).json({ success: false, message: 'Failed to get statistics' });
            }
            results.totalExpenses = parseFloat(result.total);

            db.get(queries.transactionCount, [], (err, result) => {
                if (err) {
                    console.error('Error getting transaction count:', err);
                    return res.status(500).json({ success: false, message: 'Failed to get statistics' });
                }
                results.transactionCount = result.count;

                db.all(queries.monthlyStats, [year.toString()], (err, monthlyData) => {
                    if (err) {
                        console.error('Error getting monthly stats:', err);
                        return res.status(500).json({ success: false, message: 'Failed to get statistics' });
                    }

                    // Process monthly data
                    const monthlyStats = {};
                    monthlyData.forEach(row => {
                        if (!monthlyStats[row.month]) {
                            monthlyStats[row.month] = { income: 0, expenses: 0 };
                        }
                        monthlyStats[row.month][row.type === 'income' ? 'income' : 'expenses'] = parseFloat(row.total);
                    });

                    results.netBalance = results.totalIncome - results.totalExpenses;
                    results.monthlyStats = monthlyStats;

                    res.json({
                        success: true,
                        data: results
                    });
                });
            });
        });
    });
});

export default router;