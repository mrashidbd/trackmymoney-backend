import express from 'express';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Middleware to check if user is superadmin
const requireSuperAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Super admin privileges required.'
        });
    }
    next();
};

// Get all users (SuperAdmin only)
router.get('/', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const users = await User.getAllUsers();
        res.json({
            success: true,
            data: users
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users'
        });
    }
});

// Create new user (SuperAdmin only)
router.post('/', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const { username, password, name, role = 'user' } = req.body;

        if (!username || !password || !name) {
            return res.status(400).json({
                success: false,
                message: 'Username, password, and name are required'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        const user = await User.createUser(username, password, name);

        // Update role if different from default
        if (role !== 'user') {
            await User.updateUser(user.id, { role });
        }

        res.status(201).json({
            success: true,
            data: { ...user, role }
        });
    } catch (error) {
        console.error('Error creating user:', error);

        if (error.message === 'Username already exists') {
            return res.status(409).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to create user'
        });
    }
});

// Update user (SuperAdmin only)
router.put('/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { name, password, role, is_active } = req.body;

        const result = await User.updateUser(userId, { name, password, role, is_active });

        if (!result.success) {
            return res.status(404).json(result);
        }

        res.json(result);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user'
        });
    }
});

// Delete user (SuperAdmin only) - Actually just deactivates
router.delete('/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        // Don't allow deleting superadmin
        const user = await User.getUserById(userId);
        if (user && user.role === 'superadmin') {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete superadmin user'
            });
        }

        const result = await User.updateUser(userId, { is_active: false });

        if (!result.success) {
            return res.status(404).json(result);
        }

        res.json({
            success: true,
            message: 'User deactivated successfully'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user'
        });
    }
});

export default router;