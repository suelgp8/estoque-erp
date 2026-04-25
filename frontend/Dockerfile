FROM node:20-alpine AS development

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json

RUN npm ci --workspace frontend --include-workspace-root=false

EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace", "frontend"]

FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_URL
ARG VITE_ALLOWED_HOSTS
ARG VITE_BACKEND_TARGET

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ALLOWED_HOSTS=$VITE_ALLOWED_HOSTS
ENV VITE_BACKEND_TARGET=$VITE_BACKEND_TARGET

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json

RUN npm ci --workspace frontend --include-workspace-root=false

COPY frontend ./frontend

RUN npm run build --workspace frontend

FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
