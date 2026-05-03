# Land Management System - Complete Documentation

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture & Tech Stack](#architecture--tech-stack)
3. [Database Schema](#database-schema)
4. [Project Structure](#project-structure)
5. [Pages & Components](#pages--components)
6. [Key Features & Functionalities](#key-features--functionalities)
7. [Naming Conventions](#naming-conventions)
8. [Utilities & Helper Functions](#utilities--helper-functions)
9. [Workflows](#workflows)
10. [State Management](#state-management)
11. [UI Components](#ui-components)
12. [Environment Setup](#environment-setup)
13. [Future Enhancements](#future-enhancements)
14. [Development Guide](#development-guide)

---

## Overview

This is a comprehensive **Land Management System** (نظام إدارة الأراضي) built for managing land batches, pieces, clients, sales, and financial tracking. The system supports both Arabic and English interfaces, with Tunisian Dinar (DT) as the currency.

### Main Purpose
- Manage land batches with pricing configurations
- Track individual land pieces within batches
- Handle client information and sales
- Process sales with full payment or installment options
- Track deposits and financial income
- Manage sales confirmation workflow

---

## Architecture & Tech Stack

### Frontend
- **Framework**: React 19.2.0 (Functional Components + Hooks)
- **Language**: TypeScript 5.9.3
- **Styling**: Tailwind CSS 3.4.19
- **Build Tool**: Vite 7.2.4
- **State Management**: React Hooks (`useState`, `useEffect`, `useMemo`)

### Backend
- **Database**: Supabase (PostgreSQL)
- **API**: Supabase JavaScript Client
- **Authentication**: Supabase Auth (configured but RLS disabled)

### Key Libraries
```json
{
  "@supabase/supabase-js": "^2.90.1",
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "tailwindcss": "^3.4.19"
}
```

---

## Database Schema

### Tables Overview

#### 1. `clients`
Stores client information.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `id_number` | VARCHAR(8) | Unique client ID number |
| `name` | VARCHAR(255) | Client name |
| `phone` | VARCHAR(50) | Phone number |
| `email` | VARCHAR(255) | Email (optional) |
| `address` | TEXT | Address (optional) |
| `notes` | TEXT | Additional notes |
| `type` | VARCHAR(20) | 'individual' or 'company' |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Indexes**: `id_number`, `type`

---

#### 2. `land_batches`
Stores land batch information with pricing.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Batch name (e.g., "مطار 1") |
| `location` | VARCHAR(255) | Location |
| `title_reference` | VARCHAR(255) | Title/deed reference |
| `price_per_m2_cash` | DECIMAL(15,2) | Price per m² for full payment |
| `company_fee_percent_cash` | DECIMAL(5,2) | Company fee percentage |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Indexes**: `name`

---

#### 3. `land_pieces`
Stores individual land pieces within batches.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `batch_id` | UUID | Foreign key to `land_batches` |
| `piece_number` | VARCHAR(50) | Piece identifier (e.g., "LOT-001") |
| `surface_m2` | DECIMAL(10,2) | Surface area in m² |
| `notes` | TEXT | Optional notes |
| `direct_full_payment_price` | DECIMAL(15,2) | Direct price (optional, deprecated) |
| `status` | VARCHAR(20) | 'Available', 'Reserved', or 'Sold' |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Indexes**: `batch_id`, `status`, `piece_number`
**Unique Constraint**: `(batch_id, piece_number)`

---

#### 4. `payment_offers`
Stores payment offers for batches or pieces (installment plans).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `batch_id` | UUID | Foreign key to `land_batches` (nullable) |
| `land_piece_id` | UUID | Foreign key to `land_pieces` (nullable) |
| `name` | VARCHAR(255) | Offer name (optional) |
| `price_per_m2_installment` | DECIMAL(15,2) | Installment price per m² |
| `company_fee_percent` | DECIMAL(5,2) | Company fee percentage |
| `advance_mode` | VARCHAR(20) | 'fixed' or 'percent' |
| `advance_value` | DECIMAL(15,2) | Advance payment amount/percentage |
| `calc_mode` | VARCHAR(20) | 'monthlyAmount' or 'months' |
| `monthly_amount` | DECIMAL(15,2) | Monthly payment (if calc_mode = 'monthlyAmount') |
| `months` | INTEGER | Number of months (if calc_mode = 'months') |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Indexes**: `batch_id`, `land_piece_id`
**Constraint**: Either `batch_id` or `land_piece_id` must be set, not both

---

#### 5. `sales`
Stores sales records.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `client_id` | UUID | Foreign key to `clients` |
| `land_piece_id` | UUID | Foreign key to `land_pieces` |
| `batch_id` | UUID | Foreign key to `land_batches` |
| `payment_offer_id` | UUID | Foreign key to `payment_offers` (nullable) |
| `sale_price` | DECIMAL(15,2) | Total sale price |
| `deposit_amount` | DECIMAL(15,2) | Deposit amount (العربون) |
| `sale_date` | DATE | Sale date |
| `status` | VARCHAR(20) | 'pending', 'completed', or 'cancelled' |
| `notes` | TEXT | Additional notes |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Indexes**: `client_id`, `land_piece_id`, `batch_id`, `status`

---

## Project Structure

```
FULLDEV-V2/
├── src/
│   ├── App.tsx                    # Main app entry, routing logic
│   ├── main.tsx                   # React app initialization
│   ├── index.css                  # Global styles
│   ├── lib/
│   │   └── supabase.ts            # Supabase client configuration
│   ├── pages/
│   │   ├── Land.tsx               # Land batches management page
│   │   ├── Clients.tsx            # Clients management page
│   │   ├── Confirmation.tsx       # Sales confirmation page
│   │   └── Finance.tsx            # Financial tracking page
│   ├── components/
│   │   ├── Layout.tsx             # Main layout wrapper (sidebar + content)
│   │   ├── Sidebar.tsx            # Navigation sidebar
│   │   ├── PieceDialog.tsx        # Dialog for managing pieces in a batch
│   │   ├── SaleDialog.tsx         # Dialog for client lookup/creation
│   │   ├── SaleDetailsDialog.tsx  # Dialog for sale details and finalization
│   │   ├── PaymentBreakdown.tsx   # Payment calculation display component
│   │   ├── PiecePriceDetails.tsx  # Piece price information component
│   │   └── ui/                    # Reusable UI components
│   │       ├── button.tsx
│   │       ├── input.tsx
│   │       ├── dialog.tsx
│   │       ├── card.tsx
│   │       ├── badge.tsx
│   │       ├── alert.tsx
│   │       ├── select.tsx
│   │       ├── textarea.tsx
│   │       ├── label.tsx
│   │       ├── tabs.tsx
│   │       ├── confirm-dialog.tsx
│   │       ├── icon-button.tsx
│   │       └── divider.tsx
│   └── utils/
│       ├── priceCalculator.ts     # Price calculation utilities
│       └── installmentCalculator.ts # Installment calculation utilities
├── database_schema.sql            # Complete database schema
├── clean_database_setup.sql       # Clean database with test data
├── package.json                   # Dependencies and scripts
├── vite.config.ts                 # Vite configuration
├── tailwind.config.js             # Tailwind CSS configuration
└── tsconfig.json                  # TypeScript configuration
```

---

## Pages & Components

### 1. **Land Page** (`src/pages/Land.tsx`)

**Purpose**: Main page for managing land batches, pieces, and sales.

**Key Features**:
- List all land batches in a grid layout
- Create/edit batches with pricing and installment offers
- View pieces within a batch
- Initiate sales process for pieces

**Key State Variables**:
- `batches`: `LandBatch[]` - List of all batches
- `dialogOpen`: `boolean` - Create/edit batch dialog state
- `pieceDialogOpen`: `boolean` - Piece management dialog state
- `saleDialogOpen`: `boolean` - Sale dialog state
- `saleDetailsDialogOpen`: `boolean` - Sale details dialog state
- `selectedBatchForPieces`: `{id, name, pricePerM2}` - Currently selected batch
- `selectedPieceForSale`: `LandPiece` - Piece being sold
- `selectedClientForSale`: `Client` - Client for sale

**Key Functions**:
- `loadBatches()`: Load all batches from database
- `openPiecesDialog(batchId)`: Open piece management for a batch
- `handleSaleClick(piece)`: Initiate sale process
- `handleFinalizeSale(saleData)`: Complete sale and create record

---

### 2. **Clients Page** (`src/pages/Clients.tsx`)

**Purpose**: Manage client information with pagination.

**Key Features**:
- List clients with pagination (20 per page)
- Create/edit/delete clients
- View client statistics (total, with sales, individuals, companies)
- Client lookup by ID number

**Key State Variables**:
- `clients`: `Client[]` - List of clients (paginated)
- `currentPage`: `number` - Current page number
- `totalCount`: `number` - Total number of clients
- `stats`: `ClientStats` - Client statistics
- `dialogOpen`: `boolean` - Create/edit dialog state

**Key Functions**:
- `loadClients()`: Load paginated clients
- `loadStats()`: Load client statistics
- `handleSaveClient()`: Save new or update existing client
- `validateForm()`: Validate client form data

---

### 3. **Confirmation Page** (`src/pages/Confirmation.tsx`)

**Purpose**: Review and confirm/reject pending sales.

**Key Features**:
- List all pending sales
- Display client, piece, and sale details
- Confirm sale (status → 'completed', piece status → 'Sold')
- Reject sale (status → 'cancelled', piece status → 'Available')

**Key State Variables**:
- `sales`: `Sale[]` - List of pending sales
- `confirmDialogOpen`: `boolean` - Confirm dialog state
- `rejectDialogOpen`: `boolean` - Reject dialog state
- `selectedSale`: `Sale | null` - Sale being processed

**Key Functions**:
- `loadPendingSales()`: Load sales with status 'pending'
- `handleConfirmSale()`: Confirm sale and update statuses
- `handleRejectSale()`: Reject sale and revert piece status

---

### 4. **Finance Page** (`src/pages/Finance.tsx`)

**Purpose**: Track financial income and deposits.

**Key Features**:
- Display total deposits, completed sales, pending sales
- Calculate total income
- List all sales with financial details

**Key State Variables**:
- `sales`: `Sale[]` - All sales records
- `stats`: `{totalDeposits, totalCompletedSales, totalPendingSales, totalIncome}`

**Key Functions**:
- `loadSales()`: Load all sales and calculate statistics

---

### 5. **PieceDialog Component** (`src/components/PieceDialog.tsx`)

**Purpose**: Manage pieces within a specific batch.

**Key Features**:
- Display all pieces in a batch
- Add new pieces (collapsible form)
- Show piece details with status badges
- "Sale" button for each piece

**Props**:
```typescript
interface PieceDialogProps {
  open: boolean
  onClose: () => void
  batchId: string
  batchName: string
  batchPricePerM2: number | null
  onPieceAdded: () => void
  onSaleClick?: (piece: LandPiece) => void
}
```

**Key State Variables**:
- `pieces`: `LandPiece[]` - List of pieces
- `showAddForm`: `boolean` - Toggle add piece form visibility

---

### 6. **SaleDialog Component** (`src/components/SaleDialog.tsx`)

**Purpose**: Handle client lookup and creation for sales.

**Key Features**:
- Step 1: Lookup client by ID number
- Step 2: Create new client if not found (or edit existing)
- Step 3: Confirm client ready and proceed to sale details

**Props**:
```typescript
interface SaleDialogProps {
  open: boolean
  onClose: () => void
  piece: LandPiece
  batchName: string
  onSaleComplete: () => void
  onClientReady: (client: Client) => void
}
```

**Key State Variables**:
- `step`: `'lookup' | 'create' | 'ready'` - Current step
- `clientId`: `string` - Client ID number for lookup
- `client`: `Client | null` - Found or created client

**Key Functions**:
- `lookupClient()`: Search for client by ID number
- `saveClient()`: Create or update client

---

### 7. **SaleDetailsDialog Component** (`src/components/SaleDetailsDialog.tsx`)

**Purpose**: Finalize sale with payment details and calculations.

**Key Features**:
- Select payment type (full payment or installment)
- Select installment offer (if applicable)
- Enter deposit amount (العربون)
- Real-time calculation display
- Set deadline date and notes

**Props**:
```typescript
interface SaleDetailsDialogProps {
  open: boolean
  onClose: () => void
  piece: LandPiece
  client: Client
  batchName: string
  batchPricePerM2: number | null
  batchCompanyFeePercent: number | null
  onFinalize: (saleData) => void
}
```

**Key State Variables**:
- `paymentType`: `'full' | 'installment'` - Payment type
- `selectedOfferId`: `string` - Selected installment offer
- `depositAmount`: `string` - Deposit amount input
- `deadlineDate`: `string` - Sale deadline date
- `calculations`: `useMemo` - Real-time calculations

**Key Functions**:
- `loadPaymentOffers()`: Load installment offers for batch
- `handleSubmit()`: Finalize sale and call `onFinalize`

---

## Key Features & Functionalities

### 1. **Land Batch Management**
- Create batches with name, location, title reference
- Set full payment pricing (price per m², company fee %)
- Add multiple installment offers per batch
- Edit/delete batches with confirmation

### 2. **Piece Management**
- Add pieces to batches with piece number, surface area
- View all pieces with status (Available/Reserved/Sold)
- Collapsible add form for better UX

### 3. **Client Management**
- Create clients with ID number (8 digits), name, phone, email, address, notes, type (individual/company)
- Edit/delete clients
- Pagination for large client lists
- Statistics dashboard

### 4. **Sales Workflow**
```
1. Click batch → View pieces
2. Click "Sale" button on piece
3. SaleDialog: Lookup client by ID → Create if needed
4. SaleDetailsDialog: Select payment type → Enter deposit → Finalize
5. Sale created with status 'pending'
6. Piece status → 'Reserved'
```

### 5. **Payment Calculations**
- **Full Payment**: `(surface_m2 × price_per_m2) - company_fee - deposit`
- **Installment**: Base price, advance, remaining, monthly payment, number of months
- Real-time calculation updates as user inputs change

### 6. **Sales Confirmation**
- Review pending sales in Confirmation page
- Confirm: Sale status → 'completed', Piece → 'Sold'
- Reject: Sale status → 'cancelled', Piece → 'Available'

### 7. **Financial Tracking**
- Total deposits collected
- Total completed sales
- Total pending sales (deposits)
- Total income calculation

---

## Naming Conventions

### Variables & Functions

#### **State Variables**
- Use descriptive names with prefixes:
  - `loading*` for loading states: `loading`, `loadingPieces`, `loadingOffers`
  - `*DialogOpen` for dialog visibility: `dialogOpen`, `saleDialogOpen`
  - `selected*` for selected items: `selectedBatch`, `selectedPiece`, `selectedClient`
  - `editing*` for editing states: `editingBatchId`, `editingClientId`
  - `*Error` for error messages: `error`, `listError`
  - `*Success` for success messages: `success`

#### **Functions**
- Use camelCase with verb prefixes:
  - `load*`: `loadBatches()`, `loadClients()`, `loadPieces()`
  - `handle*`: `handleSaveBatch()`, `handleDeleteClient()`, `handleSaleClick()`
  - `open*`: `openCreateDialog()`, `openEditDialog()`, `openPiecesDialog()`
  - `reset*`: `resetForm()`
  - `validate*`: `validateForm()`

#### **Database Columns**
- Use snake_case: `id_number`, `surface_m2`, `price_per_m2_cash`, `company_fee_percent_cash`
- Timestamps: `created_at`, `updated_at`

#### **TypeScript Types/Interfaces**
- Use PascalCase: `LandBatch`, `LandPiece`, `Client`, `Sale`
- Props interfaces: `*Props` suffix: `PieceDialogProps`, `SaleDialogProps`

#### **Component Files**
- Use PascalCase: `Land.tsx`, `Clients.tsx`, `PieceDialog.tsx`, `SaleDialog.tsx`

#### **Utility Functions**
- Use camelCase: `calculatePiecePrice()`, `formatPrice()`, `calculateInstallment()`

---

## Utilities & Helper Functions

### 1. **Price Calculator** (`src/utils/priceCalculator.ts`)

#### `calculatePiecePrice(inputs: PriceCalculationInputs): PriceCalculationResult`

Calculates piece price with priority: **Installment > Batch > Piece Direct**

**Parameters**:
```typescript
{
  surfaceM2: number
  batchPricePerM2: number | null
  pieceDirectPrice: number | null
  installmentPricePerM2?: number | null
  depositAmount?: number
}
```

**Returns**:
```typescript
{
  basePrice: number
  totalPrice: number
  deposit: number
  totalDue: number
  priceSource: 'batch' | 'piece' | 'installment'
}
```

**Usage**:
```typescript
const result = calculatePiecePrice({
  surfaceM2: 500,
  batchPricePerM2: 7,
  pieceDirectPrice: null,
  installmentPricePerM2: null,
  depositAmount: 500
})
```

#### `formatPrice(amount: number): string`

Formats number as Tunisian Dinar with 2 decimal places.

**Usage**:
```typescript
formatPrice(3500.50) // "3,500.50"
```

---

### 2. **Installment Calculator** (`src/utils/installmentCalculator.ts`)

#### `calculateInstallment(surfaceM2: number, offer: InstallmentOffer): InstallmentCalculationResult`

Calculates installment payment breakdown.

**Parameters**:
```typescript
{
  price_per_m2_installment: number
  advance_mode: 'fixed' | 'percent'
  advance_value: number
  calc_mode: 'monthlyAmount' | 'months'
  monthly_amount: number | null
  months: number | null
}
```

**Returns**:
```typescript
{
  basePrice: number
  advanceAmount: number
  remainingAmount: number
  monthlyPayment: number
  numberOfMonths: number
}
```

**Usage**:
```typescript
const calc = calculateInstallment(450, {
  price_per_m2_installment: 9,
  advance_mode: 'fixed',
  advance_value: 1000,
  calc_mode: 'months',
  months: 24,
  monthly_amount: null
})
```

---

## Workflows

### **Workflow 1: Creating a Land Batch**

1. Navigate to "دفعات الأراضي" page
2. Click "+ دفعة جديدة"
3. Fill in basic info (name, location, title reference)
4. Set full payment pricing (price per m², company fee %)
5. Add installment offers (optional)
6. Click "حفظ الدفعة"

**Database Actions**:
- Insert into `land_batches`
- Insert into `payment_offers` (if offers added)

---

### **Workflow 2: Adding Pieces to a Batch**

1. Click on a batch card
2. `PieceDialog` opens
3. Click toggle button to show "Add Piece" form
4. Fill in piece number, surface area, optional direct price, notes, status
5. Click "+ إضافة القطعة"
6. Form auto-hides after success

**Database Actions**:
- Insert into `land_pieces`

---

### **Workflow 3: Selling a Piece**

1. Click on batch → `PieceDialog` opens
2. Click "Sale" button on a piece
3. `SaleDialog` opens:
   - Enter client ID number → Lookup
   - If found: Auto-fill client data → Click "متابعة للتفاصيل"
   - If not found: Create client form → Save → Click "متابعة للتفاصيل"
4. `SaleDetailsDialog` opens:
   - Select payment type (full/installment)
   - If installment: Select offer
   - Enter deposit amount (العربون)
   - Review calculations (real-time)
   - Set deadline date
   - Add notes (optional)
   - Click "إنشاء البيع"
5. Sale created with status 'pending'
6. Piece status → 'Reserved'

**Database Actions**:
- Insert/update into `clients` (if new client)
- Insert into `sales` (status: 'pending')
- Update `land_pieces` (status: 'Reserved')

---

### **Workflow 4: Confirming a Sale**

1. Navigate to "التأكيدات" page
2. Review pending sales list
3. Click "✅ تأكيد البيع" or "❌ رفض البيع"
4. Confirm action in dialog
5. If confirmed:
   - Sale status → 'completed'
   - Piece status → 'Sold'
6. If rejected:
   - Sale status → 'cancelled'
   - Piece status → 'Available'

**Database Actions**:
- Update `sales` (status)
- Update `land_pieces` (status)

---

## State Management

The application uses **React Hooks** for state management. No external state management library.

### **Pattern Used**:
- **Local State**: `useState` for component-specific state
- **Computed Values**: `useMemo` for expensive calculations
- **Side Effects**: `useEffect` for data loading and cleanup

### **Example**:
```typescript
const [batches, setBatches] = useState<LandBatch[]>([])
const [loading, setLoading] = useState(true)

useEffect(() => {
  loadBatches()
}, [])

const calculations = useMemo(() => {
  // Expensive calculation
  return calculatePiecePrice(...)
}, [dependencies])
```

---

## UI Components

All UI components are located in `src/components/ui/`. They are styled with Tailwind CSS and follow a consistent design system.

### **Available Components**:
- `Button` - Primary, secondary, danger variants
- `Input` - Text input fields
- `Dialog` - Modal dialogs
- `Card` - Content containers
- `Badge` - Status indicators (success, warning, info, default, danger)
- `Alert` - Error/success messages
- `Select` - Dropdown selects
- `Textarea` - Multi-line text input
- `Label` - Form labels
- `Tabs` - Tab navigation
- `ConfirmDialog` - Confirmation dialogs
- `IconButton` - Icon-only buttons
- `Divider` - Section dividers

### **Usage Example**:
```typescript
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

<Dialog open={open} onClose={onClose} title="Title" size="md">
  <Button onClick={handleSave}>Save</Button>
</Dialog>
```

---

## Environment Setup

### **Required Environment Variables**

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### **Installation**

```bash
npm install
```

### **Development**

```bash
npm run dev
```

### **Build**

```bash
npm run build
```

### **Database Setup**

1. Run `database_schema.sql` in Supabase SQL Editor
2. (Optional) Run `clean_database_setup.sql` for test data

---

## Future Enhancements

### **Planned Features**:
1. **Authentication & Authorization**
   - User login/logout
   - Role-based access control (RLS policies)
   - User management

2. **Advanced Filtering & Search**
   - Search batches by name/location
   - Filter pieces by status
   - Filter clients by type

3. **Reporting**
   - Generate PDF reports for sales
   - Export data to Excel/CSV
   - Sales analytics dashboard

4. **Payment Tracking**
   - Track installment payments
   - Payment reminders
   - Payment history per client

5. **Notifications**
   - Deadline reminders
   - Sale status changes
   - Payment due notifications

6. **Multi-language Support**
   - English/Arabic toggle
   - Dynamic language switching

7. **Image Upload**
   - Batch images
   - Piece photos
   - Client documents

8. **Mobile App**
   - React Native version
   - Offline support
   - Push notifications

---

## Development Guide

### **Adding a New Page**

1. Create file in `src/pages/`: `NewPage.tsx`
2. Export component: `export function NewPage() { ... }`
3. Add to `App.tsx` routing:
```typescript
import { NewPage } from './pages/NewPage'

{currentPage === 'new' && <NewPage />}
```
4. Add to `Sidebar.tsx` menu items:
```typescript
{ id: 'new', label: 'New Page', icon: '📄' }
```

### **Adding a New Database Table**

1. Update `database_schema.sql` with table definition
2. Create TypeScript interface:
```typescript
interface NewEntity {
  id: string
  name: string
  // ... other fields
}
```
3. Use Supabase client to interact:
```typescript
const { data, error } = await supabase
  .from('new_table')
  .select('*')
```

### **Adding a New Utility Function**

1. Create or update file in `src/utils/`
2. Export function:
```typescript
export function newUtility(input: InputType): OutputType {
  // Implementation
}
```
3. Import and use:
```typescript
import { newUtility } from '@/utils/newUtility'
```

### **Styling Guidelines**

- Use Tailwind CSS classes
- Follow responsive design (mobile-first)
- Use consistent spacing (p-4, mb-6, gap-3)
- Use semantic colors (bg-blue-50, text-green-600)

### **Code Organization**

- Keep components focused and small
- Extract reusable logic into utilities
- Use TypeScript interfaces for type safety
- Add comments for complex logic
- Follow existing naming conventions

### **Testing Considerations**

- Test calculation utilities with edge cases
- Test form validation
- Test error handling
- Test pagination with large datasets
- Test dialog workflows

---

## Common Issues & Solutions

### **Issue 1: Supabase Connection Error**
- **Solution**: Check `.env` file has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

### **Issue 2: Calculation Not Updating**
- **Solution**: Ensure `useMemo` dependencies include all variables used in calculation

### **Issue 3: Dialog Not Closing**
- **Solution**: Check `onClose` handler is called and state is properly reset

### **Issue 4: Database Foreign Key Error**
- **Solution**: Ensure referenced IDs exist before inserting/updating

### **Issue 5: Pagination Not Working**
- **Solution**: Check `totalCount` is correctly set and `range()` parameters are correct

---

## Contact & Support

For questions or issues, refer to:
- Database schema: `database_schema.sql`
- Test data: `clean_database_setup.sql`
- Component structure: See file structure above

---

**Last Updated**: Based on current codebase as of latest changes
**Version**: 2.0
**Maintained By**: Development Team

