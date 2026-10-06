FROM oven/bun:1.4.0-alpine@sha256:07235578f79ef8c6f97d94aee7938e76f5cdba5f21ae5dbfdd3d3d38058437eb
WORKDIR /app
COPY --chown=bun:bun sensor/index.ts ./sensor/index.ts
ENV NODE_ENV=production PORT=3100
USER bun
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD bun -e "const r=await fetch('http://127.0.0.1:3100/health');process.exit(r.ok?0:1)"
CMD ["bun","run","sensor/index.ts"]
