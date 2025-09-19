# KALI Easy Order Bot - Detailed Plan of Execution

This document outlines the detailed plan for the KALI Easy Order Bot development, focusing on the admin flow refactor, the conceptual "Order" object and its lifecycle, and explicit role-based interactions.

## 1. Core Concepts

### 1.1. The "Order" Object (Conceptual Definition)

The "Order" object is envisioned as the central, dynamic entity that flows through the system. It adapts its behavior and status based on contextual elements, user roles, and predefined rules. The order status is inherent from actions, and flow progression steps are consolidated via topics.

**Attributes:**

*   `order_id`: Unique identifier for the entire order (e.g., UUID or timestamp-based).
*   `status`: Current state of the order.
    *   `open`: User adds items.
    *   `dispatching`: Manager approves items, forwarded to Dispatcher Topic.
    *   `processing`: Dispatcher approves supplier orders, forwarded for manager verification.
    *   `completed`: Manager controls received goods and payment.
    *   `archived`: (Future) For CRM record.
*   `items`: An array of ordered items. Each item within this array could have:
    *   `item_sku`: Unique identifier for the item.
    *   `item_name`: Name of the item.
    *   `quantity`: Ordered quantity.
    *   `measure_unit`: Unit of measurement.
    *   `assigned_supplier`: The supplier ultimately responsible for this item.
    *   `alternative_supplier`: An alternative supplier if the default is unavailable.
    *   `item_status`: (Enabled, Disabled) This status is derived from the item's own attributes, not the order object.
*   `created_by_user_name`: Telegram User Name of the person who initiated the order.
*   `created_at`: Timestamp of order creation (dd.mm.yy HH:mm).
*   `last_updated_at`: Timestamp of the last status change or modification.
*   `order_type`: (e.g., 'kitchen', 'bar'). This indicates which department the order primarily concerns.
*   `telegram_message_id`: The message ID of the initial order message in the relevant topic/group.
*   `telegram_thread_id`: The message thread ID (topic ID) where the order was posted.
*   `payment_status`: `pending` by default. Set as `paid by cash` or `paid by qr` by manager on order reception.

### 1.2. Order Flow Philosophy

The Order object is the main flowing element. Its `status` dictates the available actions and its visibility to different roles. Contextual elements (time, role, item properties, supplier availability) influence its behavior and trigger state transitions. The bot's logic will primarily revolve around updating and reacting to changes in this Order object.

**Consolidated Flow Summary:**
User adds items (`open` status) -> Manager approves (`dispatching` status) -> Dispatcher reports to group (`processing` status) -> Manager controls received goods and payment (`completed` status).

**Future Bot (Extended Flow):**
This includes new roles (supplier, boss-admin), new statuses (ETA status, processing sub status, order placed, payment status), and extended functions (stock count requests, urgent status, assign to driver team, basic item management, automated dispatch, CSV/web interface for basic CRM integration).

**Advanced Features:**
More control for managers with bot assistance for automated tasks, editing core files and message type layouts from the bot (boss admin), full access to the web interface, services status monitoring, and 3rd party integration (add-ons).

**Bot Add-ons (Conceptual):**
Google Sheet sync, delivery tracking bot, food menu online ordering bot, Loyverse integration, printer cloud server, service monitoring status, SAAS solution - B2B.

## 2. Explicit Flow by Roles

This section details the interactions, menus, and rules for each user role within the bot.

### 2.1. User (Customer/Staff Placing Order)

*   **Chat Type**: Private chat with bot, Group chat (via inline mode).
*   **Entry Points**:
    *   `/start` command in private chat, initiating an ordering flow using inline buttons.
    *   `@botname <query>` in any chat for inline search. If initialized from the kitchen topic, display the order list at the top (bot returns a message with all ordered kitchen items, then displays tag categories, e.g., shortcut placeholder tag 1, tag 2, tag 3). Start typing numbers to display kitchen categories, then space (if '1' is typed, it shows all cleaning for kitchen items; if the number is not found or text is typed, it will display all kitchen items).
