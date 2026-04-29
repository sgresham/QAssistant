# frontend/Dockerfile

# 1. Build stage
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# 2. Production stage
FROM nginx:alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom Nginx config (Ensure you have a default.conf in ./frontend/nginx/conf.d/)
# If you don't have a local config file yet, we will use environment variables or a simple inline config later.
# For now, let's assume you have a config file ready or we'll use the mount method.
# COPY ./nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Expose ports
EXPOSE 8111

CMD ["nginx", "-g", "daemon off;"]
