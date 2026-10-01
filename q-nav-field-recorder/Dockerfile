FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs index.html ./
COPY test ./test
ENV NODE_ENV=test
RUN npm test
ENV NODE_ENV=production
CMD ["node","server.mjs"]
