import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import fs from 'fs';
import path from 'path';

// === CONFIG ===
const BOT_TOKEN = process.env.BOT_TOKEN!;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID!;
const DATA_DIR = "./data";
const ITEM_CSV = `${DATA_DIR}/items.csv`;
const ITEM_JSON = `${DATA_DIR}/items.json`;
const CATEGORY_JSON = `${DATA_DIR}/categories.json`;
const SUPPLIER_JSON = `${DATA_DIR}/suppliers.json`;

const GROUP_CHAT_ID = "-1003049165819"; // group/chat ID
const KITCHEN_TOPIC_ID = 5;
const BAR_TOPIC_ID = 14;
const SUPPLIER_CHAT_ID = "-1002979418678"; // supplier chat/group (replace)
const MANAGER_TOPIC_ID = 120;        // manager topic/group (replace)
const ADMIN_TOPIC_ID = 82;          // admin topic/group (replace)

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
function importCSVtoItems(csvPath: string) {
  if (!fs.existsSync(csvPath)) return [];
  const csv = fs.readFileSync(csvPath, "utf8");
  const [header, ...lines] = csv.trim().split("\n");
  const headers = header.split(",");
  return lines.map(line => {
    const values = line.split(",");
    const obj: any = {};
    headers.forEach((h, i) => obj[h.trim()] = values[i]?.trim());
    return obj;
  });
}
function exportItemsToCSV(jsonPath: string, csvPath: string) {
  const items = loadJson(jsonPath);
  if (!items.length) return;
  const headers = Object.keys(items[0]);
  const csvRows = [
    headers.join(","),
    ...items.map((item: Record<string, any>) => headers.map(h => item[h] ?? "").join(","))
  ];
  backupFile(csvPath);
  fs.writeFileSync(csvPath, csvRows.join("\n"));
}

// --- Order Schedule (Round 1, Round 2) ---
function getOrderRound(now: Date) {
  // Returns current round based on time
  const hour = now.getHours();
  if (hour >= 19 || hour < 8) return "Round 1";
  if (hour >= 10 && hour < 18) return "Round 2";
  return "Outside order rounds";
}

// --- Payment & Confirmation ---
function handlePaymentStatus(order: any, status: string) {
  // Update order payment status
  // If paid, move order to next round or group
}

// === BOT INSTANCE ===
const bot = new Bot(BOT_TOKEN);

// === USER FLOW ===
// Simple context tracking per user (for demo, not persistent)
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
  await ctx.reply("⚡ Welcome to KALI Easy Order!\nSelect a main category:", {
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
    // Track context: user is viewing categories
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
  // Add Go Back button at the end
  itemsKeyboard.text('⬅️ Go Back', `go_back_to_categories:${categoryId}`).row();
  // Get category name
  const categories = loadJson(CATEGORY_JSON);
  const category = categories.find((cat: any) => cat.category_id == categoryId);
  const categoryName = category ? category.category_name : "Items";
  await ctx.editMessageText(categoryName + ':', { reply_markup: itemsKeyboard });
  // Track context: user is viewing items
  if (ctx.from) userContext[ctx.from.id] = "items";
});
  
