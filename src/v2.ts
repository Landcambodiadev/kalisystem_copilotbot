import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import fs from 'fs';
import path from 'path';

// === CONFIG ===
const BOT_TOKEN = process.env.BOT_TOKEN!;

// Debug: Check if environment variables are loaded
console.log('[DEBUG] Bot V2 starting with config:');
console.log('[DEBUG] BOT_TOKEN loaded:', BOT_TOKEN ? 'YES' : 'NO');

if (!BOT_TOKEN) {
  console.error('[ERROR] BOT_TOKEN is missing from environment variables');
  process.exit(1);
}

const DATA_DIR = "./data";
const ITEM_JSON = `${DATA_DIR}/items.json`;
const CATEGORY_JSON = `${DATA_DIR}/categories.json`;
const SUPPLIER_JSON = `${DATA_DIR}/suppliers.json`;

const GROUP_CHAT_ID = "-1003049165819"; // group/chat ID
const KITCHEN_TOPIC_ID = 5;
const BAR_TOPIC_ID = 14;
const MANAGER_TOPIC_ID = 120;
const DISPATCHER_TOPIC_ID = 118;
const PROCESSING_TOPIC_ID = 190;
const COMPLETED_TOPIC_ID = 192;
const ADMIN_TOPIC_ID = 188;
const SUPPLIER_CHAT_ID = "-1002979418678"; // supplier chat/group

// === DATA LOADING ===
function loadJson(path: string) {
  if (fs.existsSync(path)) return JSON.parse(fs.readFileSync(path, "utf8"));
  return [];
}

function saveJson(path: string, data: any) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

function backupFile(path: string) {
  if (fs.existsSync(path)) {
    fs.copyFileSync(path, `${path}.bak_${Date.now()}`);
  }
}

// === BOT INSTANCE ===
const bot = new Bot(BOT_TOKEN);

// Add global error handler
bot.catch((err) => {
  console.error('[ERROR] Bot error occurred:', err);
});

// Add debug logging for all messages
bot.use(async (ctx, next) => {
  if (ctx.message) {
    console.log(`[DEBUG] Message received: "${ctx.message.text}" from user ${ctx.from?.id} in chat ${ctx.chat?.id} (type: ${ctx.chat?.type})`);
  }
  if (ctx.callbackQuery) {
    console.log(`[DEBUG] Callback query: "${ctx.callbackQuery.data}" from user ${ctx.from?.id}`);
  }
  await next();
});

// === V2 ORDER FLOW DATA ===
// Temporary storage for order flow tracking
const pendingApprovals: Record<string, any> = {}; // messageId -> item details
const pendingDispatch: Record<string, any> = {}; // messageId -> item details
const pendingPolls: Record<string, any> = {}; // pollId -> poll details

// === USER FLOW ===
const userContext: Record<number, string> = {};
let kitchenOrder: Record<string, number> = {};
let barOrder: Record<string, number> = {};

function threadLink(chatId: string, topicId: number) {
  const chatNum = chatId.replace("-100", "");
  return `https://t.me/c/${chatNum}/${topicId}`;
}

function buildReplyKeyboard() {
  const kitchenOrderCount = Object.values(kitchenOrder).reduce((a, b) => a + b, 0);
  const barOrderCount = Object.values(barOrder).reduce((a, b) => a + b, 0);
  return new Keyboard()
    .text(`Kitch Order (${kitchenOrderCount})`)
    .text(`Bar Order (${barOrderCount})`)
    .text("Custom").row()
    .text("Go Back")
    .text("Categories")
    .text("Search").row()
    .resized();
}

// --- Start Command ---
const startKeyboard = new InlineKeyboard()
  .text("Kitchen", "select_kitchen")
  .text("Bar", "select_bar")
  .text("Search", "start_inline_search");

bot.command("start", async ctx => {
  await ctx.reply("⚡ Welcome to KALI Easy Order V2!\nSelect a main category:", {
    reply_markup: startKeyboard,
  });
});

// --- Show Categories ---
bot.callbackQuery(["select_kitchen", "select_bar"], async ctx => {
  const parent = ctx.callbackQuery.data === "select_kitchen" ? "kitchen" : "bar";
  const categories = loadJson(CATEGORY_JSON).filter((c: any) => c.parent_category === parent);
  const catsKeyboard = new InlineKeyboard();
  categories.forEach((cat: any) =>
    catsKeyboard.text(cat.category_name, `show_items:${cat.category_id}`).row()
  );
  await ctx.editMessageText(
    `Categories for ${parent.charAt(0).toUpperCase() + parent.slice(1)}:`,
    { reply_markup: catsKeyboard }
  );
  if (ctx.from) userContext[ctx.from.id] = "categories";
});

