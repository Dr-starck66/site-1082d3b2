FROM oven/bun:1.4.0-alpine
WORKDIR /app
RUN mkdir -p /var/lib/c2ledger-range && chown -R bun:bun /var/lib/c2ledger-range /app
COPY --chown=bun:bun range-node/index.ts ./range-node/index.ts
ENV NODE_ENV=production PORT=3200
USER bun
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD bun -e "const r=await fetch('http://127.0.0.1:3200/health');process.exit(r.ok?0:1)"
CMD ["bun","run","range-node/index.ts"]
