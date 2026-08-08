// lib/staffCheckinQr.ts
// Shared QR payload format between app/api/staff/checkin-qr/route.ts
// (generates it) and components/kiosk/CheckInPanel.tsx (decodes it).
// Versioned + namespaced so the kiosk's scanner can tell "this is one of
// our check-in codes" apart from an unrelated QR code someone points the
// camera at by accident.
const QR_PREFIX = "dr-checkin:v1:";

export function buildCheckinQrPayload(staffEntityId: string): string {
  return `${QR_PREFIX}${staffEntityId}`;
}

export function parseCheckinQrPayload(scanned: string): string | null {
  if (!scanned.startsWith(QR_PREFIX)) return null;
  const entityId = scanned.slice(QR_PREFIX.length).trim();
  return entityId.length > 0 ? entityId : null;
}
