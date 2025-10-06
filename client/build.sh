#!/bin/bash

# Clean previous build
echo "Cleaning previous build..."
rm -rf dist

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the application
echo "Building application..."
npm run build

# Check if build was successful
if [ -d "dist" ]; then
    echo "Build successful! Output directory: dist/"
    ls -la dist/
else
    echo "Build failed!"
    exit 1
fi 