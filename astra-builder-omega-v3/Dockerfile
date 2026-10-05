FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont && npm install --omit=dev --ignore-scripts
COPY server.js ./
COPY chatgpt-local-bridge.mjs chatgpt-bridge-self-test.mjs ./
COPY index.html styles.css owner-probe.html ./
COPY src ./src
RUN npm run check
EXPOSE 3000
CMD ["node","server.js"]
