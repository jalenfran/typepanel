FROM node:20-alpine

WORKDIR /app

# Install only what we need to run the WebSocket server
COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/index.js"]

