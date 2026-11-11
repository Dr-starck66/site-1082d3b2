FROM oven/bun:1-alpine
WORKDIR /app
COPY range-node/index.ts ./range-node/index.ts
ENV NODE_ENV=production PORT=3200
EXPOSE 3200
CMD ["bun","run","range-node/index.ts"]