// --- Show Items ---
bot.callbackQuery(/show_items:(\d+)/, async ctx => {
  const categoryId = Number(ctx.match![1]);
  const items = loadJson(ITEM_JSON).filter((i: any) => i.category_id == categoryId);
  const itemsKeyboard = new InlineKeyboard();
  items.forEach((item: any) =>
    itemsKeyboard.text(item.item_name, `add_to_order:${item.item_sku}`).row()
  );
  itemsKeyboard.text('⬅️ Go Back', `go_back_to_categories:${categoryId}`).row();
  
  const categories = loadJson(CATEGORY_JSON);
  const category = categories.find((cat: any) => cat.category_id == categoryId);
  const categoryName = category ? category.category_name : "Items";
  await ctx.editMessageText(categoryName + ':', { reply_markup: itemsKeyboard });
  if (ctx.from) userContext[ctx.from.id] = "items";
});

// --- Go Back from Items to Categories ---
bot.callbackQuery(/go_back_to_categories:(\d+)/, async ctx => {
  const categoryId = Number(ctx.match![1]);
  const categories = loadJson(CATEGORY_JSON);
  const category = categories.find((cat: any) => cat.category_id == categoryId);
  const parent = category?.parent_category || "kitchen";
  const parentCategories = categories.filter((c: any) => c.parent_category === parent);
  const catsKeyboard = new InlineKeyboard();
  parentCategories.forEach((cat: any) =>
    catsKeyboard.text(cat.category_name, `show_items:${cat.category_id}`).row()
  );
  await ctx.editMessageText(`Categories for ${parent.charAt(0).toUpperCase() + parent.slice(1)}:`, { reply_markup: catsKeyboard });
  if (ctx.from) userContext[ctx.from.id] = "categories";
});

// === V2 CORE ORDER FLOW ===

// --- Add to Order (V2 Flow) ---
bot.callbackQuery(/add_to_order:(.+)/, async ctx => {
  const itemId = ctx.match![1];
  const items = loadJson(ITEM_JSON);
  const item = items.find((i: any) => String(i.item_sku) === itemId);
  if (!item) return await ctx.answerCallbackQuery("Item not found");
  
  let topicId;
  const isKitchen = item.source === "kitchen" || (!item.source && item.category_id < 30000);
  if (isKitchen) {
    kitchenOrder[itemId] = (kitchenOrder[itemId] || 0) + 1;
    topicId = KITCHEN_TOPIC_ID;
  } else {
    barOrder[itemId] = (barOrder[itemId] || 0) + 1;
    topicId = BAR_TOPIC_ID;
  }
  
  await ctx.answerCallbackQuery("✅ Sent for manager approval");
  
  // V2 Flow: Send directly to Manager Topic for approval
  const approvalKeyboard = new InlineKeyboard()
    .text("✅ Approve", `approve_item:${itemId}:${topicId}`)
    .text("❌ Reject", `reject_item:${itemId}:${topicId}`);
  
  const managerMessage = await bot.api.sendMessage(GROUP_CHAT_ID, 
    `📋 Manager Approval Required:\n${item.category_name || ''} ${item.item_name}\nRequested by: ${ctx.from?.username || ctx.from?.first_name || 'Unknown'}`, 
    { 
      message_thread_id: MANAGER_TOPIC_ID,
      reply_markup: approvalKeyboard
    }
  );
  
  // Store for tracking
  pendingApprovals[managerMessage.message_id] = {
    item: item,
    topicId: topicId,
    requestedBy: ctx.from?.username || ctx.from?.first_name || 'Unknown'
  };
});

