FROM oven/bun:1-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun","run","src/index.ts"]
