FROM node:18-alpine

# Install yt-dlp, ffmpeg and dependencies
RUN apk add --no-cache python3 py3-pip ffmpeg curl bash

# Install yt-dlp globally and ensure it's in PATH
RUN pip3 install --break-system-packages yt-dlp && \
    ln -sf /usr/bin/yt-dlp /usr/local/bin/yt-dlp || true

# Verify yt-dlp installation
RUN which yt-dlp && yt-dlp --version

# Create app directory
WORKDIR /app

# Create temp directory for downloads
RUN mkdir -p /app/temp

# Copy package files
COPY package*.json ./
RUN npm install --production

# Copy app files
COPY . .

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start server
CMD ["node", "server.js"]
