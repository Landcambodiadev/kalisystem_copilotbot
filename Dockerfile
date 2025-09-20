# Dockerfile for Telegram Order Bot

FROM node:18

WORKDIR /app
COPY . .
RUN npm install

CMD ["npx", "ts-node", "src/v2.ts"]