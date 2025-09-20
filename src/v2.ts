import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import express from 'express';
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
  console.error('[ERROR] Full error object:', JSON.stringify(err, null, 2));
  console.error('[ERROR] Error stack:', err.stack);
});

// Add debug logging for all messages
bot.use(async (ctx, next) => {
  console.log('[DEBUG] Bot middleware triggered - processing update');
  if (ctx.message) {
    console.log(`[DEBUG] Message received: "${ctx.message.text}" from user ${ctx.from?.id} in chat ${ctx.chat?.id} (type: ${ctx.chat?.type})`);
  }
  if (ctx.callbackQuery) {
    console.log(`[DEBUG] Callback query: "${ctx.callbackQuery.data}" from user ${ctx.from?.id}`);
  }
  console.log('[DEBUG] About to call next() in middleware');
  await next();
  console.log('[DEBUG] Finished processing update in middleware');
});

// === V2 ORDER FLOW DATA ===
// Temporary storage for order flow tracking
const pendingApprovals: Record<string, any> = {}; // messageId -> item details
const pendingDispatch: Record<string, any> = {}; // messageId -> item details
const pendingPolls: Record<string, any> = {}; // pollId -> poll details

// Mark mode tracking
const userMarkMode: Record<number, boolean> = {}; // userId -> isMarkMode
const markedItems: Record<number, Record<string, any>> = {}; // userId -> { itemSku: item }
const userMarkContext: Record<number, string> = {}; // userId -> current context (kitchen/bar/categories)

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

function buildMarkModeKeyboard(userId: number, context?: string) {
  const keyboard = new Keyboard();
  
  if (context === "categories") {
    // Show sub-categories and main button
    keyboard.text("🔙 Back to Main").row();
  } else {
    // Main mark mode keyboard
    keyboard.text("Kitchen").text("Bar").row();
  }
  
  keyboard.text("Place Order").row();
  keyboard.text("Stop Mark Mode").row();
  
  return keyboard.resized();
}

// --- Start Command ---
const startReplyKeyboard = new Keyboard()
  .text("Kitchen").text("Bar").row()
  .text("Mark Mode").row()
  .text("Today List").text("Custom List").row()
  .resized();

bot.command("start", async ctx => {
  console.log('[DEBUG] /start command handler triggered');
  console.log('[DEBUG] User info:', ctx.from);
  console.log('[DEBUG] Chat info:', ctx.chat);
  await ctx.reply("⚡ Welcome to KALI Easy Order V2!\nSelect a main category:", {
    reply_markup: startReplyKeyboard,
  });
  console.log('[DEBUG] /start command response sent');
});

// --- Handle Reply Keyboard Buttons ---
bot.hears(["Kitchen", "Bar"], async ctx => {
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const parent = ctx.message!.text === "Kitchen" ? "kitchen" : "bar";
  
  if (userMarkMode[userId]) {
    // Mark mode: show categories with mark mode keyboard
    userMarkContext[userId] = "categories";
    
    // Define sub-categories for each parent
    const subCategories = {
      kitchen: ["meat", "fish/seafood", "dairy", "veggies", "spices", "dry", "sauce", "cleaning", "plastics"],
      bar: ["soft", "alcohol", "coffee/tea/syrup", "cigs", "households", "fruits", "ingredients"]
    };
    
    const subCats = subCategories[parent as keyof typeof subCategories] || [];
    const replyKeyboard = new Keyboard();
    
    // Add sub-category buttons in rows of 3
    for (let i = 0; i < subCats.length; i += 3) {
      const row = subCats.slice(i, i + 3);
      replyKeyboard.text(row[0]);
      if (row[1]) replyKeyboard.text(row[1]);
      if (row[2]) replyKeyboard.text(row[2]);
      replyKeyboard.row();
    }
    
    replyKeyboard.text("🔙 Back to Main").row();
    replyKeyboard.text("Place Order").row();
    replyKeyboard.text("Stop Mark Mode").row();
    replyKeyboard.resized();
    
    await ctx.reply(`Select ${parent} sub-category (Mark Mode):`, {
      reply_markup: replyKeyboard
    });
  } else {
    // Normal mode: show categories with normal flow
    const subCategories = {
      kitchen: ["meat", "fish/seafood", "dairy", "veggies", "spices", "dry", "sauce", "cleaning", "plastics"],
      bar: ["soft", "alcohol", "coffee/tea/syrup", "cigs", "households", "fruits", "ingredients"]
    };
    
    const subCats = subCategories[parent as keyof typeof subCategories] || [];
    const replyKeyboard = new Keyboard();
    
    // Add sub-category buttons in rows of 3
    for (let i = 0; i < subCats.length; i += 3) {
      const row = subCats.slice(i, i + 3);
      replyKeyboard.text(row[0]);
      if (row[1]) replyKeyboard.text(row[1]);
      if (row[2]) replyKeyboard.text(row[2]);
      replyKeyboard.row();
    }
    
    replyKeyboard.text("🔙 Back to Main").resized();
    
    await ctx.reply(`Select ${parent} sub-category:`);
    await ctx.reply(`Choose a ${parent} sub-category:`, {
      reply_markup: replyKeyboard
    });
  }
  
  userContext[userId] = "categories";
});