// --- Manager Approval ---
bot.callbackQuery(/approve_item:(.+):(.+)/, async ctx => {
  const itemId = ctx.match![1];
  const topicId = Number(ctx.match![2]);
  const messageId = ctx.callbackQuery.message?.message_id;
  
  if (!messageId || !pendingApprovals[messageId]) {
    return await ctx.answerCallbackQuery("Approval record not found");
  }
  
  const approval = pendingApprovals[messageId];
  const item = approval.item;
  
  // Post approved item to the appropriate topic
  await bot.api.sendMessage(GROUP_CHAT_ID, `🛒 ${item.category_name || ''} ${item.item_name}`, { 
    message_thread_id: topicId 
  });
  
  // Edit manager message to show approval
  await ctx.editMessageText(
    `✅ APPROVED: ${item.category_name || ''} ${item.item_name}\nRequested by: ${approval.requestedBy}`,
    { reply_markup: undefined }
  );
  
  // Get supplier info
  const suppliers = loadJson(SUPPLIER_JSON);
  const supplier = suppliers.find((s: any) => s.supplier.toLowerCase() === item.default_supplier?.toLowerCase()) || 
                  { supplier: item.default_supplier || 'Unknown Supplier' };
  
  // Send to Dispatcher Topic
  const dispatchKeyboard = new InlineKeyboard()
    .text("✅ Approve", `dispatch_approve:${itemId}:${messageId}`)
    .text("❌ Reject", `dispatch_reject:${itemId}:${messageId}`);
  
  const now = new Date();
  const dateStamp = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear().toString().slice(-2)} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  
  const dispatchMessage = await bot.api.sendMessage(GROUP_CHAT_ID,
    `📦 Dispatcher Review:\n\n<<${supplier.supplier}>>\n${item.item_name} ${item.default_quantity || 1}\n•\n\n${dateStamp}`,
    {
      message_thread_id: DISPATCHER_TOPIC_ID,
      reply_markup: dispatchKeyboard
    }
  );
  
  // Store for dispatcher tracking
  pendingDispatch[dispatchMessage.message_id] = {
    item: item,
    supplier: supplier.supplier,
    originalApprovalId: messageId,
    dateStamp: dateStamp
  };
  
  // Clean up approval tracking
  delete pendingApprovals[messageId];
  
  await ctx.answerCallbackQuery("✅ Item approved and sent to dispatcher");
});

// --- Manager Rejection ---
bot.callbackQuery(/reject_item:(.+):(.+)/, async ctx => {
  const itemId = ctx.match![1];
  const topicId = Number(ctx.match![2]);
  const messageId = ctx.callbackQuery.message?.message_id;
  
  if (!messageId || !pendingApprovals[messageId]) {
    return await ctx.answerCallbackQuery("Approval record not found");
  }
  
  const approval = pendingApprovals[messageId];
  const item = approval.item;
  
  // Edit manager message to show rejection
  await ctx.editMessageText(
    `❌ REJECTED: ${item.category_name || ''} ${item.item_name}\nRequested by: ${approval.requestedBy}`,
    { reply_markup: undefined }
  );
  
  // Clean up approval tracking
  delete pendingApprovals[messageId];
  
  await ctx.answerCallbackQuery("❌ Item rejected");
});

// --- Dispatcher Approval ---
bot.callbackQuery(/dispatch_approve:(.+):(.+)/, async ctx => {
  const itemId = ctx.match![1];
  const originalApprovalId = ctx.match![2];
  const messageId = ctx.callbackQuery.message?.message_id;
  
  if (!messageId || !pendingDispatch[messageId]) {
    return await ctx.answerCallbackQuery("Dispatch record not found");
  }
  
  const dispatch = pendingDispatch[messageId];
  const item = dispatch.item;
  
  // Edit dispatcher message to show approval
  await ctx.editMessageText(
    `✅ DISPATCHED: <<${dispatch.supplier}>>\n${item.item_name} ${item.default_quantity || 1}\n•\n\n${dispatch.dateStamp}`,
    { reply_markup: undefined }
  );
  
  // Create poll for Processing Topic
  const pollMessage = await bot.api.sendPoll(
    GROUP_CHAT_ID,
    `Confirm receipt of items from ${dispatch.supplier} - ${dispatch.dateStamp}?`,
    [`${item.item_name} (${item.default_quantity || 1})`],
    {
      message_thread_id: PROCESSING_TOPIC_ID,
      allows_multiple_answers: true,
      is_anonymous: false
    }
  );
  
  // Store poll for completion tracking
  pendingPolls[pollMessage.poll?.id || ''] = {
    item: item,
    supplier: dispatch.supplier,
    dateStamp: dispatch.dateStamp,
    messageId: pollMessage.message_id
  };
  
  // Clean up dispatch tracking
  delete pendingDispatch[messageId];
  
  await ctx.answerCallbackQuery("✅ Item dispatched - Poll created for processing");
});

