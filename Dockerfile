# Build stage
FROM node:18-alpine as build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/

# Install dependencies
RUN npm install
RUN cd server && npm install

# Copy source code
COPY . .

# Build client
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy built client files and server
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

# Install production server dependencies
WORKDIR /app/server
RUN npm install --production

# Expose ports
EXPOSE 3000
EXPOSE 5173

# Start the server
CMD ["npm", "start"]