// --- Handle Mark Mode Button ---
bot.hears("Mark Mode", async ctx => {
  const userId = ctx.from?.id;
  if (!userId) return;
  
  userMarkMode[userId] = true;
  markedItems[userId] = {};
  userMarkContext[userId] = "main";
  
  await ctx.reply("🔹 Mark Mode Enabled!\nClick items to mark them for bulk ordering.", {
    reply_markup: buildMarkModeKeyboard(userId)
  });
});

// --- Handle Place Order Button ---
bot.hears("Place Order", async ctx => {
  const userId = ctx.from?.id;
  if (!userId || !userMarkMode[userId]) return;
  
  const marked = markedItems[userId] || {};
  const markedItemsList = Object.values(marked);
  
  if (markedItemsList.length === 0) {
    return await ctx.reply("No items marked for ordering.");
  }
  
  // Prompt user to choose destination
  const destinationKeyboard = new InlineKeyboard()
    .text("📋 Manager", `send_order:manager:${userId}`)
    .text("📦 Dispatcher", `send_order:dispatcher:${userId}`);
  
  await ctx.reply("Send order to:", {
    reply_markup: destinationKeyboard
  });
});

// --- Handle Send Order Destination ---
bot.callbackQuery(/send_order:(manager|dispatcher):(.+)/, async ctx => {
  const destination = ctx.match![1];
  const userId = parseInt(ctx.match![2]);
  
  const marked = markedItems[userId] || {};
  const markedItemsList = Object.values(marked);
  
  if (markedItemsList.length === 0) {
    return await ctx.answerCallbackQuery("No items marked for ordering.");
  }
  
  // Group items by supplier
  const supplierGroups: Record<string, any[]> = {};
  markedItemsList.forEach((item: any) => {
    const supplier = item.default_supplier || 'Unknown Supplier';
    if (!supplierGroups[supplier]) {
      supplierGroups[supplier] = [];
    }
    supplierGroups[supplier].push(item);
  });
  
  // Build order summary message
  let orderSummary = `📋 **Bulk Order Summary** (${destination.toUpperCase()}):\n\n`;
  
  Object.entries(supplierGroups).forEach(([supplier, items]) => {
    orderSummary += `**<<${supplier}>>**\n`;
    items.forEach((item: any) => {
      const defaultQty = item.default_quantity || '1';
      orderSummary += `${item.item_name} ${defaultQty} ${item.measure_unit || 'pc'}\n`;
    });
    orderSummary += '•\n\n';
  });
  
  const now = new Date();
  const dateStamp = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear().toString().slice(-2)} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  orderSummary += dateStamp;
  
  // Send to appropriate topic
  const topicId = destination === 'manager' ? MANAGER_TOPIC_ID : DISPATCHER_TOPIC_ID;
  
  await bot.api.sendMessage(GROUP_CHAT_ID, orderSummary, {
    message_thread_id: topicId,
    parse_mode: 'Markdown'
  });
  
  // Disable mark mode and clear marked items
  userMarkMode[userId] = false;
  markedItems[userId] = {};
  userMarkContext[userId] = "";
  
  await ctx.editMessageText(`✅ Bulk order sent to ${destination.toUpperCase()}!`);
  await ctx.answerCallbackQuery(`Order sent to ${destination}`);
});

// --- Handle Stop Mark Mode Button ---
bot.hears("Stop Mark Mode", async ctx => {
  const userId = ctx.from?.id;
  if (!userId) return;
  
  userMarkMode[userId] = false;
  markedItems[userId] = {};
  userMarkContext[userId] = "";
  
  await ctx.reply("🔹 Mark Mode Disabled", {
    reply_markup: startReplyKeyboard
  });
});

// --- Handle Today List Button ---
bot.hears("Today List", async ctx => {
  // Check if todaylist.csv exists and display it
  const todayListPath = `${DATA_DIR}/todaylist.csv`;
  if (fs.existsSync(todayListPath)) {
    const todayList = fs.readFileSync(todayListPath, 'utf8');
    await ctx.reply(`📋 Today's List:\n\`\`\`\n${todayList}\n\`\`\``);
  } else {
    await ctx.reply("📋 Today's list is empty or not found.");
  }
});

