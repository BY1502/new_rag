# ============================================================
# RAG AI Frontend - Multi-stage Production Dockerfile
# ============================================================

# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# 의존성 설치 (캐시 레이어)
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# 소스 복사 + 빌드
COPY . .
ENV VITE_API_URL=/api/v1
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# 빌드 결과물 복사
COPY --from=build /app/dist /usr/share/nginx/html

# nginx 설정 복사
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 기본 nginx.conf 에서 server block 제거 (충돌 방지)
RUN rm -f /etc/nginx/conf.d/default.conf.bak

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
