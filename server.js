import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import usersRoutes from './routes/users.js';

// Import routes
import authRoutes from './routes/auth.js';
import categoriesRoutes from './routes/categories.js';
import transactionsRoutes from './routes/transactions.js';

// Import middleware
import { authenticateToken } from './middleware/auth.js';

// Import database manager
import DatabaseManager from './database/DatabaseManager.js';

// ES6 dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Track My Money API is running',
        timestamp: new Date().toISOString()
    });
});

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/categories', authenticateToken, categoriesRoutes);
app.use('/api/transactions', authenticateToken, transactionsRoutes);

// User routes
app.use('/api/users', authenticateToken, usersRoutes);

// Get available years for user
app.get('/api/years', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const years = DatabaseManager.getUserYears(userId);

        // If no years found, return current year
        if (years.length === 0) {
            years.push(new Date().getFullYear());
        }

        res.json({
            success: true,
            data: years
        });
    } catch (error) {
        console.error('Error getting user years:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get years'
        });
    }
});

// Backup endpoint
app.post('/api/backup/:year', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const year = req.params.year;

        const backupFile = DatabaseManager.backupDatabase(userId, year);

        if (backupFile) {
            res.json({
                success: true,
                message: 'Backup created successfully',
                backupFile: path.basename(backupFile)
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'No database found for the specified year'
            });
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create backup'
        });
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT. Closing database connections...');
    DatabaseManager.closeAllConnections();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM. Closing database connections...');
    DatabaseManager.closeAllConnections();
    process.exit(0);
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Track My Money API server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
    console.log(`💾 Database Path: ${process.env.DB_PATH || './databases'}`);
});

export default app;