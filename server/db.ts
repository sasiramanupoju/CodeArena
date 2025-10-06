import { MongoClient, Db, ReadPreferenceMode, WriteConcern } from 'mongodb';
import { EventEmitter } from 'events';
import mongoose from 'mongoose';

// Base MongoDB URL - using srv format for Atlas with test database
const MONGODB_URL = process.env.MONGODB_URL || "mongodb+srv://bandarin29:meritcurve@meritcurve.73u7fr7.mongodb.net/test";

// MongoDB connection options
const MONGODB_OPTIONS = {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  maxPoolSize: 50,
  minPoolSize: 10,
  retryWrites: true,
  retryReads: true,
  writeConcern: { w: 1, wtimeout: 2500 },
  readPreference: 'primary' as ReadPreferenceMode,
  monitorCommands: true,
};

class DatabaseConnection extends EventEmitter {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isConnecting: boolean = false;
  private connectionPromise: Promise<Db> | null = null;
  private static instance: DatabaseConnection;
  private mongooseConnection: typeof mongoose | null = null;

  private constructor() {
    super();
    this.connect = this.connect.bind(this);
    this.getDb = this.getDb.bind(this);
    this.close = this.close.bind(this);
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  private async waitForConnection(): Promise<void> {
    if (!this.client || !this.db) {
      throw new Error('No connection available');
    }

    let attempts = 0;
    const maxAttempts = 5;
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    while (attempts < maxAttempts) {
      try {
        // Try to ping the database
        await this.db.command({ ping: 1 });
        return; // Connection is working
      } catch (error) {
        attempts++;
        if (attempts === maxAttempts) {
          throw new Error('Failed to verify database connection');
        }
        await delay(1000); // Wait 1 second before retrying
      }
    }
  }

  async connect(): Promise<Db> {
    try {
      // If we're already connecting, return the existing promise
      if (this.isConnecting && this.connectionPromise) {
        return this.connectionPromise;
      }

      // If we already have a working connection, verify and return it
      if (this.client && this.db) {
        try {
          await this.waitForConnection();
          return this.db;
        } catch (error) {
          console.log('[DEBUG] Existing connection failed, creating new connection...');
          await this.close();
        }
      }

      this.isConnecting = true;
      
      // Connect using Mongoose first
      console.log('[DEBUG] Connecting to MongoDB with Mongoose...');
      await mongoose.connect(MONGODB_URL, {
        serverSelectionTimeoutMS: MONGODB_OPTIONS.serverSelectionTimeoutMS,
        socketTimeoutMS: MONGODB_OPTIONS.socketTimeoutMS,
      });

      this.mongooseConnection = mongoose;
      console.log('[DEBUG] Mongoose connection successful');

      // Set up Mongoose connection event handlers
      mongoose.connection.on('error', (error) => {
        console.error('[DEBUG] Mongoose connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        console.log('[DEBUG] Mongoose disconnected');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('[DEBUG] Mongoose reconnected');
      });

      // Now connect with MongoClient for raw operations
      this.connectionPromise = new Promise(async (resolve, reject) => {
        try {
          console.log('[DEBUG] Initializing MongoDB connection...');
          
          this.client = new MongoClient(MONGODB_URL, MONGODB_OPTIONS);

          // Connect to MongoDB
          await this.client.connect();
          console.log('[DEBUG] Connected to MongoDB server');

          // Get database instance
          this.db = this.client.db();
          console.log('[DEBUG] Database instance created');

          // Verify the connection works
          await this.waitForConnection();
          console.log('[DEBUG] Connection verified');

          // Set up error handling
          this.client.on('error', (error) => {
            console.error('[DEBUG] MongoDB client error:', error);
            this.handleError(error);
          });

          this.client.on('timeout', () => {
            console.error('[DEBUG] MongoDB operation timeout');
            this.handleError(new Error('Operation timeout'));
          });

          resolve(this.db);
        } catch (error) {
          console.error('[DEBUG] Failed to connect to MongoDB:', error);
          this.isConnecting = false;
          this.connectionPromise = null;
          reject(error);
        }
      });

      const db = await this.connectionPromise;
      this.isConnecting = false;
      return db;
    } catch (error) {
      this.isConnecting = false;
      this.connectionPromise = null;
      console.error('[DEBUG] Connection error:', error);
      throw error;
    }
  }
  private async handleError(error: Error): Promise<void> {
    console.error('[DEBUG] Handling MongoDB error:', error);
    console.error('[DEBUG] Error stack:', error.stack);
    
    // Close the existing connection
    await this.close();
    
    // Reset connection state
    this.isConnecting = false;
    this.connectionPromise = null;
    
    // Emit error event
    this.emit('error', error);
  }

  getDb(): Db {
    if (!this.db || !this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  async close(): Promise<void> {
    try {
      if (this.mongooseConnection) {
        await this.mongooseConnection.disconnect();
        console.log('[DEBUG] Mongoose connection closed');
      }

      if (this.client) {
        await this.client.close(true); // Force close
        this.client = null;
        this.db = null;
        this.isConnecting = false;
        this.connectionPromise = null;
        console.log('[DEBUG] MongoDB connection closed');
      }
    } catch (error) {
      console.error('[DEBUG] Error closing MongoDB connection:', error);
      throw error;
    }
  }
}

// Export singleton instance functions
export const connectToMongoDB = async (): Promise<Db> => {
  return DatabaseConnection.getInstance().connect();
};

export const getDb = (): Db => {
  try {
    const connection = DatabaseConnection.getInstance();
    const db = connection.getDb();
    
    // Test the connection
    db.command({ ping: 1 }).catch(async (error) => {
      console.error('[DEBUG] Database ping failed:', error);
      // Try to reconnect
      await connection.connect();
    });
    
    return db;
  } catch (error) {
    console.error('[DEBUG] Error getting database connection:', error);
    throw new Error('Database connection error. Please try again.');
  }
};

export const closeMongoDB = async (): Promise<void> => {
  return DatabaseConnection.getInstance().close();
};