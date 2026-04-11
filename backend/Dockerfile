FROM node:20-bookworm-slim AS builder

WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/estoque_erp?schema=public

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json

RUN npm ci --workspace backend --include-workspace-root=false

COPY backend/prisma.config.ts ./backend/prisma.config.ts
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/prisma ./backend/prisma
COPY backend/src ./backend/src

RUN npm run prisma:generate --workspace backend
RUN npm run build --workspace backend

FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/estoque_erp?schema=public
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update -y && apt-get install -y openssl chromium && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json

RUN npm ci --omit=dev --workspace backend --include-workspace-root=false

COPY backend/prisma.config.ts ./backend/prisma.config.ts
COPY backend/prisma ./backend/prisma
RUN npm run prisma:generate --workspace backend

COPY --from=builder /app/backend/dist ./backend/dist

WORKDIR /app/backend
EXPOSE 3000

CMD ["npm", "run", "start"]