// --- Handle Custom List Button ---
bot.hears("Custom List", async ctx => {
  // Check if customlist.csv exists and display it
  const customListPath = `${DATA_DIR}/customlist.csv`;
  if (fs.existsSync(customListPath)) {
    const customList = fs.readFileSync(customListPath, 'utf8');
    await ctx.reply(`📝 Custom List:\n\`\`\`\n${customList}\n\`\`\``);
  } else {
    await ctx.reply("📝 Custom list is empty or not found.");
  }
});

// --- Handle Sub-category Selection ---
bot.hears(["meat", "fish/seafood", "dairy", "veggies", "spices", "dry", "sauce", "cleaning", "plastics", 
          "soft", "alcohol", "coffee/tea/syrup", "cigs", "households", "fruits", "ingredients"], async ctx => {
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const subCategory = ctx.message!.text;
  if (!subCategory) return;
  
  const items = loadJson(ITEM_JSON).filter((i: any) => i.sub_category === subCategory);
  
  if (items.length === 0) {
    const keyboard = userMarkMode[userId] ? buildMarkModeKeyboard(userId, "categories") : startReplyKeyboard;
    return await ctx.reply(`No items found for ${subCategory}`, {
      reply_markup: keyboard
    });
  }
  
  const itemsKeyboard = new InlineKeyboard();
  
  if (userMarkMode[userId]) {
    // Mark mode: show items with mark/unmark buttons
    items.forEach((item: any) => {
      const isMarked = markedItems[userId] && markedItems[userId][item.item_sku];
      const displayName = isMarked ? `🔹 ${item.item_name}` : item.item_name;
      const action = isMarked ? `unmark_item:${item.item_sku}` : `mark_item:${item.item_sku}`;
      itemsKeyboard.text(displayName, action).row();
    });
  } else {
    // Normal mode: show items with add to order buttons
    items.forEach((item: any) =>
      itemsKeyboard.text(item.item_name, `add_to_order:${item.item_sku}`).row()
    );
  }
  
  await ctx.reply(`${subCategory.charAt(0).toUpperCase() + subCategory.slice(1)} items:`, { 
    reply_markup: itemsKeyboard 
  });
  
  userContext[userId] = "items";
});

// --- Back to Main Menu ---
bot.hears("🔙 Back to Main", async ctx => {
  const userId = ctx.from?.id;
  if (!userId) return;
  
  // Reset user context and mark mode
  userMarkMode[userId] = false;
  markedItems[userId] = {};
  userMarkContext[userId] = "";
  userContext[userId] = "";
  
  // Same as /start command
  await ctx.reply("⚡ Welcome to KALI Easy Order V2!\nSelect a main category:", {
    reply_markup: startReplyKeyboard,
  });
});

// === MARK MODE HANDLERS ===

// --- Mark Item ---
bot.callbackQuery(/mark_item:(.+)/, async ctx => {
  const userId = ctx.from?.id;
  if (!userId || !userMarkMode[userId]) return;
  
  const itemId = ctx.match![1];
  const items = loadJson(ITEM_JSON);
  const item = items.find((i: any) => String(i.item_sku) === itemId);
  
  if (!item) return await ctx.answerCallbackQuery("Item not found");
  
  // Initialize marked items for user if not exists
  if (!markedItems[userId]) {
    markedItems[userId] = {};
  }
  
  // Mark the item
  markedItems[userId][itemId] = item;
  
  // Rebuild the entire keyboard with updated mark status
  const subCategory = item.sub_category;
  const allItems = loadJson(ITEM_JSON).filter((i: any) => i.sub_category === subCategory);
  const itemsKeyboard = new InlineKeyboard();
  
  allItems.forEach((currentItem: any) => {
    const isMarked = markedItems[userId] && markedItems[userId][currentItem.item_sku];
    const displayName = isMarked ? `🔹 ${currentItem.item_name}` : currentItem.item_name;
    const action = isMarked ? `unmark_item:${currentItem.item_sku}` : `mark_item:${currentItem.item_sku}`;
    itemsKeyboard.text(displayName, action).row();
  });
  
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: itemsKeyboard });
  } catch (error) {
    console.log('[DEBUG] Could not update keyboard:', error);
  }
  
  await ctx.answerCallbackQuery(`🔹 Marked: ${item.item_name}`);
});

