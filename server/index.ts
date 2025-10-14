import express from "express";
import { registerRoutes } from "./appRouter";
import { setupVite, serveStatic, log } from "./viteIntegration";
import { connectToMongoDB, dbHealthCheck } from "./db";
import { MaintenanceConfig } from "./models/MaintenanceConfig";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import passport from "passport";
import session from "express-session";
import cors from "cors";
import { Request, Response, NextFunction } from "express";
import { activityLogger } from './middleware/activityLogger';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['SESSION_SECRET', 'MONGODB_URL'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

// Validate SESSION_SECRET strength
if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
  console.warn('⚠️  SESSION_SECRET should be at least 32 characters long for security.');
}

const app = express();

// Configuration from environment variables
const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5000',
  corsOrigin: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5000',
  corsCredentials: process.env.CORS_CREDENTIALS === 'true',
  debugMode: process.env.DEBUG_MODE === 'true',
  logLevel: process.env.LOG_LEVEL || 'info',
  sessionSecret: process.env.SESSION_SECRET!,
  sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000'), // 24 hours default
};

// Disable ETag to avoid 304 Not Modified responses on API
app.set('etag', false);

// CORS configuration
const corsOrigins = config.corsOrigin.split(',').map(origin => origin.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (corsOrigins.includes(origin) || corsOrigins.includes('*')) {
      return callback(null, true);
    }
    
    // In development, allow localhost with any port
    if (config.nodeEnv === 'development' && origin.includes('localhost')) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: config.corsCredentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Ensure API responses are never cached (avoid 304 and stale HTML)
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Debug middleware (only in debug mode)
if (config.debugMode) {
  app.use((req, res, next) => {
    console.log('----------------------------------------');
    console.log(`[DEBUG] ${new Date().toISOString()} ${req.method} ${req.url}`);
    if (config.logLevel === 'debug') {
      console.log(`[DEBUG] Headers:`, req.headers);
    }
    next();
  });
}

// Parse JSON bodies with size limit
app.use(express.json({ 
  limit: process.env.JSON_SIZE_LIMIT || '10mb'
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: process.env.URL_ENCODED_LIMIT || '10mb'
}));

// Session configuration
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false, // Changed to false for security
  name: process.env.SESSION_NAME || 'codearena.sid', // Custom session name
  cookie: {
    secure: config.nodeEnv === 'production', // HTTPS only in production
    httpOnly: true, // Prevent XSS
    maxAge: config.sessionMaxAge,
    sameSite: config.nodeEnv === 'production' ? 'strict' : 'lax'
  }
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Health check endpoints
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'API Server Running', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: config.nodeEnv,
    port: config.port
  });
});

app.get('/health', async (req, res) => {
  try {
    const dbHealth = await dbHealthCheck();
    
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealth,
        server: { status: 'connected' }
      },
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Mount auth routes
app.use('/api/auth', (req, res, next) => {
  if (config.debugMode) {
    console.log('[AUTH] Route hit:', req.method, req.url);
  }
  next();
}, authRoutes);

// Backward compatibility
app.use('/auth', authRoutes);

// Activity logger (admin actions)
app.use(activityLogger());

// Global error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[ERROR]', err.stack || err.message);
  
  // Don't leak error details in production
  const errorResponse = config.nodeEnv === 'production' 
    ? { error: 'Internal Server Error' }
    : { error: err.message, stack: err.stack };
    
  res.status(500).json(errorResponse);
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, starting graceful shutdown...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, starting graceful shutdown...');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Start server
(async () => {
  try {
    // Start listening
    const server = app.listen(config.port, config.host, () => {
      console.log(`🚀 CodeArena API Server`);
      console.log(`📍 Running on http://${config.host}:${config.port}`);
      console.log(`🔧 Environment: ${config.nodeEnv}`);
      console.log(`🌐 CORS Origin: ${config.corsOrigin}`);
      console.log(`🎯 Frontend URL: ${config.frontendUrl}`);
      console.log('✅ Server is ready and listening');
    });

    // Register routes
    try {
      await registerRoutes(app);
      console.log('✅ Routes registered successfully');
      
      // Setup Vite in development
      if (config.nodeEnv === "development") {
        try {
          await setupVite(app, server);
          console.log('✅ Vite dev server integrated');
        } catch (viteError) {
          console.warn('⚠️  Vite dev server failed to start. Running API-only mode.');
          console.warn('💡 Start the client separately with "npm run dev" in the client directory.');
        }
      } else {
        console.log('🚀 Production mode: API-only server');
      }
    } catch (routeError) {
      console.error('❌ Route registration failed:', routeError);
      console.log('⚠️  Server is running but some routes may not work');
    }

    // Connect to MongoDB
    try {
      await connectToMongoDB();
      console.log('✅ MongoDB connected successfully');
      
      // Initialize maintenance config
      const { initializeMaintenanceAfterDB } = await import('./middleware/maintenance');
      await initializeMaintenanceAfterDB();
      console.log('✅ Maintenance configuration initialized');
    } catch (dbError) {
      console.error('❌ MongoDB connection failed:', dbError);
      console.log('⚠️  Server is running but database features will not work');
      
      if (config.nodeEnv === 'production') {
        console.error('❌ Database is required in production. Shutting down...');
        process.exit(1);
      }
    }

    // Log final status
    console.log('\n🎉 CodeArena API Server fully initialized!');
    console.log('📊 System Status:');
    console.log(`   - Server: ✅ Running on port ${config.port}`);
    console.log(`   - Environment: ${config.nodeEnv}`);
    console.log(`   - Debug Mode: ${config.debugMode ? 'ON' : 'OFF'}`);
    console.log('\n🔗 Quick Links:');
    console.log(`   - Health Check: http://${config.host}:${config.port}/health`);
    console.log(`   - API Docs: http://${config.host}:${config.port}/api`);
    console.log('=====================================\n');
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
})();