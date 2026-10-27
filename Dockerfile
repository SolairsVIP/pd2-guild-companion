FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json server.js armory.js ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3214 DB_PATH=/app/data/guild.sqlite
EXPOSE 3214
CMD ["node", "server.js"]
