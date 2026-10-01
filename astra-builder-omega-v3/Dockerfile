FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY index.html styles.css ./
COPY src ./src
RUN node --check server.js && node --check src/workspace7-server.js && node --check src/workspace7.js && node --check src/app.js
EXPOSE 3000
CMD ["node","server.js"]