*   **Actions**:
    *   Initiate order by selecting "Kitchen" or "Bar" from `/start` menu.
    *   Browse categories and items.
    *   Add items to a shared, temporary order (`kitchenOrder` or `barOrder`).
    *   View current items and quantities in their temporary "Kitchen Order" or "Bar Order" via reply keyboard buttons.
    *   Initiate a "Custom" item request (bot prompts for a picture, then item name (text), then quantity (number); this request is sent to the **Manager Topic** for approval. On manager approval, it is then forwarded to the dispatcher topic by the bot).
    *   Search for items using inline mode (via the "Search" button from the keyboard).
*   **Inline Menu/Buttons**:
    *   `startKeyboard`: "Kitchen", "Bar", "Search".
    *   `catsKeyboard`: List of categories for Kitchen/Bar (sub-categories first: Drinks, Ingredients, Households).
    *   `itemsKeyboard`: List of items within a category (sub-categories first: Fresh, Frozen, Condiments, Plastics).
    *   "Add to order" button in inline query results: Items should be added directly on item click, whether from inline mode or an inline button item.
*   **Reply Keyboards**:
    *   `buildReplyKeyboard()`: Dynamically shows "Kitch Order (X)", "Bar Order (Y)", "Custom". "Go Back", "Categories", and "Search" should be inline buttons at the bottom of the list, not reply keyboard buttons.
*   **Inline Mode Rules**:
    *   Users can search for items.
    *   The "Add to order" button in inline results should always be active.

### 2.2. Kitchen Staff

*   **Chat Type**: Group chat (Kitchen Topic - `GROUP_CHAT_ID` with `KITCHEN_TOPIC_ID`).
*   **Actions**:
    *   Receive notifications when items are added to the kitchen order (no bot messages as notifications, only tiny toast at the top of the screen).
    *   (Future) View a consolidated list of pending kitchen orders (template needs to be defined ASAP).
    *   (Future) Mark individual items or entire orders as "prepared" or "completed" (status can be set now, inherent from dispatcher and manager actions).
*   **Inline Menu/Buttons**: (Future) "Mark Prepared", "Request Clarification" (can be set now).
*   **Reply Keyboards**: None specific for their role in the Kitchen Topic.

### 2.3. Bar Staff

*   **Chat Type**: Group chat (Bar Topic - `GROUP_CHAT_ID` with `BAR_TOPIC_ID`).
*   **Actions**:
    *   Receive notifications when items are added to the bar order (no bot messages as notifications, only tiny toast at the top of the screen).
    *   (Future) View a consolidated list of pending bar orders (template needs to be defined ASAP).
    *   (Future) Mark individual items or entire orders as "prepared" or "completed" (status can be set now, inherent from dispatcher and manager actions).
*   **Inline Menu/Buttons**: (Future) "Mark Prepared", "Request Clarification" (can be set now).
*   **Reply Keyboards**: None specific for their role in the Bar Topic.

### 2.4. Manager

*   **Chat Type**: Private chat with bot, Group chat (Manager Topic - `GROUP_CHAT_ID` with `MANAGER_TOPIC_ID`).
*   **Entry Points**:
    *   `/manager` command in private chat (or `/<manager name>` to be set later).
    *   `/manager_processing` command in private chat (to be defined later).
*   **Actions**:
    *   Access the main Admin Menu via `/manager`.
    *   Review custom item requests forwarded from users (in Dispatcher Topic).
    *   (Future) View all pending orders across Kitchen/Bar/Suppliers.
    *   (Future) Approve/Reject orders or specific items within an order.
    *   (Future) Change the status of an order (e.g., from 'pending_review' to 'dispatched').
*   **Inline Menu/Buttons**: `adminMenuKeyboard`, `layoutsMenu`, (Future) "Approve Custom Item", "Reject Custom Item", "Mark Order Complete".
*   **Reply Keyboards**: None specific.

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
*   **Admin Messages**: When admin sends a tagged message, the bot attaches ✅❌ buttons and sends a copy to either the manager or dispatcher topic. No notification bot messages; messages sent by the user via the bot are private. All messages sent across the group are silent, except admin requests.

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
*   **Topic IDs**: Need to set all topic IDs: KITCHEN, BAR, MANAGER, DISPATCHER, PROCESSING, COMPLETED, ADMIN.
