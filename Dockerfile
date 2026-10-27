FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node data/manta-graph.json ./data/manta-graph.json
RUN mkdir /app/runtime && chown node:node /app/runtime
USER node
ENV HOST=0.0.0.0 PORT=8080 NODE_ENV=production
EXPOSE 8080
VOLUME ["/app/runtime"]
CMD ["node", "src/server.js"]
