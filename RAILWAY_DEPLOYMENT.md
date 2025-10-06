# 🚀 Railway Deployment Guide for CodeArena

This guide will help you deploy CodeArena to Railway with Gmail API integration for email functionality.

## ✅ What's Implemented

- **Gmail API Integration**: Modern, reliable email sending via Google's Gmail API
- **Docker Deployment**: Containerized application for Railway
- **Environment Detection**: Automatic configuration for Railway vs local development
- **Real Email Service**: No more mock emails - actual email delivery

## 🔧 Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Google Cloud Project**: For Gmail API integration
3. **MongoDB Database**: Either Railway's MongoDB or external MongoDB
4. **Git Repository**: Your CodeArena codebase

## 📋 Step-by-Step Deployment

### Step 1: Prepare Gmail API Credentials

Before deploying, you need to set up Gmail API:

1. **Create Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable Gmail API

2. **Create OAuth 2.0 Credentials**:
   - Go to **APIs & Services** → **Credentials**
   - Create **OAuth 2.0 Client ID** (Desktop application)
   - Download the credentials JSON file

3. **Generate Refresh Token**:
   ```bash
   cd server
   node generate-refresh-token.js
   ```
   - Follow the prompts to generate your refresh token
   - Save the credentials for Railway deployment

### Step 2: Deploy to Railway

#### Option A: Deploy via Railway CLI

1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Initialize Railway Project**:
   ```bash
   cd server
   railway init
   ```

4. **Deploy**:
   ```bash
   railway up
   ```

#### Option B: Deploy via GitHub Integration

1. **Connect Repository**:
   - Go to Railway dashboard
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your CodeArena repository

2. **Configure Build**:
   - Set root directory to `/server`
   - Build command: `npm install && npm run build`
   - Start command: `npm start`

### Step 3: Configure Environment Variables

In Railway dashboard, go to **Variables** tab and add:

```bash
# Core Environment
NODE_ENV=production
RAILWAY_ENVIRONMENT=production

# Database
MONGODB_URI=your_mongodb_connection_string

# Session & Security
SESSION_SECRET=your_session_secret_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret

# Frontend URLs
FRONTEND_URL=https://your-app-name.railway.app
API_URL=https://your-app-name.railway.app

# Gmail API Configuration (Required for Email)
GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret
GMAIL_REFRESH_TOKEN=your_gmail_refresh_token
GMAIL_USER_EMAIL=your_gmail_email@gmail.com
```

### Step 4: Configure MongoDB

#### Option A: Railway MongoDB (Recommended)

1. **Add MongoDB Service**:
   - In Railway dashboard, click "New Service"
   - Select "Database" → "MongoDB"
   - Railway will automatically set `MONGODB_URI`

#### Option B: External MongoDB

1. **Set MongoDB URI**:
   - Use your existing MongoDB connection string
   - Set `MONGODB_URI` environment variable

### Step 5: Deploy Frontend (Optional)

If you want to deploy the frontend to Railway as well:

1. **Create Frontend Service**:
   - Add new service in Railway
   - Set root directory to `/client`
   - Build command: `npm install && npm run build`
   - Output directory: `dist`

2. **Set Frontend Environment**:
   ```bash
   VITE_API_URL=https://your-backend-name.railway.app
   ```

## 🧪 Testing the Deployment

### 1. Check Deployment Status

```bash
railway status
```

### 2. View Logs

```bash
railway logs
```

### 3. Test Email Functionality

1. **Test Password Reset**:
   - Go to your deployed app
   - Try the password reset functionality
   - Check if verification emails are sent

2. **Check Server Logs**:
   - Look for Gmail API initialization messages
   - Verify email sending success/failure

### 4. Test Gmail API Connection

```bash
railway run node test-gmail-api.js
```

## 📊 Monitoring and Analytics

### Railway Dashboard
- **Deployments**: View deployment history and status
- **Logs**: Real-time application logs
- **Metrics**: CPU, memory, and network usage
- **Variables**: Environment variable management

### Gmail API Monitoring
- **Google Cloud Console**: API usage and quotas
- **Application Logs**: Email sending status
- **Railway Logs**: Service health and errors

## 🔒 Security Considerations

### Environment Variables
- **Never commit secrets** to version control
- **Use Railway Variables** for all sensitive data
- **Rotate credentials** periodically

### Gmail API Security
- **OAuth 2.0**: Secure authentication
- **Scoped Access**: Minimal required permissions
- **Refresh Token Rotation**: Regular token updates

### Railway Security
- **HTTPS Only**: Automatic SSL certificates
- **Isolated Containers**: Secure runtime environment
- **Access Control**: Team member permissions

## 🚨 Troubleshooting

### Common Deployment Issues

#### 1. Build Failures
- **Check Node.js version**: Ensure compatibility
- **Verify dependencies**: Check package.json
- **Build logs**: Review Railway build output

#### 2. Runtime Errors
- **Environment variables**: Verify all required vars are set
- **Database connection**: Check MongoDB URI
- **Gmail API**: Verify credentials and permissions

#### 3. Email Not Working
- **Check Gmail API setup**: Verify credentials
- **Review logs**: Look for authentication errors
- **Test locally**: Verify Gmail API works

### Debug Commands

```bash
# Check Railway status
railway status

# View logs
railway logs

# Run commands in Railway environment
railway run node test-gmail-api.js

# Access shell
railway shell
```

## 🔄 Updates and Maintenance

### Automatic Deployments
- **GitHub Integration**: Automatic deployment on push
- **Branch Deployments**: Deploy different branches
- **Rollback**: Easy deployment rollback

### Manual Updates
```bash
# Deploy latest changes
railway up

# Rollback to previous version
railway rollback

# Update environment variables
railway variables set KEY=value
```

## 📈 Scaling

### Railway Auto-scaling
- **Automatic**: Railway scales based on traffic
- **Manual**: Set custom scaling rules
- **Monitoring**: Track resource usage

### Performance Optimization
- **Database Indexing**: Optimize MongoDB queries
- **Caching**: Implement Redis if needed
- **CDN**: Use Railway's CDN for static assets

## 🎯 Next Steps

1. **Complete Deployment**: Follow all steps above
2. **Test Functionality**: Verify all features work
3. **Monitor Performance**: Set up alerts and monitoring
4. **Set Up CI/CD**: Configure automatic deployments
5. **Documentation**: Update team documentation

## 📚 Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [Gmail API Setup Guide](Documentations/GMAIL_API_SETUP.md)
- [Railway CLI Reference](https://docs.railway.app/reference/cli)
- [MongoDB Atlas](https://www.mongodb.com/atlas) (Alternative database)

## 🆘 Support

### Railway Support
- [Railway Discord](https://discord.gg/railway)
- [Railway Documentation](https://docs.railway.app/)
- [Railway Status](https://status.railway.app/)

### CodeArena Support
- Check application logs in Railway dashboard
- Review Gmail API setup guide
- Verify environment variable configuration

---

**Note**: This deployment guide assumes you have completed the Gmail API setup. If you haven't, please follow the [Gmail API Setup Guide](Documentations/GMAIL_API_SETUP.md) first. 