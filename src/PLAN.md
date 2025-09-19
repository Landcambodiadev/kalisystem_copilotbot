# KALI Easy Order Bot - Development Plan

## Versioning Strategy

This plan outlines the development of the KALI Easy Order Bot in distinct versions to manage complexity and provide a clear roadmap.

*   **V1: Original Implementation**: The existing `src/kali_order_bot.ts` with basic user flow, admin file management, and placeholder order processing functions.
*   **V2: Core Order Flow (Current Target)**: Clean implementation in `src/v2.ts` focusing on the order object lifecycle with manager/dispatcher roles. Removes all admin file management UI.
*   **V3: Advanced Features (Future)**: Will reintroduce advanced admin features, file manipulation UI, external integrations, and comprehensive automation.

---

## V1: Original Implementation

The original `src/kali_order_bot.ts` includes:
- Basic user ordering flow (categories, items, add to order)
- Admin file management (CSV/JSON editing, templates)
- Placeholder functions for order processing
- Inline search functionality
- Custom item requests

This version serves as the baseline and remains unchanged for reference.

---

## V2: Core Order Flow (Current Implementation)

### Overview

V2 implements the core order object lifecycle as the principal actor flowing through topics. This version focuses exclusively on the order processing workflow while maintaining essential user interaction features.

### Core Flow Philosophy

**Order Status Inherent from Actions - Flow Progression Steps Consolidated via Topics**

The order flows through the following stages:

1. **KITCHEN/BAR (User)**: User adds items via `/start` command and category selection. Only chosen items are posted to the topic (category emoji + item name). Bot forwards message to MANAGER TOPIC for approval with `<item name> ✅❌` buttons.
   - **Status**: `Open Order`

2. **MANAGER (Manager Action Only)**: Approved items are forwarded by bot to DISPATCHER TOPIC as consolidated order message sorted by supplier for review with `<<supplier name>> - <item list> ✅❌` buttons. Original items are removed from manager topic.
   - **Message Layout**:
     ```
     <<supplier name>>
     <item> <default quantity>
     •
     •
     •
     •
     <datestamp>
     ```
   - **Status**: `Dispatching Order`

3. **DISPATCHER (Dispatcher Action Only)**: Approved supplier orders are forwarded to processing (removing original) by bot as polls for manager verification on reception.
   - **Poll Layout**:
     - **Question**: "Confirm receipt of items from [Supplier Name] - [Date Stamp]?"
     - **Options**: Each item from dispatcher's list
     - **Type**: Multiple answers allowed
   - **Status**: `Processing Order`

4. **PROCESSING (Manager Action Only)**: When all poll items are checked, bot forwards poll as consolidated message to COMPLETED TOPIC for CRM record with same message format + "COMPLETED!" title and CRM button.
   - **Status**: `Completed Order`

5. **COMPLETED (Manager Action Only)**: Flow requirements fulfilled. Optional CRM update step for future implementation.
   - **Status**: `Archived Order`

6. **ADMIN**: Admin can post tagged messages. Bot attaches `✅❌` buttons and sends copy to manager or dispatcher topic.

### Key Features Removed from V1

- All admin file management UI (`/admin`, file editing, CSV/JSON manipulation interfaces)
- `ADMIN_USER_ID` checks for file management
- Complex supplier order management
- Template editing interfaces
- File import/export handlers

### Key Features Retained from V1

- User ordering flow (`/start`, categories, items, add to order)
- Inline search functionality
- Custom item requests (now routed to manager topic)
- Basic data loading functions (backend file access)
- Bot configuration and error handling

### Technical Implementation

**Topic IDs**:
- KITCHEN: `5`
- BAR: `14`
- MANAGER: `120`
- DISPATCHER: `118`
- PROCESSING: `190`
- COMPLETED: `192`
- ADMIN: `188`

**Data Storage**: 
- Temporary in-memory tracking for order flow states
- JSON file reading for items, categories, suppliers
- No file manipulation UI (deferred to V3)

**Order Flow Tracking**:
- `pendingApprovals`: Manager approval tracking
- `pendingDispatch`: Dispatcher review tracking
- `pendingPolls`: Processing completion tracking

### User Roles (V2)

1. **User**: Places orders, receives approval notifications
2. **Manager**: Approves/rejects items, confirms receipt via polls
3. **Dispatcher**: Reviews and approves supplier orders
4. **Admin**: Posts tagged messages for approval

---

## V3: Advanced Features (Future Implementation)

### Planned Features

**Advanced Admin Functions**:
- File manipulation UI restoration
- Bulk editing capabilities
- Template management interfaces
- Advanced supplier management

**Extended Order Management**:
- Complex order status tracking
- Payment status integration
- ETA management
- Driver assignment

**External Integrations**:
- Google Sheets sync
- Loyverse integration
- Delivery tracking
- CRM system integration

**Automation Features**:
- Automated dispatch
- Stock count requests
- Service monitoring
- Web interface

### Bot Add-ons (V3 Conceptual)

- Google Sheet sync (Google Drive API - incremental backups, database reference, price lists)
- Delivery tracking bot (live map features)
- Food menu online ordering bot (seamless 1-click registration with Telegram)
- Loyverse integration (custom app for full API requests and automated report backup)
- Printer cloud server (bot concept to order from printer)
- Service monitoring status (Prometheus, Grafana)
- SAAS solution - B2B

---

## Development Notes

**V2 Focus**: Clean, functional order flow with clear role separation and status progression.

**V3 Preparation**: V2's clean architecture will make it easier to reintroduce advanced features without the complexity of the original V1 codebase.

**File Access**: Backend file reading capabilities are maintained in V2 for data loading, but UI for file manipulation is removed until V3.