FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY index.html styles.css ./
COPY src ./src
EXPOSE 3000
CMD ["node","server.js"]
