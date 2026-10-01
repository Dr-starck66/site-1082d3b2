FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont && npm install --omit=dev --ignore-scripts
COPY server.js ./
COPY index.html styles.css ./
COPY src ./src
RUN npm run check
EXPOSE 3000
CMD ["node","server.js"]
