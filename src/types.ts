export interface Permissions {
  manage_system: boolean;  // 系統設定與權限管理
  pos: boolean;            // POS 收銀機
  daily: boolean;          // 日報表 (戰情室, 匯入)
  monthly: boolean;        // 月報表
  finance: boolean;        // 財務會計 (日記簿, 資產)
  inventory: boolean;      // 進貨與庫存
  cost: boolean;           // 成本分析
  customers: boolean;      // 顧客資料
  can_void: boolean;       // 特權: 作廢訂單
  hr: boolean;             // 人事與薪資管理
}

export interface Role {
  id: string;
  name: string;
  permissions: Permissions;
  isOwner?: boolean; // Protects the owner role from deletion or stripping of manage_system
}

export interface Operator {
  id: string;
  name: string;
  pinCode: string; // 4 to 6 digits
  roleId: string;
  // HR & Payroll
  payrollType?: 'hourly' | 'monthly';
  baseRate?: number; // Hourly rate or Monthly salary
}

export interface Material {
  id: string;
  category: '食材' | '包材' | string;
  name: string;
  unit: string;
  minAlert: number;
  stock: number;
  avgCost: number;
  purchaseUnit?: string;
  purchaseUnitRate?: number;
  midUnit?: string;
  midUnitRate?: number;
}

export interface PurchaseLine {
  id: string;
  materialId: string;
  qty: number;
  amount: number;
  purchaseQty?: number;
  purchaseUnit?: string;
}

export interface Purchase {
  id: string;
  date: string;
  year: number;
  vendor: string;
  lines: PurchaseLine[];
  totalAmount: number;
  notes?: string;
}

export interface InventoryAdj {
  id: string;
  date: string;
  materialId: string;
  systemQty: number;
  actualQty: number;
  diffQty: number;
  reason: string;
}

export interface Item {
  id: string;
  name: string;
  price: number;
  active: boolean;
  category?: 'gift' | 'single';
  recipe?: Record<string, number>;
  materialRecipe?: Record<string, number>;
}

export interface Order {
  id: string;
  buyer: string;
  phone: string;
  address: string;
  items: Record<string, number>;
  prodAmt: number;
  shipAmt: number;
  discAmt: number;
  actualAmt: number;
  status: '匯款' | '現結' | '未結帳款' | '公關品' | '已收帳款' | '已付訂金';
  note: string;
  depositAmt?: number; // For deposit flow
  deliveryMethod?: '宅配' | '自取';
  pickupDate?: string;
  recipientName?: string;
  recipientPhone?: string;
  shipDate?: string;
  email?: string;
  isPickedUp?: boolean;
  isReconciled?: boolean;
  source?: 'pos' | 'manual' | 'import';
  arCollectedCash?: number;
  arCollectedRemit?: number;
  orderType?: 'normal' | 'prepayment' | 'pickup';
  pendingPickup?: boolean;
}

export interface JournalLine {
  id: string;
  type: 'debit' | 'credit';
  accountId: string;
  accountName?: string;
  amount: number;
  lineDescription?: string;
}

export interface FixedAsset {
  id: string;
  status: '使用中' | '已售出' | '閒置';
  category: '生財設備' | '裝修工程' | '辦公設備' | '運輸設備' | '租賃物改良' | string;
  name: string;
  purchaseDate: string;
  totalCost: number;
  quantity: number;
  usefulLife: number;
  residualValue: number;
  remark?: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  year: number;
  voucherNo: string;
  description: string;
  lines: JournalLine[];
  debitTotal: number;
  creditTotal: number;
}

export interface InventoryItem {
  org: number;
  exp: number;
  act: number;
  los: number;
}

export interface LossEntry {
  id: string;
  flavor: string;
  qty: number;
  type: '人為' | '技術' | '過期' | '吃掉';
  notes: string;
}

export interface DailyReport {
  date: string;
  orders: Order[];
  dailyActive?: {
    giftItems?: Record<string, boolean>;
    singleItems?: Record<string, boolean>;
    packagingItems?: Record<string, boolean>;
    customCategories?: Record<string, Record<string, boolean>>;
  };
  ar: {
    accum: number;
    collect: number;
    logSpent: number;
    actualTotal: number;
    actualRemit?: number;
    actualCash?: number;
    actualUnpaid?: number;
  };
  inventory: Record<string, InventoryItem>;
  losses: LossEntry[];
  packagingUsage: Record<string, number>;
  cashRegister?: CashRegisterShift;
}

export interface CurrencyBreakdown {
  "1000": number;
  "500": number;
  "100": number;
  "50": number;
  "10": number;
  "5": number;
  "1": number;
}

export interface CashExpense {
  id: string;
  amount: number;
  reason: string;
  time: string;
}

export interface CashRegisterShift {
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
  openingCash: CurrencyBreakdown;
  openingTotal: number;
  closingCash?: CurrencyBreakdown;
  closingTotal?: number;
  expenses: CashExpense[];
  expectedCash?: number;
  overShort?: number;
  editLogs?: string[];
}

export interface CustomCategory {
  id: string;
  name: string;
  items: Item[];
}

export interface Settings {
  giftItems: Item[];
  singleItems: Item[];
  packagingItems: Item[];
  customCategories?: CustomCategory[];
  logo?: string;
  shopName?: string;
  legalName?: string;
  
