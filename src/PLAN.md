# KALI Easy Order Bot - Detailed Plan of Execution

This document outlines the detailed plan for the KALI Easy Order Bot development, focusing on the admin flow refactor, the conceptual "Order" object and its lifecycle, and explicit role-based interactions.

## 1. Core Concepts

### 1.1. The "Order" Object (Conceptual Definition)

The "Order" object is envisioned as the central, dynamic entity that flows through the system. It adapts its behavior and status based on contextual elements, user roles, and predefined rules.

Order flow exists on minimal flow, minimum steps required for a complete functional flow using inline mode, manager as supervisor, administration via topics from chat group, 
roles: user/manager/dispatcher
status: open, dispatching, processing, completed

// IMPORTANT IMPORTANT IMPORTANT
THIS IS THE BASE FLOW - AS IT SHOULD OPERATE - ORDER STATUS INHERENT FROM ACTIONS
FLOW PROGRESSION - SETPS ARE CONSOLIDATED VIA TOPICS;

-KITCHEN/BAR - user adds items - /start command returns corresponding categories, (private bot message, only choosen item is posted to the topic (category emoji+item name) -> bot forward message to MANAGER TOPIC for approval (<item name> ✅❌ buttons)
--Open Order status

-MANAGER (manager action only) approved items are forwarded by bot in DISPATCHER TOPIC as consolidated order message sorted by supplier for review (<<supplier name>> - <item list> ✅❌ buttons)(remove items from manager topic)(need to define message layout asap)
--Dispatching Order status

-DISPATCHER (dispatcher action only) approved supplier orders are forwarded to processing (remove original) by bot as polls for manager verification on reception. (need to define poll layout asap)
--Processing Order status

-PROCESSING (manager action only) supplier poll order (suplier name and item list as poll), when all clicked bot forward the poll as consolidated message to COMPLETED TOPIC for crm record (the same message as previously edited for dispatcher) +TITLE COMPLETED !(<<supplier name>> - <item list> CRM button)
--Completed Order status

-COMPLETED (manager action only) - FLOW REQUIREMENTS ARE FULFILLED FROM HERE an extra optional step to update crm will be implemented later.
--(archived) Order status

-ADMIN (admin only can post message, manager and dispatcher can approve or deny) when admin sends a tagged message, the bot attach ✅❌ buttons and send a copy to either manager or dispatcher topic.

NO NOTIFICATION BOT MESSAGE, MESSAGES SENT BY USER VIA BOT ARE PRIVATE, ALL MESSAGES SENT ACROSS THE GROUP ARE SILENT EXCEPT ADMIN REQUESTS.

1. user add items (open status) -> manager approve (dispatching status)-> dispatcher report to group (processing status)-> manager control received oods and control payment (completed status).

Extended flow (FUTURE BOT) adds more detailed steps to dispatcher, controlled by boss-admin to have more control and give more details on order processing with accurate payment status by supplier.
new roles: supplier, boss-admin
New status: ETA status; processing sub status; order placed (sent to suplier) confirmation suplier pending, boss-admin requests
payment status. pending waiting for (supplier confirmation) paid by (account dispatcher, transfer boss-admin, cash manager),
extended fonctions; stock count requests, urgent status, assign to driver team, basic item management, Introduction and test for automated dispatch, introduction to csv and web interface for basic crm integration.

Advanced, more control for manager with bot assistance for automated tasks, editing core files in bulk  and message type layouts from the bot (boss admin), and full access to the web interface, services status monitoring, 3rd party integration (introduction add-ons)

BOT ADDONS (conceptual)
Google sheet sync (google drive API - incremental backups, database reference, price lists)
delivery tracking bot (live map features)
food menu online ordering bot (seamless 1 click registration with telegram)
loyverse (loyverse custom app for full api requests and automated report backup)
printer cloud server (bot concept to order from printer)
service monitoring status (prometeus, graffana)
SAAS solution - B2B

**Attributes:**

*   `order_id`: Unique identifier for the entire order (e.g., UUID or timestamp-based).
*   `status`: Current state of the order (open (started), processing, completed) 
*   `items`: An array of ordered items. Each item within this array could have:
    *   `item_sku`: Unique identifier for the item.
    *   `item_name`: Name of the item.
    *   `quantity`: Ordered quantity.
    *   `measure_unit`: Unit of measurement.
    *   `assigned_supplier`: The supplier ultimately responsible for this item.
    *   `alternative_supplier`: An alternative supplier if the default is unavailable.
    *   `item_status`: (Optional) Status specific to this item within the order //(enabled, disabled) item status from item attribute  not from order object 
*   `created_by_user_id`: //Telegram User Name of the person who initiated the order.
*   `created_at`: Timestamp of order creation // (dd.mm.yy HH:mm) for all date and time format
*   `last_updated_at`: Timestamp of the last status change or modification.
*   `target_department`: (e.g., 'kitchen', 'bar', 'manager'). This indicates which department the order primarily concerns.// replace by order-type (kitchen or bar)
*   `telegram_message_id`: The message ID of the initial order message in the relevant topic/group.
*   `telegram_thread_id`: The message thread ID (topic ID) where the order was posted.
*   `payment_status`:// pending by default, set as paid by cash or paid by qr by manager on order reception.
*   `notes`: Any additional notes or special requests// this shouldn't be an attribute, custom requests and notes will be managed via chat on the side.

### 1.2. Order Flow Philosophy

The Order object is the main flowing element. Its `status` dictates the available actions and its visibility to different roles. Contextual elements (time, role, item properties, supplier availability) influence its behavior and trigger state transitions. The bot's logic will primarily revolve around updating and reacting to changes in this Order object.

## 2. Explicit Flow by Roles

This section details the interactions, menus, and rules for each user role within the bot.

### 2.1. User (Customer/Staff Placing Order)

*   **Chat Type**: Private chat with bot, Group chat (via inline mode //telegram search bar with auto-completion).
*   **Entry Points**:
    *   `/start` command in private chat. //ordering flow using inline buttons
    *   `@botname <query>` in any chat for inline search.// if initialized from kitchen topic display order list at the top (bot returns a message with all ordered kitchen items, then display tag categories, not set yet shortcut placeholder tag 1, tag 2, tag 3), start typing numbers diplays kit categories then space (if 1 typed it shows all cleaning for kitchen items, if number not found or start typing text will diplay all kit items)  
*   **Actions**:
    *   Initiate order by selecting "Kitchen" or "Bar" from `/start` menu.
    *   Browse categories using inline buttons //(private chat with bot), and using inline mode from chat group.
    *   Add items to a shared, temporary order (`kitchenOrder` or `barOrder`).
    *   View current items and quantities in their temporary "Kitchen Order" or "Bar Order" via reply keyboard buttons.
    *   Initiate a "Custom" item request (sends a message to admins for approval)//no need approval, request sent directly to dispatcher topic (bot prompt for picture, then item name (text), then qty (number).
    *   Search for items using inline mode.//search button from keyboard.
*   **Inline Menu/Buttons**:
    *   `startKeyboard`: "Kitchen", "Bar", "Search".
    *   `catsKeyboard`: List of categories for Kitchen/Bar.// sub categories first; Drinks, Ingredients, Households, need to set
    *   `itemsKeyboard`: List of items within a category.// sub categories first; Fresh, Frozen, Condiments, Plastics, need to set 
    *   "Add to order" button in inline query results.// should not, should be added directly on item click weither from inline mode or inline button item.
*   **Reply Keyboards**:
    *   `buildReplyKeyboard()`: Dynamically shows "Kitch Order (X)", "Bar Order (Y)", "Custom", "Go Back"// instead go back should be an inline button at the bottom of the list, "Categories"// intead it should be an inline button at the bottom of the list to main categoorie, "Search".
    *   
*   **Inline Mode Rules**:
    *   Users can search for items.
    *   "Add to order" button in inline results is only active if the inline query is performed in a group/supergroup chat, or by the admin in a private chat.//should not, mind to chat to discuss about a different approach

### 2.2. Kitchen Staff

*   **Chat Type**: Group chat (Kitchen Topic - `GROUP_CHAT_ID` with `KITCHEN_TOPIC_ID`).
*   **Actions**:
    *   Receive real-time notifications when items are added to the kitchen order.// should not, no bot messages as notifications (only tiny toast at the top od the screen)
    *   (Future) View a consolidated list of pending kitchen orders.//should define the template asap
    *   (Future) Mark individual items or entire orders as "prepared" or "completed".//can make now using basic order status mentionned above
*   **Inline Menu/Buttons**: (Future) "Mark Prepared", "Request Clarification".//can set now, status will be inherent on dispatcher and manager action
*   **Reply Keyboards**: None specific for their role in the Kitchen Topic.

### 2.3. Bar Staff// same recommendations as for kitchen

*   **Chat Type**: Group chat (Bar Topic - `GROUP_CHAT_ID` with `BAR_TOPIC_ID`).
*   **Actions**:
    *   Receive real-time notifications when items are added to the bar order
    *   (Future) View a consolidated list of pending bar orders.//
    *   (Future) Mark individual items or entire orders as "prepared" or "completed".
*   **Inline Menu/Buttons**: (Future) "Mark Prepared", "Request Clarification".
*   **Reply Keyboards**: None specific for their role in the Bar Topic.
//NEED TO SET ALL TOPIC IDS
KITCHEN, BAR, MANAGER, DISPATCHER, PROCESSING, COMPLETED, ADMIN

### 2.4. Manager

*   **Chat Type**: Private chat with bot, Group chat (Manager Topic - `GROUP_CHAT_ID` with `MANAGER_TOPIC_ID`).
*   **Entry Points**:
    *   `/admin` command in private chat://not only, bot command available without restrictions, replace with /manager (or /<manager name> need to set this) instead 
    *   `/manager_processing` command in private chat// not exactly will be defined later
*   **Actions**:
    *   Access the main Admin Menu via `/admin`.//ADMIN IS ADMIN, MANAGER IS A NEW ROLE
    *   Review custom item requests forwarded from users (in Manager Topic or private chat).//dispatcher topic
    *   
*   **Inline Menu/Buttons**: `adminMenuKeyboard`, `layoutsMenu`,
*   (Future) "Approve Custom Item", "Reject Custom Item",//  neeed to be set now following instructions given above, no approval needed, custom item requests are sent to dispatcher directly (picture+caption details)
*   "Mark Order Complete".




ATTENTION ATTENTION ATTENTION
STOP REVIEWING FROM HERE AFTER FIRST REVISION WE WILL RECHECK FROM THIS POINT AFTER UPDATE

### 2.5. Admin

*   **Chat Type**: Private chat with bot.
*   **Entry Point**: `/admin` command.
*   **Actions**:
    *   **Dispatch**:
        *   View a list of active suppliers.
        *   For each supplier, view items currently assigned to them or pending dispatch.
        *   Perform actions on individual items within a supplier's order: "Change Quantity", "Remove Item", "Set Alternative Supplier", "Assign to Different Supplier".
        *   (Future) Mark a supplier order as "Dispatched" or "Received".
    *   **Items**:
        *   Search for items (e.g., by SKU or name).
        *   View detailed properties of an item.
        *   Edit item properties by sending a JSON snippet.
        *   Add new items.
    *   **Bot Editor**:
        *   View and edit the raw JSON content of `items.json`, `categories.json`, `suppliers.json`.
        *   View and edit the raw JSON content of `layouts.json`.
        *   View and edit the raw text content of template files (`template_kitchen.txt`, etc.).
        *   Use inline query mode to select an item/category/supplier and receive its JSON snippet for editing.
    *   **CSV**:
        *   Export `items.csv`, `categories.csv`, `suppliers.csv`.
        *   Import `items.csv`, `categories.csv`, `suppliers.csv` by uploading a document.
    *   Manage custom item requests (approve/reject).
    *   Restore data files from backups.
*   **Inline Menu/Buttons**:
    *   New `adminMenuKeyboard`: "Dispatch", "Items", "Bot Editor", "CSV".
    *   Specific inline keyboards for supplier selection, item actions, file actions (export/import/edit/share/restore), and template editing.
*   **Reply Keyboards**: None specific, but `remove_keyboard` will be used when prompting for text/JSON input.
*   **Inline Mode Rules**: Can use inline mode for item search and adding to order.

### 2.6. Supplier

*   **Chat Type**: Group chat (Supplier Chat ID - `SUPPLIER_CHAT_ID`).
*   **Actions**:
    *   (Future) Receive consolidated order requests from the bot, formatted using `supplier_request_template`.
    *   (Future) Confirm receipt of an order.
    *   (Future) Update availability or status of specific items within an order.
*   **Inline Menu/Buttons**: (Future) "Confirm Order", "Item Out of Stock", "Suggest Alternative".
*   **Reply Keyboards**: None specific.

## 3. Order Object Lifecycle & State Transitions

The lifecycle of an order will involve several stages, with the `Order` object's `status` attribute being key to tracking its progress.

1.  **Initiation (User)**:
    *   User adds items via categories or inline search. These are initially stored in temporary `kitchenOrder` or `barOrder` in-memory maps.
    *   (Future) User explicitly "submits" their temporary order, which then creates a formal `Order` object with `status: 'pending_user_confirmation'`.

2.  **Consolidation & Review (Manager/Admin)**:
    *   (Future) A manager or admin triggers a "consolidate orders" action. This aggregates all temporary `kitchenOrder` and `barOrder` items into a new `Order` object.
    *   The `Order` object's status transitions to `status: 'pending_manager_review'`.
    *   Manager reviews the order, potentially adjusting quantities, assigning suppliers, or approving custom items.

3.  **Supplier Dispatch (Admin)**:
    *   Admin uses the "Dispatch" menu to review items assigned to specific suppliers.
    *   Admin can manually trigger sending a consolidated order to a supplier.
    *   The `Order` object's status (or individual item statuses) transitions to `status: 'dispatched_to_supplier'`.
    *   The bot sends a formatted message to `SUPPLIER_CHAT_ID` using `supplier_request_template`.

4.  **Supplier Interaction (Supplier)**:
    *   (Future) Supplier receives the order message.
    *   (Future) Supplier uses inline buttons to `status: 'received_by_supplier'` or mark items as 'out_of_stock'.

5.  **Completion (Manager/Admin)**:
    *   Once all items are received and confirmed, the manager/admin marks the `Order` as `status: 'completed'`.
    *   The `manager_processing` command will show orders in various 'pending' or 'dispatched' states, allowing managers to track and complete them.

6.  **Cancellation**:
    *   An order can be cancelled at various stages by an admin or manager, transitioning its status to `status: 'cancelled'`.

## 4. Technical Considerations

*   **Persistence**: The current `kitchenOrder` and `barOrder` are in-memory. For a robust system, these temporary orders, and especially the formal `Order` objects, need persistent storage. For now, we will continue using JSON files for simplicity, but a database (like Supabase) would be ideal for scalability and complex queries.
*   **Session Management**: For multi-step admin actions (e.g., "Set Qty" where the bot expects a numerical input), a user-specific session or context variable will be implemented to track the state of the conversation.
*   **Error Handling**: Implement comprehensive try-catch blocks and user-friendly error messages for file operations, API calls, and invalid user input.
*   **Data Integrity**: Ensure that modifications to CSV and JSON files (especially through admin commands) maintain data consistency and prevent corruption. Backup mechanisms are already in place and will be utilized.
*   **Dynamic Keyboard Generation**: Continue using `InlineKeyboard` and `Keyboard` for dynamic menu generation based on data and user context.
*   **File Structure**: Maintain the `data/` directory for all static and dynamic data files.
