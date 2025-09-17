// orderbot.ts -- Telegram Order Bot main file (place in src/)
// NOTE: See README.md for environment variable setup and running instructions.

import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import fs from 'fs';
import path from 'path';

const BOT_TOKEN = process.env.BOT_TOKEN!;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID!;
const DATA_DIR = path.resolve(__dirname, '../data');

function readJSON(filename: string) {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
}

function readText(filename: string) {
    return fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
}

// Example: Load all necessary data at startup
const items = readJSON('items.json');
const categories = readJSON('categories.json');
const suppliers = readJSON('suppliers.json');
const layouts = readJSON('layouts.json');

const bot = new Bot(BOT_TOKEN);

// User commands
bot.command('start', async (ctx) => {
    await ctx.reply("Welcome to the Order Bot! Type /order to begin.");
});

bot.command('order', async (ctx) => {
    // Example: List categories
    let text = "Choose a category:\n";
    for (const cat of categories) {
        text += `- ${cat.category_name}\n`;
    }
    await ctx.reply(text);
});

// Admin commands
bot.command('admin', async (ctx) => {
    if (String(ctx.from?.id) !== ADMIN_USER_ID) {
        await ctx.reply("Access denied.");
        return;
    }
    await ctx.reply("Admin mode. Use /import, /export, /edit, /restore, /share.");
});

bot.command('import', async (ctx) => {
    if (String(ctx.from?.id) !== ADMIN_USER_ID) {
        await ctx.reply("Access denied.");
        return;
    }
    await ctx.reply("Send a file to import (overwrite current data).");
    // Implementation: handle document upload in `bot.on('message')`
});

bot.command('export', async (ctx) => {
    if (String(ctx.from?.id) !== ADMIN_USER_ID) {
        await ctx.reply("Access denied.");
        return;
    }
    // Example: export items.json
    await ctx.replyWithDocument(new InputFile(path.join(DATA_DIR, 'items.json')));
});

bot.command('edit', async (ctx) => {
    if (String(ctx.from?.id) !== ADMIN_USER_ID) {
        await ctx.reply("Access denied.");
        return;
    }
    await ctx.reply("Send edits as text. (Not implemented)");
});

bot.command('restore', async (ctx) => {
    if (String(ctx.from?.id) !== ADMIN_USER_ID) {
        await ctx.reply("Access denied.");
        return;
    }
    await ctx.reply("Restoring files from backup. (Not implemented)");
});

bot.command('share', async (ctx) => {
    if (String(ctx.from?.id) !== ADMIN_USER_ID) {
        await ctx.reply("Access denied.");
        return;
    }
    await ctx.reply("Share files with other users. (Not implemented)");
});

// Start the bot
bot.start();