FROM node:22-alpine

WORKDIR /app

# 先装依赖(利用层缓存)。仅装运行依赖(tsx/pg/ws 均为 dependencies),
# 因为 Fly 端不构建客户端——客户端由 GitHub Pages 托管。
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 复制源码(tsx 直接运行 TS,无需预编译)
COPY . .

ENV PORT=8080
EXPOSE 8080

# 健康检查走 /healthz(Fly HEALTHCHECK 探测用)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz >/dev/null 2>&1 || exit 1

CMD ["npm", "start"]
