// lib/kioskDevice.ts
// Backs Sidebar.tsx's "Enter kiosk mode". A kiosk's name always comes from
// the admin, typed once when they create it in Admin > Kiosk Accounts
// (components/admin/AdminKioskAccountsTab.tsx) -- this file never invents
// one. All this does is remember, per browser/device, WHICH of the
// company's already-named kiosks this device should act as (see
// components/kiosk/ChooseKioskModal.tsx for the picker shown the first
// time, when nothing's stored yet), so a company with several physical
// kiosks (front desk, warehouse, ...) gets a distinct, consistent identity
// per device for staff_checkins.checked_in_by -- see
// app/api/kiosk/checkins/route.ts's resolveActingUserId.
"use client";

export function kioskDeviceStorageKey(companyId: string): string {
  return `diract-kiosk-device:${companyId}`;
}

export function getStoredKioskDeviceId(companyId: string): string | null {
  const stored = localStorage.getItem(kioskDeviceStorageKey(companyId));
  if (!stored) return null;
  try {
    const { id } = JSON.parse(stored) as { id: string };
    return id || null;
  } catch {
    return null;
  }
}

export function setStoredKioskDeviceId(companyId: string, kioskAccountId: string): void {
  localStorage.setItem(kioskDeviceStorageKey(companyId), JSON.stringify({ id: kioskAccountId }));
}
