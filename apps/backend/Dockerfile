FROM node:20-alpine

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

# Install all workspace dependencies
RUN npm install

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/backend/ ./apps/backend/
COPY tsconfig.base.json ./

# Build shared package then backend
RUN npm run build -w packages/shared
RUN npm run build -w apps/backend

EXPOSE 3000

CMD ["node", "apps/backend/dist/server.js"]