  // 營業日與時段設定
  businessHoursStart?: string;
  businessHoursEnd?: string;
  fixedClosedDays?: number[]; // e.g., 1=Mon, 2=Tue, 0=Sun
  exceptionCalendar?: Record<string, 'closed' | 'holiday'>; // 'YYYY-MM-DD' -> status
  
  // 現場營運與交接班規則
  enableBlindClose?: boolean;
  expiryAlertDays?: number;
  enableDepositFlow?: boolean;

  // 人事薪資與打卡規則
  timeRoundingInterval?: 1 | 15 | 30; // Minutes
  lateGracePeriod?: number; // Minutes
  earlyLeaveTolerance?: number; // Minutes
  overtimeTier1Hours?: number;
  overtimeTier1Rate?: number;
  overtimeTier2Hours?: number;
  overtimeTier2Rate?: number;
  holidayPayRate?: number;

  // 財務分攤與攤提設定
  estimatedMonthlyRent?: number;
  estimatedMonthlyUtilities?: number;
  estimatedMonthlyPayroll?: number;

  // 人事 - 班別模板
  shiftTemplates?: ShiftTemplate[];

  // 人事 - 勞健保設定
  enableInsurance?: boolean; // 工保/健保/勞退開關
}

// ── HR: 班別模板 ──────────────────────────────────────────────
export interface ShiftTemplate {
  id: string;
  name: string;        // e.g. '早班', '晚班', '全班'
  startTime: string;   // 'HH:mm'
  endTime: string;     // 'HH:mm'
  breakMinutes: number;
  color?: string;      // hex color for calendar display
}

// ── HR: 排班記錄 ──────────────────────────────────────────────
export interface RosterEntry {
  operatorId: string;
  dateKey: string;       // 'YYYY-MM-DD'
  shiftTemplateId?: string;
  customStart?: string;  // override 'HH:mm'
  customEnd?: string;    // override 'HH:mm'
  isOff?: boolean;       // 公休/排休
  isHoliday?: boolean;   // 國定假日
  note?: string;
}

// ── HR: 打卡紀錄 ──────────────────────────────────────────────
export interface AttendancePunch {
  id: string;
  type: 'clock_in' | 'clock_out';
  time: string;          // 'HH:mm'
  rawTime: string;       // ISO timestamp
  roundedTime?: string;  // After rounding logic
  method: 'pin' | 'manual_admin';
  adminNote?: string;    // If manually added by admin
}

export interface AttendanceRecord {
  id: string;
  operatorId: string;
  dateKey: string;       // 'YYYY-MM-DD'
  punches: AttendancePunch[];
  clockIn?: string;      // Resolved 'HH:mm'
  clockOut?: string;     // Resolved 'HH:mm'
  effectiveMinutes?: number;  // After rounding
  isLate?: boolean;
  lateMinutes?: number;
  isEarlyLeave?: boolean;
  earlyLeaveMinutes?: number;
  isOvertier1?: boolean;
  isOvertier2?: boolean;
  isHoliday?: boolean;
  note?: string;
}

// ── HR: 薪資計算結果 ──────────────────────────────────────────
export interface PayrollLineItem {
  label: string;
  amount: number;
  type: 'add' | 'deduct';
}

export interface PayrollResult {
  operatorId: string;
  yearMonth: string;    // 'YYYY-MM'
  payrollType: 'hourly' | 'monthly';
  baseRate: number;

  // Hours summary (for hourly)
  totalRegularMinutes?: number;
  totalOt1Minutes?: number;
  totalOt2Minutes?: number;
  holidayMinutes?: number;

  // Monetary breakdown
  basePay: number;
  ot1Pay?: number;
  ot2Pay?: number;
  holidayPay?: number;
  lateDeduction?: number;

  // Insurance (when enabled)
  laborInsuranceEmployee?: number;
  healthInsuranceEmployee?: number;
  pensionEmployee?: number;

  // Company cost (when insurance enabled)
  laborInsuranceCompany?: number;
  healthInsuranceCompany?: number;
  pensionCompany?: number;

  netPay: number;         // Employee receives
  companyCost?: number;   // Total cost to employer
  lineItems: PayrollLineItem[];
}

export interface COAItem {
  id: string;
  name: string;
  type: string;
  side: 'debit' | 'credit';
}

export interface Vendor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  category?: string;
  notes?: string;
}

export interface MaterialCostRecord {
  id: string;
  materialId: string;
  qty: number;
  unit: string;
  price: number;
  unitCost: number;
  date: string;
  timestamp?: number;
}

export interface DailyUsageItem {
  id: string;
  type: 'material' | 'recipe';
  itemId: string;
  qty: number;
  unitCost: number;
  totalCost: number;
  recipeYield?: number;
}

export interface DailyUsageRec {
  id: string;
  date: string;
  items: DailyUsageItem[];
  totalValue: number;
}

export interface RecipeItem {
  id: string;
  type: 'material' | 'half';
  itemId: string;
  quantity: number;
}

export interface Recipe {
  id: string;
  name: string;
  type: 'finished' | 'half';
  yield: number;
  unit: string;
  items: RecipeItem[];
  tags: string[];
}

export interface CustomerPurchase {
  orderId: string;
  date: string;
  prodAmt: number;
  actualAmt: number;
  items: Record<string, number>;
  status: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  gender?: '先生' | '小姐' | '不選擇';
  lineId?: string;
  birthday?: string;
  tags?: string[];
  note?: string;
  createdAt: string;
  updatedAt: string;
  purchases: CustomerPurchase[];
  totalPurchaseCount: number;
  totalPurchaseAmt: number;
}
