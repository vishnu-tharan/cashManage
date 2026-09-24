# Stage 1: Build the client
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Setup the server
FROM node:22-alpine
WORKDIR /app
RUN mkdir -p /app/server /app/client
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./

# Copy the built client to where the server expects it
COPY --from=client-build /app/client/dist /app/client/dist

# Ensure the server directory is the working directory
WORKDIR /app/server

# Set environment variables for data persistence
ENV NODE_ENV=production
ENV DB_PATH=/app/data/cashmanage.db
ENV MFA_KEY_PATH=/app/data/.mfa-key
ENV PORT=3000
# APP_ORIGIN must be set at runtime, e.g., http://localhost:3000 or your HTTPS origin

# Expose the port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
