# Use a supported and up-to-date base image
FROM node:lts-bullseye

# Install required system packages
RUN apt-get update && \
    apt-get install -y ffmpeg imagemagick webp && \
    apt-get upgrade -y && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /usr/src/app

# Copy only package.json for layer caching
COPY package.json .

# Install NPM packages
RUN npm install && npm install -g qrcode-terminal pm2

# Copy the rest of your app
COPY . .

# Optional: Expose port (depends on your app)
EXPOSE 5000

# Start the app using npm
CMD ["npm", "start"]
