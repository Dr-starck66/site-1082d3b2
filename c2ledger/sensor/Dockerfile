FROM oven/bun:1-alpine
WORKDIR /app
COPY sensor/index.ts ./sensor/index.ts
ENV NODE_ENV=production PORT=3100
EXPOSE 3100
CMD ["bun","run","sensor/index.ts"]
