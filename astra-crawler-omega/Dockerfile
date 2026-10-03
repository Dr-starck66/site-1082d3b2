FROM node:22-alpine
WORKDIR /app
COPY package.json portfolio-sites.json ./
COPY crawler.mjs traffic-booster.mjs server.mjs index.html ./
COPY test ./test
RUN npm test
ENV NODE_ENV=production
CMD ["node","server.mjs"]