// --- Unmark Item ---
bot.callbackQuery(/unmark_item:(.+)/, async ctx => {
  const userId = ctx.from?.id;
  if (!userId || !userMarkMode[userId]) return;
  
  const itemId = ctx.match![1];
  const items = loadJson(ITEM_JSON);
  const item = items.find((i: any) => String(i.item_sku) === itemId);
  
  if (!item) return await ctx.answerCallbackQuery("Item not found");
  
  // Unmark the item
  if (markedItems[userId]) {
    delete markedItems[userId][itemId];
  }
  
  // Rebuild the entire keyboard with updated mark status
  const subCategory = item.sub_category;
  const allItems = loadJson(ITEM_JSON).filter((i: any) => i.sub_category === subCategory);
  const itemsKeyboard = new InlineKeyboard();
  
  allItems.forEach((currentItem: any) => {
    const isMarked = markedItems[userId] && markedItems[userId][currentItem.item_sku];
    const displayName = isMarked ? `🔹 ${currentItem.item_name}` : currentItem.item_name;
    const action = isMarked ? `unmark_item:${currentItem.item_sku}` : `mark_item:${currentItem.item_sku}`;
    itemsKeyboard.text(displayName, action).row();
  });
  
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: itemsKeyboard });
  } catch (error) {
    console.log('[DEBUG] Could not update keyboard:', error);
  }
  
  await ctx.answerCallbackQuery(`Unmarked: ${item.item_name}`);
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
  
  // V2 Flow: Send item message with inline buttons to Manager Topic
  console.log(`[DEBUG] Sending item approval to Manager Topic (ID: ${MANAGER_TOPIC_ID}) for item: ${item.item_name}`);
  
  const defaultQty = item.default_quantity || '1';
  const approvalKeyboard = new InlineKeyboard()
    .text("+1", `qty_add:${item.item_sku}:${defaultQty}`)
    .text("✅", `approve_item:${item.item_sku}:${defaultQty}`)
    .text("❌", `cancel_item:${item.item_sku}`);
  
  const approvalMessage = await bot.api.sendMessage(
    GROUP_CHAT_ID,
    `${item.item_name} ${defaultQty}`,
    {
      message_thread_id: MANAGER_TOPIC_ID,
      reply_markup: approvalKeyboard
    }
  );
  
  // Store for quantity tracking
  pendingApprovals[approvalMessage.message_id] = {
    item: item,
    topicId: topicId,
    quantity: defaultQty,
    requestedBy: ctx.from?.username || ctx.from?.first_name || 'Unknown',
    messageId: approvalMessage.message_id
  };
  console.log(`[DEBUG] Item approval message created with ID: ${approvalMessage.message_id} for item: ${item.item_name}`);
});

// --- Manager Quantity Add Button ---
bot.callbackQuery(/qty_add:(.+):(.+)/, async ctx => {
  const itemId = ctx.match![1];
  const currentQty = parseInt(ctx.match![2]);
  const messageId = ctx.callbackQuery.message?.message_id;
  
  if (!messageId || !pendingApprovals[messageId]) {
    return await ctx.answerCallbackQuery("Approval record not found");
  }
  
  const approval = pendingApprovals[messageId];
  const item = approval.item;
  const newQty = currentQty + 1;
  
  // Update the message with new quantity
  const updatedKeyboard = new InlineKeyboard()
    .text("+1", `qty_add:${item.item_sku}:${newQty}`)
    .text("✅", `approve_item:${item.item_sku}:${newQty}`)
    .text("❌", `cancel_item:${item.item_sku}`);
  
  await ctx.editMessageText(`${item.item_name} ${newQty}`, {
    reply_markup: updatedKeyboard
  });
  
  // Update stored quantity
  pendingApprovals[messageId].quantity = newQty.toString();
  
  await ctx.answerCallbackQuery(`Quantity updated to ${newQty}`);
});

