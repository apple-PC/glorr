FROM node:22-alpine

WORKDIR /app

# 先装依赖(利用层缓存)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 构建客户端并启动服务端(HTTP + WebSocket 同端口)
COPY . .
RUN npm run build:client

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT}/ >/dev/null 2>&1 || exit 1

CMD ["npm", "start"]