// --- Dispatcher Rejection ---
bot.callbackQuery(/dispatch_reject:(.+):(.+)/, async ctx => {
  const itemId = ctx.match![1];
  const originalApprovalId = ctx.match![2];
  const messageId = ctx.callbackQuery.message?.message_id;
  
  if (!messageId || !pendingDispatch[messageId]) {
    return await ctx.answerCallbackQuery("Dispatch record not found");
  }
  
  const dispatch = pendingDispatch[messageId];
  const item = dispatch.item;
  
  // Edit dispatcher message to show rejection
  await ctx.editMessageText(
    `❌ DISPATCH REJECTED: <<${dispatch.supplier}>>\n${item.item_name} ${item.default_quantity || 1}\n•\n\n${dispatch.dateStamp}`,
    { reply_markup: undefined }
  );
  
  // Clean up dispatch tracking
  delete pendingDispatch[messageId];
  
  await ctx.answerCallbackQuery("❌ Dispatch rejected");
});

// --- Poll Answer Handler (Processing Completion) ---
bot.on('poll_answer', async (ctx) => {
  const pollId = ctx.pollAnswer.poll_id;
  const userId = ctx.pollAnswer.user?.id;
  
  if (!pendingPolls[pollId]) {
    return; // Poll not tracked
  }
  
  const poll = pendingPolls[pollId];
  
  // Check if all options are selected (simplified for single item)
  if (ctx.pollAnswer.option_ids.length > 0) {
    // Send completion message to Completed Topic
    const completedKeyboard = new InlineKeyboard()
      .text("📊 CRM", `crm_update:${pollId}`);
    
    await bot.api.sendMessage(GROUP_CHAT_ID,
      `🎉 COMPLETED!\n\n<<${poll.supplier}>>\n${poll.item.item_name} ${poll.item.default_quantity || 1}\n•\n\n${poll.dateStamp}`,
      {
        message_thread_id: COMPLETED_TOPIC_ID,
        reply_markup: completedKeyboard
      }
    );
    
    // Clean up poll tracking
    delete pendingPolls[pollId];
    
    console.log(`[DEBUG] Order completed for ${poll.item.item_name} from ${poll.supplier}`);
  }
});

// --- CRM Button (Placeholder) ---
bot.callbackQuery(/crm_update:(.+)/, async ctx => {
  await ctx.answerCallbackQuery("📊 CRM update feature will be implemented in V3");
});

// === EXISTING USER FLOW FEATURES ===

// --- Order Thread Links ---
bot.hears(/Kitch Order \(\d+\)/, async ctx => {
  const url = threadLink(GROUP_CHAT_ID, KITCHEN_TOPIC_ID);
  await ctx.reply("Tap below to open Kitchen Topic:", {
    reply_markup: new InlineKeyboard().url("Go to Kitchen Topic", url)
  });
});

bot.hears(/Bar Order \(\d+\)/, async ctx => {
  const url = threadLink(GROUP_CHAT_ID, BAR_TOPIC_ID);
  await ctx.reply("Tap below to open Bar Topic:", {
    reply_markup: new InlineKeyboard().url("Go to Bar Topic", url)
  });
});

// --- "Custom" Item Flow (V2 Updated) ---
bot.hears("Custom", async ctx => {
  await ctx.reply("Send your custom item request (photo, voice, or text). This will be sent to managers for approval.", { 
    reply_markup: { remove_keyboard: true } 
  });
});

bot.on(['message:text', 'message:photo', 'message:voice'], async (ctx, next) => {
  if (ctx.message.reply_to_message && ctx.message.reply_to_message.text && ctx.message.reply_to_message.text.includes("custom item request")) {
    // V2 Flow: Send custom requests directly to Manager Topic
    const approvalKeyboard = new InlineKeyboard()
      .text("✅ Approve Custom", `approve_custom:${ctx.message.message_id}`)
      .text("❌ Reject Custom", `reject_custom:${ctx.message.message_id}`);
    
    await bot.api.forwardMessage(GROUP_CHAT_ID, ctx.chat.id, ctx.message.message_id, {
      message_thread_id: MANAGER_TOPIC_ID
    });
    
    await bot.api.sendMessage(GROUP_CHAT_ID, 
      `📋 Custom Item Approval Required from ${ctx.from?.username || ctx.from?.first_name || 'Unknown'}`,
      {
        message_thread_id: MANAGER_TOPIC_ID,
        reply_markup: approvalKeyboard
      }
    );
    
    await ctx.reply("✅ Custom request sent to managers for approval.");
    return;
  }
  
  await next();
});