// --- Manager Item Approval ---
bot.callbackQuery(/approve_item:(.+):(.+)/, async ctx => {
  const itemId = ctx.match![1];
  const quantity = parseInt(ctx.match![2]);
  const messageId = ctx.callbackQuery.message?.message_id;
  
  if (!messageId || !pendingApprovals[messageId]) {
    return await ctx.answerCallbackQuery("Approval record not found");
  }
  
  const approval = pendingApprovals[messageId];
  const item = approval.item;
  
  console.log(`[DEBUG] Manager approved quantity ${quantity} for item: ${item.item_name}`);
  
  // Update message to show approval
  await ctx.editMessageText(`✅ APPROVED: ${item.item_name} x${quantity}`, {
    reply_markup: undefined
  });
  
  // Post approved item with quantity to the appropriate topic
  await bot.api.sendMessage(GROUP_CHAT_ID, `🛒 ${item.category_name || ''} ${item.item_name} x${quantity}`, { 
    message_thread_id: approval.topicId 
  });
  console.log(`[DEBUG] Approved item with quantity posted to Topic (ID: ${approval.topicId}) for item: ${item.item_name} x${quantity}`);
  
  // Forward the approved message to Dispatcher Topic with new buttons
  const dispatchKeyboard = new InlineKeyboard()
    .text("✅ Approve", `dispatch_approve:${item.item_sku}:${messageId}`)
    .text("❌ Reject", `dispatch_reject:${item.item_sku}:${messageId}`);
  
  console.log(`[DEBUG] Sending to Dispatcher Topic (ID: ${DISPATCHER_TOPIC_ID}) for item: ${item.item_name} x${quantity}`);
  console.log(`[DEBUG] Posting to GROUP_CHAT_ID: ${GROUP_CHAT_ID}, DISPATCHER_TOPIC_ID: ${DISPATCHER_TOPIC_ID}`);
  
  // Forward the manager's approved message to dispatcher topic with new buttons
  const dispatchMessage = await bot.api.copyMessage(
    GROUP_CHAT_ID,
    GROUP_CHAT_ID,
    messageId,
    {
      message_thread_id: DISPATCHER_TOPIC_ID,
      reply_markup: dispatchKeyboard
    }
  );
  console.log(`[DEBUG] Dispatcher message sent with message_id: ${dispatchMessage.message_id}`);
  
  // Get supplier info for tracking
  const suppliers = loadJson(SUPPLIER_JSON);
  const supplier = suppliers.find((s: any) => s.supplier.toLowerCase() === item.default_supplier?.toLowerCase()) || 
                  { supplier: item.default_supplier || 'Unknown Supplier' };
  
  const now = new Date();
  const dateStamp = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear().toString().slice(-2)} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  
  // Store for dispatcher tracking
  pendingDispatch[dispatchMessage.message_id] = {
    item: item,
    quantity: quantity,
    supplier: supplier.supplier,
    originalMessageId: messageId,
    dateStamp: dateStamp
  };
  console.log(`[DEBUG] Dispatcher review message posted to Dispatcher Topic (ID: ${DISPATCHER_TOPIC_ID}) for item: ${item.item_name} x${quantity}`);
  
  // Clean up approval tracking
  delete pendingApprovals[messageId];
});

// --- Manager Item Cancellation ---
bot.callbackQuery(/cancel_item:(.+)/, async ctx => {
  const itemId = ctx.match![1];
  const messageId = ctx.callbackQuery.message?.message_id;
  
  if (!messageId || !pendingApprovals[messageId]) {
    return await ctx.answerCallbackQuery("Approval record not found");
  }
  
  const approval = pendingApprovals[messageId];
  const item = approval.item;
  
  // Update message to show cancellation
  await ctx.editMessageText(`❌ CANCELLED: ${item.item_name}`, {
    reply_markup: undefined
  });
  
  // Clean up approval tracking
  delete pendingApprovals[messageId];
  
  await ctx.answerCallbackQuery("Item cancelled");
});

// --- Dispatcher Approval ---
bot.callbackQuery(/dispatch_approve:(.+):(.+)/, async ctx => {
  const itemId = ctx.match![1];
  const originalMessageId = ctx.match![2];
  const messageId = ctx.callbackQuery.message?.message_id;
  
  if (!messageId || !pendingDispatch[messageId]) {
    return await ctx.answerCallbackQuery("Dispatch record not found");
  }
  
  const dispatch = pendingDispatch[messageId];
  const item = dispatch.item;
  
  // Edit dispatcher message to show approval
  await ctx.editMessageText(
    `✅ DISPATCHED: <<${dispatch.supplier}>>\n${item.item_name} ${dispatch.quantity} ${item.measure_unit}\n•\n\n${dispatch.dateStamp}`,
    { reply_markup: undefined }
  );
  
  console.log(`[DEBUG] Sending poll to Processing Topic (ID: ${PROCESSING_TOPIC_ID}) for item: ${item.item_name} x${dispatch.quantity}`);
  // Create poll for Processing Topic
  const pollMessage = await bot.api.sendPoll(
    GROUP_CHAT_ID,
    `Confirm receipt of items from ${dispatch.supplier} - ${dispatch.dateStamp}?`,
    [`${item.item_name} (${dispatch.quantity} ${item.measure_unit})`],
    {
      message_thread_id: PROCESSING_TOPIC_ID,
      allows_multiple_answers: true,
      is_anonymous: false
    }
  );
  
  // Store poll for completion tracking
  pendingPolls[pollMessage.poll?.id || ''] = {
    item: item,
    quantity: dispatch.quantity,
    supplier: dispatch.supplier,
    dateStamp: dispatch.dateStamp,
    messageId: pollMessage.message_id
  };
  console.log(`[DEBUG] Poll posted to Processing Topic (ID: ${PROCESSING_TOPIC_ID}) for item: ${item.item_name} x${dispatch.quantity}`);
  
  // Clean up dispatch tracking
  delete pendingDispatch[messageId];
  
  await ctx.answerCallbackQuery("✅ Item dispatched - Poll created for processing");
});

