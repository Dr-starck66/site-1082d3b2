FROM node:22-bookworm-slim
RUN useradd -m -u 10001 sandbox && mkdir -p /opt/astra /workspace && chown -R sandbox:sandbox /opt/astra /workspace
WORKDIR /opt/astra
COPY package.json server.js network-guard.cjs ./
USER sandbox
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node","server.js"]