// --- Custom Item Approval/Rejection ---
bot.callbackQuery(/approve_custom:(.+)/, async ctx => {
  await ctx.editMessageText("✅ Custom item request APPROVED", { reply_markup: undefined });
  await ctx.answerCallbackQuery("✅ Custom item approved");
});

bot.callbackQuery(/reject_custom:(.+)/, async ctx => {
  await ctx.editMessageText("❌ Custom item request REJECTED", { reply_markup: undefined });
  await ctx.answerCallbackQuery("❌ Custom item rejected");
});

// --- Navigation ---
bot.hears("Go Back", async ctx => {
  const userId = ctx.from?.id;
  if (userId && userContext[userId] === "items") {
    const categories = loadJson(CATEGORY_JSON).filter((c: any) => c.parent_category === "kitchen");
    const catsKeyboard = new InlineKeyboard();
    categories.forEach((cat: any) =>
      catsKeyboard.text(cat.category_name, `show_items:${cat.category_id}`).row()
    );
    await ctx.reply("Categories for Kitchen:", { reply_markup: catsKeyboard });
    userContext[userId] = "categories";
  } else {
    const categories = loadJson(CATEGORY_JSON);
    const catsKeyboard = new InlineKeyboard();
    categories.forEach((cat: any) =>
      catsKeyboard.text(cat.category_name, `show_items:${cat.category_id}`).row()
    );
    await ctx.reply("All Categories:", { reply_markup: catsKeyboard });
    userContext[userId!] = "categories";
  }
});

bot.hears("Categories", async ctx => {
  const categories = loadJson(CATEGORY_JSON);
  const catsKeyboard = new InlineKeyboard();
  categories.forEach((cat: any) =>
    catsKeyboard.text(cat.category_name, `show_items:${cat.category_id}`).row()
  );
  await ctx.reply("All Categories:", { reply_markup: catsKeyboard });
});

bot.hears("Search", async ctx => {
  await ctx.reply("Type @kalisystembot <item> in any chat to search instantly, or tap below to start inline search.", {
    reply_markup: new InlineKeyboard().switchInlineCurrent("").row()
  });
});

bot.callbackQuery("start_inline_search", async ctx => {
  await ctx.reply("Type @kalisystembot <item> in any chat to search instantly.");
});

// --- Inline Query ---
bot.inlineQuery(/.*/, async ctx => {
  const items = loadJson(ITEM_JSON);
  const query = ctx.inlineQuery.query.toLowerCase();
  const filteredItems = query ? items.filter((item: any) => 
    item.item_name.toLowerCase().includes(query)
  ) : items;
  
  const results = filteredItems.slice(0, 50).map((item: any) => ({
    type: "article",
    id: item.item_sku,
    title: item.item_name,
    description: item.category_name || '',
    input_message_content: { message_text: `🛒 ${item.item_name}` },
    reply_markup: {
      inline_keyboard: [[{ text: "Add to order", callback_data: `add_to_order:${item.item_sku}` }]],
    },
  }));
  
  await ctx.answerInlineQuery(results, { cache_time: 0 });
});

// --- Help Command ---
bot.command("help", async ctx => {
  await ctx.reply(
    "🏪 KALI Easy Order V2 Help\n\n• Select category → Choose item → Manager approval → Dispatcher review → Processing confirmation → Completed\n• Use @botname <search> for inline search\n• Custom lets you send requests to managers"
  );
});

console.log('[DEBUG] Starting V2 bot...');
bot.start().then(() => {
  console.log('[DEBUG] V2 Bot started successfully!');
}).catch((error) => {
  console.error('[ERROR] Failed to start V2 bot:', error);
  if (error.message.includes('404: Not Found')) {
    console.error('[ERROR] Invalid BOT_TOKEN! Please check your .env file and ensure the token is correct.');
    console.error('[ERROR] Get a new token from @BotFather on Telegram if needed.');
  }
  process.exit(1);
}).finally(() => {
  console.log('[DEBUG] V2 Bot start() promise completed (either resolved or rejected)');
});