// --- Go Back from Items to Categories ---
bot.callbackQuery(/go_back_to_categories:(\d+)/, async ctx => {
  const categoryId = Number(ctx.match![1]);
  // Find parent category (kitchen/bar) for this category
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

// --- Add to Order ---
bot.callbackQuery(/add_to_order:(.+)/, async ctx => {
  const itemId = ctx.match![1];
  const items = loadJson(ITEM_JSON);
  const item = items.find((i: any) => String(i.item_sku) === itemId);
  if (!item) return await ctx.answerCallbackQuery("Item not found");
  let topicId;
  // Infer source if missing: kitchen for category_id < 30000, bar for >= 30000
  const isKitchen = item.source === "kitchen" || (!item.source && item.category_id < 30000);
  if (isKitchen) {
    kitchenOrder[itemId] = (kitchenOrder[itemId] || 0) + 1;
    topicId = KITCHEN_TOPIC_ID;
  } else {
    barOrder[itemId] = (barOrder[itemId] || 0) + 1;
    topicId = BAR_TOPIC_ID;
  }
  await ctx.answerCallbackQuery("✅ Added to shared order");
  // Post to group/topic
  await bot.api.sendMessage(GROUP_CHAT_ID, `🛒 Added: ${item.item_name} (${item.item_sku})`, { message_thread_id: topicId });
});

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

// --- "Custom" Item Flow ---
bot.hears("Custom", async ctx => {
  await ctx.reply("Send your custom item request (photo, voice, or text). This will be sent to admins for approval.", { reply_markup: { remove_keyboard: true } });
});
bot.on(['message:text', 'message:photo', 'message:voice'], async ctx => {
  if (ctx.message.reply_to_message && ctx.message.reply_to_message.text && ctx.message.reply_to_message.text.includes("custom item request")) {
    await bot.api.forwardMessage(ADMIN_TOPIC_ID, ctx.chat.id, ctx.message.message_id);
    await ctx.reply("✅ Custom request sent to admins.");
  }
});

// --- Navigation ---
bot.hears("Go Back", async ctx => {
  // Context-aware Go Back
  const userId = ctx.from?.id;
  if (userId && userContext[userId] === "items") {
    // Show categories for kitchen (from item list)
    const categories = loadJson(CATEGORY_JSON).filter((c: any) => c.parent_category === "kitchen");
    const catsKeyboard = new InlineKeyboard();
    categories.forEach((cat: any) =>
      catsKeyboard.text(cat.category_name, `show_items:${cat.category_id}`).row()
    );
    await ctx.reply("Categories for Kitchen:", { reply_markup: catsKeyboard });
    userContext[userId] = "categories";
  } else {
    // Show all main categories (from category view or default)
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
  // Show all main categories
  const categories = loadJson(CATEGORY_JSON);
  const catsKeyboard = new InlineKeyboard();
  categories.forEach((cat: any) =>
    catsKeyboard.text(cat.category_name, `show_items:${cat.category_id}`).row()
  );
  await ctx.reply("All Categories:", { reply_markup: catsKeyboard });
});
bot.hears("Search", async ctx => {
  await ctx.reply("Type @kaliadminbot <item> in any chat to search instantly, or tap below to start inline search.", {
    reply_markup: new InlineKeyboard().switchInlineCurrent("").row()
  });
});
bot.callbackQuery("start_inline_search", async ctx => {
  await ctx.reply("Type @kalisystembot <item> in any chat to search instantly.");
});

// --- Inline Query ---
bot.inlineQuery(/.*/, async ctx => {
  const chatType = ctx.inlineQuery.chat_type;
  if (chatType !== "group" && chatType !== "supergroup" && String(ctx.inlineQuery.from?.id) !== ADMIN_CHAT_ID) {
    return await ctx.answerInlineQuery([]);
  }
  const items = loadJson(ITEM_JSON);
  const results = items.map((item: any) => ({
    type: "article",
    id: item.item_sku,
    title: item.item_name,
    input_message_content: { message_text: item.item_name },
    reply_markup: {
      inline_keyboard: [[{ text: "Add to order", callback_data: `add_to_order:${item.item_sku}` }]],
    },
  }));
  await ctx.answerInlineQuery(results.slice(0, 50), { cache_time: 0 });
});

// === ADMIN FLOW ===

// --- Admin Main Menu ---
const adminMenuKeyboard = new InlineKeyboard()
  .text("Edit Item", "admin_edit_item")
  .text("Edit Files", "admin_edit_files")
  .text("Edit Layouts", "admin_edit_layouts")
  .row();

// === ADMIN FILE MANAGEMENT MENU ===
const adminFileMenu = new InlineKeyboard()
  .text("Items", "file_menu:items").row()
  .text("Categories", "file_menu:categories").row()
  .text("Suppliers", "file_menu:suppliers").row()
  .text("Layouts", "file_menu:layouts").row()
  .text("Kitchen Template", "file_menu:template_kitchen").row()
  .text("Bar Template", "file_menu:template_bar").row()
  .text("Manager Template", "file_menu:template_manager").row()
  .text("Supplier Template", "file_menu:template_supplier").row();

function getFileActionsKeyboard(key: string) {
  const actions = new InlineKeyboard()
    .text('Export JSON', `file_export_json:${key}`)
    .text('Export CSV', `file_export_csv:${key}`).row()
    .text('Import CSV', `file_import_csv:${key}`)
    .text('Share', `file_share:${key}`).row()
    .text('Edit', `file_edit:${key}`)
    .text('Restore', `file_restore:${key}`).row();
  if (["template_kitchen","template_bar","template_manager","template_supplier"].includes(key)) {
    actions.text('Edit Template', `file_edit_template:${key}`).row();
  }
  return actions;
}

bot.command('admin_files', async ctx => {
  if (String(ctx.chat?.id) !== ADMIN_CHAT_ID) return ctx.reply('Access denied. Only allowed in admin chat.');
  await ctx.reply('Choose a file to manage:', { reply_markup: adminFileMenu });
});

bot.callbackQuery(/file_menu:(\w+)/, async ctx => {
  const key = ctx.match![1];
  await ctx.reply(`File actions for ${key}:`, { reply_markup: getFileActionsKeyboard(key) });
});

bot.callbackQuery(/file_export_json:(\w+)/, async ctx => {
  // Implement file export logic for JSON
  // ...existing code or use sendFile utility...
});

bot.callbackQuery(/file_export_csv:(\w+)/, async ctx => {
  // Implement file export logic for CSV
  // ...existing code or use sendFile utility...
});

bot.callbackQuery(/file_share:(\w+)/, async ctx => {
  // Implement file share logic
  // ...existing code or use sendFile utility...
});

bot.callbackQuery(/file_import_csv:(\w+)/, async ctx => {
  // Implement file import prompt for CSV
  await ctx.reply(`Please send CSV file as document to import for ${ctx.match![1]}.`);
});

bot.on('message:document', async ctx => {
  if (String(ctx.chat?.id) !== ADMIN_CHAT_ID) return;
  const fname = ctx.message.document?.file_name;
  const DATA_DIR = './data';
  const files = [
    { key: 'items', csv: 'items.csv', json: 'items.json' },
    { key: 'categories', csv: 'categories.csv', json: 'categories.json' },
    { key: 'suppliers', csv: 'suppliers.csv', json: 'suppliers.json' },
    { key: 'layouts', json: 'layouts.json' },
    { key: 'template_kitchen', txt: 'template_kitchen.txt' },
    { key: 'template_bar', txt: 'template_bar.txt' },
    { key: 'template_manager', txt: 'template_manager.txt' },
    { key: 'template_supplier', txt: 'template_supplier.txt' }
  ];
  for (const file of files) {
    if (file.csv && fname === file.csv) {
      const fileId = ctx.message.document.file_id;
      const fileInfo = await bot.api.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;
      const res = await fetch(fileUrl);
      const csv = await res.text();
      const csvPath = `${DATA_DIR}/${file.csv}`;
      backupFile(csvPath);
      fs.writeFileSync(csvPath, csv);
      await ctx.reply(`CSV imported and saved as ${file.csv}.`);
      // Optionally convert to JSON here
      return;
    }
    if (file.txt && fname === file.txt) {
      const fileId = ctx.message.document.file_id;
      const fileInfo = await bot.api.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;
      const res = await fetch(fileUrl);
      const txt = await res.text();
      const txtPath = `${DATA_DIR}/${file.txt}`;
      backupFile(txtPath);
      fs.writeFileSync(txtPath, txt);
      await ctx.reply(`Template imported and saved as ${file.txt}.`);
      return;
    }
  }
});

bot.callbackQuery(/file_edit:(\w+)/, async ctx => {
  // Implement file edit logic for JSON/text
  // ...existing code or use fs.readFileSync...
});

bot.callbackQuery(/file_restore:(\w+)/, async ctx => {
  // Implement file restore logic
  // ...existing code or use backupFile...
});

bot.callbackQuery(/file_edit_template:(\w+)/, async ctx => {
  // Implement template edit logic for text files
  // ...existing code or use fs.readFileSync...
});

// --- Admin: View Supplier Orders (on Dispatch) ---
bot.command("admin", async ctx => {
  if (String(ctx.chat?.id) !== ADMIN_CHAT_ID) return ctx.reply("Access denied. Only allowed in admin chat.");
  await ctx.reply("Admin Menu:", { reply_markup: adminMenuKeyboard });
});

// --- Edit Files Menu ---
const adminFilesKeyboard = new InlineKeyboard()
  .text("CSV: Items", "edit_csv_items")
  .text("JSON: Items", "edit_json_items")
  .text("JSON: Categories", "edit_json_categories")
  .text("JSON: Suppliers", "edit_json_suppliers")
  .row();

bot.callbackQuery("admin_edit_files", async ctx => {
  await ctx.reply("Select file to edit/export/share:", { reply_markup: adminFilesKeyboard });
// --- Admin: Focus on Supplier Order ---
});
bot.callbackQuery("edit_csv_items", async ctx => {
  const csv = fs.existsSync(ITEM_CSV) ? fs.readFileSync(ITEM_CSV, "utf8") : "CSV file not found.";
  await ctx.reply(`CSV Items (edit and send back):\n\n${csv}`);
});
bot.callbackQuery("edit_json_items", async ctx => {
  const json = fs.existsSync(ITEM_JSON) ? fs.readFileSync(ITEM_JSON, "utf8") : "[]";
  await ctx.reply(`JSON Items (edit and send back):\n\`\`\`json\n${json}\n\`\`\``);
});
bot.callbackQuery("edit_json_categories", async ctx => {
  const json = fs.existsSync(CATEGORY_JSON) ? fs.readFileSync(CATEGORY_JSON, "utf8") : "[]";
  await ctx.reply(`JSON Categories (edit and send back):\n\`\`\`json\n${json}\n\`\`\``);
});
bot.callbackQuery("edit_json_suppliers", async ctx => {
  const json = fs.existsSync(SUPPLIER_JSON) ? fs.readFileSync(SUPPLIER_JSON, "utf8") : "[]";
  await ctx.reply(`JSON Suppliers (edit and send back):\n\`\`\`json\n${json}\n\`\`\``);
});

// --- CSV/JSON Save Handlers ---
bot.on('message:text', async ctx => {
  if (String(ctx.chat?.id) !== ADMIN_CHAT_ID) return;
  // CSV Save
  if (ctx.message.text.startsWith("CSV Items")) {
    const csvData = ctx.message.text.replace(/CSV Items \(edit and send back\):/i, "").trim();
    backupFile(ITEM_CSV);
    fs.writeFileSync(ITEM_CSV, csvData);
    // Optionally convert to JSON
    const items = importCSVtoItems(ITEM_CSV);
    backupFile(ITEM_JSON);
    saveJson(ITEM_JSON, items);
    await ctx.reply("CSV updated and converted to JSON!");
  }
  // JSON Save
  if (ctx.message.text.trim().startsWith("{") || ctx.message.text.trim().startsWith("[")) {
    try {
      const json = JSON.parse(ctx.message.text.trim());
      // Infer type by keys: items/categories/suppliers
      if (Array.isArray(json) && json[0]?.item_sku) {
        backupFile(ITEM_JSON);
        saveJson(ITEM_JSON, json);
        await ctx.reply("Items JSON updated!");
      } else if (Array.isArray(json) && json[0]?.category_id) {
        backupFile(CATEGORY_JSON);
        saveJson(CATEGORY_JSON, json);
        await ctx.reply("Categories JSON updated!");
      } else if (Array.isArray(json) && json[0]?.supplier) {
        backupFile(SUPPLIER_JSON);
        saveJson(SUPPLIER_JSON, json);
        await ctx.reply("Suppliers JSON updated!");
      } else {
        await ctx.reply("Unknown JSON structure.");
      }
    } catch {
      await ctx.reply("Invalid JSON format.");
    }
  }
});

// --- Admin Edit Item Flow ---
bot.callbackQuery("admin_edit_item", async ctx => {
  const categories = loadJson(CATEGORY_JSON);
  const menu = new InlineKeyboard();
  categories.forEach((cat: any) =>
    menu.text(cat.category_name, `admin_edit_cat:${cat.category_id}`).row()
  );
  await ctx.reply("Select a category to edit its items:", { reply_markup: menu });
});

bot.callbackQuery(/admin_edit_cat:(\d+)/, async ctx => {
  const categoryId = Number(ctx.match![1]);
  const items = loadJson(ITEM_JSON).filter((i: any) => i.category_id == categoryId);
  const menu = new InlineKeyboard();
  items.forEach((item: any) =>
    menu.text(item.item_name, `admin_edit_item_json:${item.item_sku}`).row()
  );
  await ctx.reply("Select an item to edit:", { reply_markup: menu });
});

bot.callbackQuery(/admin_edit_item_json:(.+)/, async ctx => {
  const itemSku = ctx.match![1];
  const items = loadJson(ITEM_JSON);
  const item = items.find((i: any) => String(i.item_sku) === itemSku);
  if (!item) return await ctx.reply("Item not found.");
  await ctx.reply(`Edit this item JSON and send back to update:\n\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\``);
});

// --- Admin Item JSON Update by Snippet ---
bot.on('message:text', async ctx => {
  await ctx.reply(`[DEBUG] message:text handler triggered. chat.id=${ctx.chat?.id}`);
  if (String(ctx.chat?.id) !== ADMIN_CHAT_ID) return;
  // If message is valid item JSON
  if (ctx.message.text.trim().startsWith("{")) {
    try {
      const item = JSON.parse(ctx.message.text.trim());
      if (item.item_sku) {
        let itemsArr = loadJson(ITEM_JSON);
        const idx = itemsArr.findIndex((i: any) => i.item_sku == item.item_sku);
        if (idx >= 0) {
          itemsArr[idx] = item;
          backupFile(ITEM_JSON);
          saveJson(ITEM_JSON, itemsArr);
          await ctx.reply("Item updated!");
        } else {
          itemsArr.push(item);
          backupFile(ITEM_JSON);
          saveJson(ITEM_JSON, itemsArr);
          await ctx.reply("Item created!");
        }
      }
    } catch {
      await ctx.reply("Invalid item JSON.");
    }
  }
});

// --- Supplier Order Admin Actions ---
bot.callbackQuery(/admin_supplier_order:(.+)/, async ctx => {
  const supplierId = ctx.match![1];
  // Load items for supplier, display actions per item
  const itemsArr = loadJson(ITEM_JSON).filter((i: any) => i.supplier == supplierId);
  const menu = new InlineKeyboard();
  itemsArr.forEach((item: any) =>
    menu.text(item.item_name, `admin_item_action_menu:${item.item_sku}`).row()
  );
  await ctx.reply("Select item for admin action:", { reply_markup: menu });
});

bot.callbackQuery(/admin_item_action_menu:(.+)/, async ctx => {
  const itemSku = ctx.match![1];
  const submenu = new InlineKeyboard()
    .text("Set Qty", `admin_item_action:setqty:${itemSku}`)
    .text("Remove", `admin_item_action:remove:${itemSku}`).row()
    .text("Assign To", `admin_item_action:assign:${itemSku}`).row();
  await ctx.reply("Choose action:", { reply_markup: submenu });
});

// --- Modular Item Assignment, Quantity, Removal ---
bot.callbackQuery(/admin_item_action:(setqty|remove|assign):(.+)/, async ctx => {
  const action = ctx.match![1];
  const itemSku = ctx.match![2];
  let itemsArr = loadJson(ITEM_JSON);
  const idx = itemsArr.findIndex((i: any) => String(i.item_sku) === itemSku);
  if (idx < 0) return await ctx.reply("Item not found.");
  if (action === "setqty") {
    await ctx.reply("Send new quantity for this item:");
    // You may want to set a session/context flag to expect next message as qty
  } else if (action === "remove") {
    itemsArr.splice(idx, 1);
    backupFile(ITEM_JSON);
    saveJson(ITEM_JSON, itemsArr);
    await ctx.reply("Item removed from supplier order.");
  } else if (action === "assign") {
    const suppliers = loadJson(SUPPLIER_JSON).filter((s: any) => s.enabled);
    const menu = new InlineKeyboard()
      .text("Kali", `admin_assign:kali:${itemSku}`).row()
      .text("Alternative", `admin_assign:alt:${itemSku}`).row();
    suppliers.forEach((s: any) =>
      menu.text(s.supplier, `admin_assign:${s.supplier}:${itemSku}`).row()
    );
    await ctx.reply("Assign item to:", { reply_markup: menu });
  }
});

bot.on('message:text', async ctx => {
  // Handle quantity update for setqty action if session/context is set
  // Example: if (ctx.session.expectingQtyFor) { ... }
});

// --- Manager Topic: Processing & Completion ---
bot.command('manager_processing', async ctx => {
  // Only manager/admin role
  // View all processing orders, mark as completed
  // Inline keyboard: [Complete]
  await ctx.reply('Manager processing orders:', {
    reply_markup: new InlineKeyboard().text('Complete', 'complete_order').row()
  });
});

bot.callbackQuery('complete_order', async ctx => {
  // Mark order as completed
  await ctx.reply('Order marked as completed.');
});

bot.callbackQuery(/admin_item_action:assign:(.+)/, async ctx => {
  const itemSku = ctx.match![1];
  const suppliers = loadJson(SUPPLIER_JSON).filter((s: any) => s.enabled);
  const menu = new InlineKeyboard()
    .text("Kali", `admin_assign:kali:${itemSku}`).row()
    .text("Alternative", `admin_assign:alt:${itemSku}`).row();
  suppliers.forEach((s: any) =>
    menu.text(s.supplier, `admin_assign:${s.supplier}:${itemSku}`).row()
  );
  await ctx.reply("Assign item to:", { reply_markup: menu });
});

bot.callbackQuery(/admin_assign:(.+):(.+)/, async ctx => {
  const to = ctx.match![1];
  const itemSku = ctx.match![2];
  let itemsArr = loadJson(ITEM_JSON);
  const idx = itemsArr.findIndex((i: any) => String(i.item_sku) === itemSku);
  if (idx >= 0) {
    itemsArr[idx].supplier = to;
    backupFile(ITEM_JSON);
    saveJson(ITEM_JSON, itemsArr);
    await ctx.reply(`Item assigned to ${to}.`);
  }
});

// --- Edit Layouts ---
const layoutsMenu = new InlineKeyboard()
  .text("Order Layouts", "edit_order_layout")
  .text("Template: Kitchen", "edit_template_kitchen")
  .text("Template: Bar", "edit_template_bar")
  .text("Template: Manager", "edit_template_manager")
  .text("Template: Suppliers", "edit_template_suppliers")
  .row();

bot.callbackQuery("admin_edit_layouts", async ctx => {
  await ctx.reply("Select layout to edit:", { reply_markup: layoutsMenu });
});
bot.callbackQuery(/edit_template_(kitchen|bar|manager|suppliers)/, async ctx => {
  const type = ctx.match![1];
  // Load template from file, display for edit (implement your own storage)
  await ctx.reply(`Edit template for ${type}: (send new text to update)`);
});
bot.on('message:text', async ctx => {
  // Handle template update if admin
});

// --- Help Command ---
bot.command("help", async ctx => {
  await ctx.reply(
    "🏪 KALI Easy Order Help\n\n• Select category → Choose item → Add to shared order\n• Use @botname <search> for inline search\n• Custom lets you send any request to admin."
  );
});
bot.command("admin_help", async ctx => {
  await ctx.reply(`[DEBUG] admin_help handler triggered. chat.id=${ctx.chat?.id}`);
  await ctx.reply(
    `Admin Flow:
- Edit items/categories/suppliers via CSV/JSON
- Edit supplier orders: set qty/remove/assign to supplier
- Edit layouts/templates for all messages
- All changes backed up before update
- Inline mode for users only in group/private/admin chat`
  );
});

bot.start();