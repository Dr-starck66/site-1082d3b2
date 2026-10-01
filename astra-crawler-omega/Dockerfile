FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY crawler.mjs server.mjs index.html ./
COPY test ./test
RUN npm test
ENV NODE_ENV=production
CMD ["node","server.mjs"]