// --- Dispatcher Rejection ---
bot.callbackQuery(/dispatch_reject:(.+):(.+)/, async ctx => {
  const itemId = ctx.match![1];
  const originalMessageId = ctx.match![2];
  const messageId = ctx.callbackQuery.message?.message_id;
  
  if (!messageId || !pendingDispatch[messageId]) {
    return await ctx.answerCallbackQuery("Dispatch record not found");
  }
  
  const dispatch = pendingDispatch[messageId];
  const item = dispatch.item;
  
  // Edit dispatcher message to show rejection
  await ctx.editMessageText(
    `❌ DISPATCH REJECTED: <<${dispatch.supplier}>>\n${item.item_name} ${dispatch.quantity} ${item.measure_unit}\n•\n\n${dispatch.dateStamp}`,
    { reply_markup: undefined }
  );
  
  // Clean up dispatch tracking
  delete pendingDispatch[messageId];
  
  await ctx.answerCallbackQuery("❌ Dispatch rejected");
});

// --- Processing Poll Answer Handler (Order Completion) ---
bot.on('poll_answer', async (ctx) => {
  const pollId = ctx.pollAnswer.poll_id;
  const userId = ctx.pollAnswer.user?.id;
  
  // Check if this is a processing completion poll
  if (!pendingPolls[pollId]) {
    return; // Poll not tracked for processing completion
  }
  
  const poll = pendingPolls[pollId];
  
  // Check if all options are selected (simplified for single item)
  if (ctx.pollAnswer.option_ids.length > 0) {
    console.log(`[DEBUG] Sending completion message to Completed Topic (ID: ${COMPLETED_TOPIC_ID}) for item: ${poll.item.item_name} x${poll.quantity}`);
    // Send completion message to Completed Topic
    const completedKeyboard = new InlineKeyboard()
      .text("📊 CRM", `crm_update:${pollId}`);
    
    await bot.api.sendMessage(GROUP_CHAT_ID,
      `🎉 COMPLETED!\n\n<<${poll.supplier}>>\n${poll.item.item_name} ${poll.quantity} ${poll.item.measure_unit}\n•\n\n${poll.dateStamp}`,
      {
        message_thread_id: COMPLETED_TOPIC_ID,
        reply_markup: completedKeyboard
      }
    );
    
    // Clean up poll tracking
    delete pendingPolls[pollId];
    
    console.log(`[DEBUG] Order completed for ${poll.item.item_name} x${poll.quantity} from ${poll.supplier}`);
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
    console.log(`[DEBUG] Custom item request forwarded to Manager Topic (ID: ${MANAGER_TOPIC_ID})`);
    
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
  const query = ctx.inlineQuery.query.trim();
  const queryParts = query.split(' ');
  
  // Stage 1: Empty query - show main categories
  if (query === '') {
    const results = [
      {
        type: "article" as const,
        id: "kitchen",
        title: "1. KITCHEN",
        description: "Kitchen items and supplies",
        input_message_content: { message_text: "1 " },
      },
      {
        type: "article" as const,
        id: "bar",
        title: "2. BAR", 
        description: "Bar items and supplies",
        input_message_content: { message_text: "2 " },
      }
    ];
    
    await ctx.answerInlineQuery(results, { 
      cache_time: 0,
      button: { 
        text: "Type 1 <space>",
        start_parameter: "inline_help"
      }
    });
    return;
  }
  
  // Stage 2: User typed "1 " (kitchen) - show kitchen sub-categories
  if (query === '1 ' || query === '1') {
    const results = [
      {
        type: "article" as const,
        id: "kitchen_food",
        title: "1. FOOD",
        description: "Meat, fish, dairy, vegetables, spices, sauces",
        input_message_content: { message_text: "1 1 " },
      },
      {
        type: "article" as const,
        id: "kitchen_households",
        title: "2. HOUSEHOLDS", 
        description: "Cleaning, plastics, dry goods",
        input_message_content: { message_text: "1 2 " },
      }
    ];
    
    await ctx.answerInlineQuery(results, { 
      cache_time: 0,
      button: { 
        text: "Type 1 <space>",
        start_parameter: "inline_help"
      }
    });
    return;
  }
  
  // Stage 3: User typed "2 " (bar) - show bar sub-categories  
  if (query === '2 ' || query === '2') {
    const results = [
      {
        type: "article" as const,
        id: "bar_food",
        title: "1. FOOD",
        description: "Fruits, ingredients, desserts",
        input_message_content: { message_text: "2 1 " },
      },
      {
        type: "article" as const,
        id: "bar_households", 
        title: "2. HOUSEHOLDS",
        description: "Cleaning, cups, office supplies",
        input_message_content: { message_text: "2 2 " },
      }
    ];
    
    await ctx.answerInlineQuery(results, { 
      cache_time: 0,
      button: { 
        text: "Type 1 <space>",
        start_parameter: "inline_help"
      }
    });
    return;
  }
  
  // Stage 4: Show filtered items based on selection
  const items = loadJson(ITEM_JSON);
  let filteredItems: any[] = [];
  
  // Kitchen Food (1 1)
  if (query.startsWith('1 1')) {
    const foodSubCategories = ['meat', 'fish/seafood', 'dairy', 'veggies', 'spices', 'sauce'];
    filteredItems = items.filter((item: any) => 
      item.category_id < 30000 && foodSubCategories.includes(item.sub_category)
    );
  }
  // Kitchen Households (1 2) 
  else if (query.startsWith('1 2')) {
    const householdSubCategories = ['cleaning', 'plastics', 'dry'];
    filteredItems = items.filter((item: any) => 
      item.category_id < 30000 && householdSubCategories.includes(item.sub_category)
    );
  }
  // Bar Food (2 1)
  else if (query.startsWith('2 1')) {
    const foodSubCategories = ['fruits', 'ingredients'];
    filteredItems = items.filter((item: any) => 
      item.category_id >= 30000 && foodSubCategories.includes(item.sub_category)
    );
  }
  // Bar Households (2 2)
  else if (query.startsWith('2 2')) {
    const householdSubCategories = ['households'];
    filteredItems = items.filter((item: any) => 
      item.category_id >= 30000 && householdSubCategories.includes(item.sub_category)
    );
  }
  // Fallback: search all items by name if query doesn't match pattern
  else {
    const searchQuery = query.toLowerCase();
    filteredItems = items.filter((item: any) => 
      item.item_name.toLowerCase().includes(searchQuery)
    );
  }
  
  // Generate item results with "Add to order" buttons
  const results = filteredItems.slice(0, 50).map((item: any) => ({
    type: "article" as const,
    id: item.item_sku,
    title: item.item_name,
    description: `${item.category_name || ''} - ${item.sub_category || ''}`,
    input_message_content: { message_text: `🛒 ${item.item_name} - Sent for manager approval` },
    reply_markup: {
      inline_keyboard: [[{ text: "Add to order", callback_data: `add_to_order:${item.item_sku}` }]],
    },
  }));
  
  await ctx.answerInlineQuery(results, { 
    cache_time: 0,
    button: { 
      text: "Type 1 <space>",
      start_parameter: "inline_help"
    }
  });
});

// --- Help Command ---
bot.command("help", async ctx => {
  await ctx.reply(
    "🏪 KALI Easy Order V2 Help\n\n• Select category → Choose item → Manager approval → Dispatcher review → Processing confirmation → Completed\n• Use @botname <search> for inline search\n• Custom lets you send requests to managers"
  );
});

console.log('[DEBUG] Starting V2 bot...');

// Check if we should use webhooks (production) or polling (development)
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT;
const isProduction = process.env.NODE_ENV === 'production' || Boolean(WEBHOOK_URL);

console.log('[DEBUG] Environment check:');
console.log('[DEBUG] - NODE_ENV:', process.env.NODE_ENV);
console.log('[DEBUG] - WEBHOOK_URL:', WEBHOOK_URL);
console.log('[DEBUG] - PORT:', PORT);
console.log('[DEBUG] - isProduction:', isProduction);

if (isProduction) {
  console.log('[DEBUG] Starting V2 bot in WEBHOOK mode for production...');
  console.log('[DEBUG] Webhook URL:', WEBHOOK_URL);
  console.log('[DEBUG] Port:', PORT || '3000');
  
  // Create Express app for webhooks
  const app = express();
  app.use(express.json());
  
  console.log('[DEBUG] Express app created and JSON middleware added');
  
  // Webhook endpoint
  app.post('/webhook', async (req, res) => {
    console.log('[DEBUG] Webhook endpoint hit!');
    console.log('[DEBUG] Request body keys:', Object.keys(req.body));
    console.log('[DEBUG] Request body:', JSON.stringify(req.body, null, 2));
    try {
      console.log('[DEBUG] About to call bot.handleUpdate');
      await bot.handleUpdate(req.body);
      console.log('[DEBUG] bot.handleUpdate completed successfully');
      res.status(200).send('OK');
      console.log('[DEBUG] Sent 200 OK response');
    } catch (error) {
      console.error('[ERROR] Webhook error:', error);
      console.error('[ERROR] Webhook error stack:', (error as Error).stack);
      res.status(500).send('Error');
      console.log('[DEBUG] Sent 500 Error response');
    }
  });
  
  // Health check endpoint
  app.get('/', (req, res) => {
    console.log('[DEBUG] Health check endpoint hit');
    res.send('KALI Order Bot V2 is running!');
    console.log('[DEBUG] Health check response sent');
  });
  
  console.log('[DEBUG] Routes registered: POST /webhook, GET /');
  
  // Start server
  const port = parseInt(PORT || '3000');
  console.log('[DEBUG] About to start server on port:', port);
  app.listen(port, async () => {
    console.log('[DEBUG] V2 Bot webhook server started successfully on port', port);
    console.log('[DEBUG] Server is listening and ready to receive requests');
    
            // Add retry logic for webhook setup
            let retries = 3;
            let webhookSet = false;
            
            while (retries > 0 && !webhookSet) {
              try {
                await bot.api.setWebhook(`${WEBHOOK_URL}/webhook`, {
                  drop_pending_updates: true,
                  max_connections: 40,
                  allowed_updates: ['message', 'callback_query', 'inline_query', 'poll_answer']
                });
                webhookSet = true;
                console.log('[DEBUG] Webhook set successfully');
              } catch (retryError) {
                retries--;
                console.log(`[DEBUG] Webhook setup attempt failed, retries left: ${retries}`);
                if (retries > 0) {
                  console.log('[DEBUG] Waiting 2 seconds before retry...');
                  await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                  throw retryError;
                }
              }
            }
            
            if (!webhookSet) {
              throw new Error('Failed to set webhook after all retries');
            }
    if (WEBHOOK_URL) {
      console.log('[DEBUG] Setting webhook to:', `${WEBHOOK_URL}/webhook`);
      try {
        await bot.api.setWebhook(`${WEBHOOK_URL}/webhook`);
        console.log('[DEBUG] Webhook set successfully');
            console.error('[ERROR] Failed to set webhook after retries:', error);
            console.error('[ERROR] This might be due to:');
            console.error('[ERROR] 1. Invalid BOT_TOKEN - check your .env file');
            console.error('[ERROR] 2. Network connectivity issues');
            console.error('[ERROR] 3. Telegram API temporary issues');
            console.error('[ERROR] Bot will continue running but webhooks may not work properly');
            
            // Don't exit the process, let the server continue running
            if ((error as Error).message.includes('404') || (error as Error).message.includes('Unauthorized')) {
              console.error('[ERROR] BOT_TOKEN appears to be invalid! Please check your .env file.');
      } catch (error) {
        console.error('[ERROR] Webhook setup error stack:', (error as Error).stack);
        if ((error as Error).message.includes('404: Not Found')) {
          console.error('[ERROR] Invalid BOT_TOKEN! Please check your environment variables.');
        }
        process.exit(1);
      }
    } else {
      console.log('[DEBUG] No WEBHOOK_URL provided, webhook not set');
    }
  });
  
  // Add error handler for Express app
  app.on('error', (error) => {
    console.error('[ERROR] Express app error:', error);
    console.error('[ERROR] Express error stack:', error.stack);
  });
  
} else {
  console.log('[DEBUG] Starting V2 bot in POLLING mode for development...');
  
  bot.start().then(() => {
    console.log('[DEBUG] V2 Bot started successfully in polling mode!');
  }).catch((error) => {
    console.error('[ERROR] Failed to start V2 bot:', error);
    console.error('[ERROR] Bot start error stack:', error.stack);
    if (error.message.includes('404: Not Found')) {
      console.error('[ERROR] Invalid BOT_TOKEN! Please check your .env file and ensure the token is correct.');
      console.error('[ERROR] Get a new token from @BotFather on Telegram if needed.');
    }
    process.exit(1);
  }).finally(() => {
    console.log('[DEBUG] V2 Bot start() promise completed (either resolved or rejected)');
  });
}