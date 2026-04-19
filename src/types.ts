export interface Material {
  id: string;
  category: '食材' | '包材' | string;
  name: string;
  unit: string;
  minAlert: number;
  stock: number;
  avgCost: number;
}

export interface PurchaseLine {
  id: string;
  materialId: string;
  qty: number;
  amount: number;
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
  status: '匯款' | '現結' | '未結帳款' | '公關品' | '已收帳款';
  note: string;
  deliveryMethod?: string;
  pickupDate?: string;
  recipientName?: string;
  recipientPhone?: string;
  shipDate?: string;
  email?: string;
  isReconciled?: boolean; // tracking reconciliation
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
}

export interface COAItem {
  id: string;
  name: string;
  type: string;
  side: 'debit' | 'credit';
}
