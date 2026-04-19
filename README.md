# 態度貳貳甜點店營運系統 (Taidu Patisserie Operations System)

這是一個專為「態度貳貳甜點店」客製化開發的營運管理系統。系統提供完整的前端與 Firebase 後端整合，協助店家管理日常營運、財務報表與庫存紀錄。

## ✨ 主要功能

系統包含以下五個核心模組：

- 📝 **日記簿 (Journal)**：日常雜項紀錄與重要事項追蹤。
- 📅 **日報表 (Daily Report)**：每日營業額、品項銷售紀錄與現金流對帳。
- 📦 **進貨與庫存 (Inventory)**：原物料進貨管理與庫存盤點。
- 📊 **月報表 (Monthly Report)**：按月彙整銷售數據、盈虧分析。
- 💰 **成本分析 (Cost Analysis)**：依據原物料與銷售狀況，進行各品項的成本毛利分析。

## 🛠️ 技術選型 (Tech Stack)

- **前端框架**: React 19 + Vite 6
- **UI 樣式**: Tailwind CSS v4, Lucide React (Icons), Motion (動畫)
- **後端與資料庫**: Firebase (Authentication, Firestore)
- **資料處理與匯出**: xlsx, papaparse, html2pdf.js
- **開發語言**: TypeScript

## 🚀 快速開始 (Getting Started)

### 前置作業
請確認已安裝 [Node.js](https://nodejs.org/)。

### 1. 安裝依賴套件
```bash
npm install
```

### 2. 環境變數設定
請參考專案中的環境變數範例（如 `.env.example`），建立您的 `.env` 檔案並填寫對應的 Firebase 與其他設定。

### 3. 啟動開發伺服器
```bash
npm run dev
```
啟動後可在瀏覽器開啟對應的本地端網址（預設為 `http://localhost:3000`）。

### 4. 建置正式環境
```bash
npm run build
```

## 🔒 系統權限
本系統綁定 Firebase 帳號驗證 (Google Login)。只有通過權限審核之帳號才能正常登入並存取商店後台資料。
