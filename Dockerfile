FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
USER node
ENV HOST=0.0.0.0 PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["node", "src/server.js"]
