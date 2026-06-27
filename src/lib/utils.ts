import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import React from 'react';
import { FixedAsset } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid() {
  return `id_${Math.random().toString(36).slice(2, 11)}`;
}

export function parseNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function fmt(n: number): string {
  return parseNum(n).toLocaleString('zh-TW');
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function normalizeFlavorName(name: string): string {
  if (!name) return '';
  return name.trim();
}

export function normalizeDateKey(v: string) {
  if (!v) return '';
  const [y, m = '1', d = '1'] = v.split('-');
  return `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
}

export function copyText(text: string, e: React.MouseEvent<HTMLElement>) {
  navigator.clipboard.writeText(text).then(() => {
    const btn = e.currentTarget;
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-mint-brand"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    setTimeout(() => {
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';
    }, 1500);
  });
}

export function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function fmtYM(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function calculateAssetDepreciation(asset: FixedAsset, year: number, month: number) {
  const purchaseDate = new Date(asset.purchaseDate);
  const totalMonths = asset.usefulLife * 12;
  const monthlyDep = totalMonths > 0 ? (asset.totalCost - asset.residualValue) / totalMonths : 0;
  const unitMonthlyDep = asset.quantity > 0 ? monthlyDep / asset.quantity : 0;

  // Compute difference in months from the month AFTER purchase date
  // e.g. purchaseDate is 2026-05-15 (May 2026). Month AFTER purchase is June 2026.
  // If target month is June 2026, diffMonths = 0.
  const diffMonths = (year - purchaseDate.getFullYear()) * 12 + (month - (purchaseDate.getMonth() + 1)) - 1;

  let status = '折舊中';
  let monthsUsed = 0;
  let currentDep = 0;

  if (asset.status === '已售出') {
    status = '停止折舊';
    const originalCompletedMonths = (year - purchaseDate.getFullYear()) * 12 + (month - purchaseDate.getMonth());
    monthsUsed = Math.min(totalMonths, Math.max(0, originalCompletedMonths));
    currentDep = 0;
  } else if (diffMonths < 0) {
    status = '尚未開始';
    monthsUsed = 0;
    currentDep = 0;
  } else if (diffMonths >= totalMonths) {
    status = '折舊結束';
    monthsUsed = totalMonths;
    currentDep = 0;
  } else {
    status = '折舊中';
    monthsUsed = diffMonths + 1;
    currentDep = monthlyDep;
  }

  const accumulated = Math.min(asset.totalCost - asset.residualValue, monthlyDep * monthsUsed);
  const unitAccumulated = asset.quantity > 0 ? accumulated / asset.quantity : 0;
  const bookValue = asset.totalCost - accumulated;
  const endDate = new Date(purchaseDate);
  endDate.setFullYear(purchaseDate.getFullYear() + asset.usefulLife);

  return {
    monthly: Math.round(currentDep),
    unitMonthly: Math.round(asset.quantity > 0 ? currentDep / asset.quantity : 0),
    accumulated: Math.round(accumulated),
    unitAccumulated: Math.round(unitAccumulated),
    bookValue: Math.round(bookValue),
    status,
    endDate: endDate.toISOString().split('T')[0]
  };
}
