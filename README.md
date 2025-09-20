# kalisystem_copilotbot

Telegram order bot for easy kitchen/bar/manager/supplier order management.

## Structure

```
src/v2.ts  # Main bot code
data/                  # All static data files (items, categories, suppliers, templates)
.env.example           # Environment configuration example
Dockerfile             # For Docker deployment
README.md              # This file
```

## Setup

1. **Clone repo & install dependencies:**
   ```sh
   git clone https://github.com/YOUR_USERNAME/kalisystem_copilotbot.git
   cd kalisystem_copilotbot
   npm install
   ```

2. **Environment:**
   - Copy `.env.example` to `.env` and fill in your Telegram bot token and admin user ID.
   - Get your Telegram user ID by messaging [@userinfobot](https://t.me/userinfobot).

3. **Run locally:**
   ```sh
   npx ts-node src/v2.ts
   ```

## Docker Deployment

1. Build and run:
   ```sh
   docker build -t kalisystem_bot .
   docker run -d --name kalisystem_bot \
      -e BOT_TOKEN= \
      -e ADMIN_USER_ID= \

1. Install PM2:
   ```sh
   npm install -g pm2
   ```
2. Start the bot:
   ```sh
   pm2 start src/kali_order_bot.ts --interpreter ./node_modules/.bin/ts-node --name kalisystem_bot
   pm2 save
   pm2 startup
   ```

## Data files

- Place all files in the `/data` folder.
      kalisystem_bot
   ```

## PM2 Deployment
- You can edit/add categories/items/suppliers/templates as needed.
- Admin commands (`/admin`) allow import/export/edit/share/restore of the files.

## Features

- Order flow for kitchen/bar/manager/supplier
- Admin file management via Telegram
- Simple JSON/CSV file formats for easy editing

---

Need more features? PRs and issues welcome!