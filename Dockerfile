# Dockerfile for Telegram Order Bot

FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV BOT_TOKEN=your_bot_token_here
ENV ADMIN_USER_ID=your_telegram_user_id_here

CMD ["npx", "ts-node", "src/orderbot.ts"]