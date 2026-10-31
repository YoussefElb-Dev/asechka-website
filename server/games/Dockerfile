FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY server/games ./server/games
ENV NODE_ENV=production GAMES_HOST=0.0.0.0 GAMES_PORT=8787 GAMES_DATA_DIR=/data
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8787
VOLUME /data
CMD ["node", "server/games/server.mjs"]
