import express from "express";
import { registerRoutes } from "./appRouter";
import { setupVite, serveStatic, log } from "./viteIntegration";
import { connectToMongoDB } from "./db";
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

const app = express();

// Disable ETag to avoid 304 Not Modified responses on API
app.set('etag', false);

// Enable CORS for development
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || 'https://codecheddamra.up.railway.app'
    : 'https://codecheddamra.up.railway.app',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Ensure API responses are never cached (avoid 304 and stale HTML)
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Debug middleware to log all requests FIRST
app.use((req, res, next) => {
  console.log('----------------------------------------');
  console.log(`[DEBUG] Incoming request: ${req.method} ${req.url}`);
  console.log(`[DEBUG] Headers:`, req.headers);
  next();
});

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration (required for passport)
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Simple health check that responds immediately
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'API Server Running', 
    timestamp: new Date().toISOString(),
    port: process.env.PORT || '3000',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Port info endpoint for debugging
app.get('/port-info', (req, res) => {
  res.status(200).json({
    assignedPort: process.env.PORT || '3000',
    environment: process.env.NODE_ENV || 'development',
    host: '0.0.0.0',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint for Railway - responds immediately
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    port: process.env.PORT || '3000'
  });
});

// Mount auth routes BEFORE Vite and other routes
app.use('/api/auth', (req, res, next) => {
  console.log('[DEBUG] Auth route hit:', req.method, req.url);
  console.log('[DEBUG] Full path:', req.originalUrl);
  next();
}, authRoutes);
app.use('/auth', authRoutes);

// Activity logger (admin actions)
app.use(activityLogger());

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[DEBUG] Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

(async () => {
  // Create a basic HTTP server immediately for health checks
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = '0.0.0.0'; // Always bind to all interfaces for Railway
  
  // Start listening immediately for health checks
  app.listen(port, host, () => {
    console.log(`🚀 API Server running on http://${host}:${port}`);
    console.log(`🌐 Railway assigned port: ${process.env.PORT || '3000'}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('✅ Server is listening and ready for health checks');
    
    // Log environment check
    console.log('Environment check:');
    console.log(`- GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set'}`);
    console.log(`- GOOGLE_CLIENT_SECRET: ${process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not set'}`);
    console.log(`- SESSION_SECRET: ${process.env.SESSION_SECRET ? 'Set' : 'Not set'}`);
    console.log('----------------------------------------');
  });

  // Register routes in the background (non-blocking)
  try {
    const server = await registerRoutes(app);
    console.log('✅ Routes registered successfully');
    
    // Setup Vite AFTER routes are registered
    if (app.get("env") === "development") {
      try {
        await setupVite(app, server);
      } catch (e) {
        console.warn('[WARN] Vite dev server failed to start. Running API only. Start the client separately with "npm run dev" at the repo root.');
      }
    } else {
      // In production, don't serve static files - client runs separately
      console.log('🚀 Production mode: API-only server (client runs separately)');
    }
  } catch (error) {
    console.error('❌ Route registration failed:', error);
    console.log('⚠️  Server is running but routes failed to register');
  }

  // Connect to MongoDB in the background (non-blocking)
  try {
    await connectToMongoDB();
    console.log('✅ MongoDB connected successfully');
    
    // Initialize maintenance config after database connection
    const { initializeMaintenanceAfterDB } = await import('./middleware/maintenance');
    await initializeMaintenanceAfterDB();
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    console.log('⚠️  Server is running but database connection failed');
  }
})();
