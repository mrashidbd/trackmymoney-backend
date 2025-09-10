import express from 'express';
import DatabaseManager from '../database/DatabaseManager.js';

const router = express.Router();

// Helper to get userId from query or req.user
const getUserId = (req) => {
    // If superadmin and userId is provided in query, use that
    if (req.user.role === 'superadmin' && req.query.userId) {
        return parseInt(req.query.userId);
    }
    // Otherwise use the authenticated user's ID
    return req.user.id;
};

// Get all categories for current year
router.get('/', (req, res) => {
    const userId = getUserId(req);
    const year = req.query.year || new Date().getFullYear();
    const db = DatabaseManager.getConnection(userId, year);

    db.all(
        'SELECT * FROM categories ORDER BY type, name',
        [],
        (err, categories) => {
            if (err) {
                console.error('Error fetching categories:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch categories'
                });
            }

            res.json({
                success: true,
                data: categories.map(cat => ({
                    id: cat.id,
                    name: cat.name,
                    type: cat.type,
                    isDefault: cat.is_default === 1,
                    createdAt: cat.created_at,
                    updatedAt: cat.updated_at
                }))
            });
        }
    );
});

// Add new category
router.post('/', (req, res) => {
    const userId = getUserId(req);
    const year = req.query.year || new Date().getFullYear();
    const { name, type } = req.body;

    if (!name || !type) {
        return res.status(400).json({
            success: false,
            message: 'Name and type are required'
        });
    }

    if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({
            success: false,
            message: 'Type must be income or expense'
        });
    }

    const db = DatabaseManager.getConnection(userId, year);

    db.run(
        'INSERT INTO categories (name, type, is_default) VALUES (?, ?, 0)',
        [name, type],
        function(err) {
            if (err) {
                console.error('Error creating category:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to create category'
                });
            }

            // Fetch the created category
            db.get(
                'SELECT * FROM categories WHERE id = ?',
                [this.lastID],
                (err, category) => {
                    if (err) {
                        console.error('Error fetching created category:', err);
                        return res.status(500).json({
                            success: false,
                            message: 'Category created but failed to fetch'
                        });
                    }

                    res.status(201).json({
                        success: true,
                        data: {
                            id: category.id,
                            name: category.name,
                            type: category.type,
                            isDefault: category.is_default === 1,
                            createdAt: category.created_at,
                            updatedAt: category.updated_at
                        }
                    });
                }
            );
        }
    );
});

// Update category
router.put('/:id', (req, res) => {
    const userId = getUserId(req);
    const year = req.query.year || new Date().getFullYear();
    const categoryId = req.params.id;
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            message: 'Name is required'
        });
    }

    const db = DatabaseManager.getConnection(userId, year);

    db.run(
        'UPDATE categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [name, categoryId],
        function(err) {
            if (err) {
                console.error('Error updating category:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to update category'
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Category not found'
                });
            }

            // Fetch the updated category
            db.get(
                'SELECT * FROM categories WHERE id = ?',
                [categoryId],
                (err, category) => {
                    if (err) {
                        console.error('Error fetching updated category:', err);
                        return res.status(500).json({
                            success: false,
                            message: 'Category updated but failed to fetch'
                        });
                    }

                    res.json({
                        success: true,
                        data: {
                            id: category.id,
                            name: category.name,
                            type: category.type,
                            isDefault: category.is_default === 1,
                            createdAt: category.created_at,
                            updatedAt: category.updated_at
                        }
                    });
                }
            );
        }
    );
});

// Delete category
router.delete('/:id', (req, res) => {
    const userId = getUserId(req);
    const year = req.query.year || new Date().getFullYear();
    const categoryId = req.params.id;
    const db = DatabaseManager.getConnection(userId, year);

    // Check if category is default
    db.get(
        'SELECT is_default FROM categories WHERE id = ?',
        [categoryId],
        (err, category) => {
            if (err) {
                console.error('Error checking category:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to check category'
                });
            }

            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Category not found'
                });
            }

            if (category.is_default === 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete default categories'
                });
            }

            // Check if category is used in transactions
            db.get(
                'SELECT COUNT(*) as count FROM transactions WHERE category_id = ?',
                [categoryId],
                (err, result) => {
                    if (err) {
                        console.error('Error checking category usage:', err);
                        return res.status(500).json({
                            success: false,
                            message: 'Failed to check category usage'
                        });
                    }

                    if (result.count > 0) {
                        return res.status(400).json({
                            success: false,
                            message: `Cannot delete category. It is used in ${result.count} transaction(s)`
                        });
                    }

                    // Delete category
                    db.run(
                        'DELETE FROM categories WHERE id = ?',
                        [categoryId],
                        function(err) {
                            if (err) {
                                console.error('Error deleting category:', err);
                                return res.status(500).json({
                                    success: false,
                                    message: 'Failed to delete category'
                                });
                            }

                            res.json({
                                success: true,
                                message: 'Category deleted successfully'
                            });
                        }
                    );
                }
            );
        }
    );
});

export default router;