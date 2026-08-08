// lib/staffCheckinPin.ts
// Hash/verify a staff member's kiosk check-in PIN (entities.checkin_pin_hash,
// see supabase/migrations/20260808230000_staff_checkin_pin.sql). Uses Node's
// built-in scrypt rather than pulling in bcrypt -- a 4-6 digit PIN has a tiny
// keyspace regardless of hash algorithm (this isn't a login password), so
// the point of hashing here is only to avoid storing it in the clear, not
// to resist offline brute force; scrypt with no extra dependency is enough.
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PIN_PATTERN = /^\d{4,6}$/;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(pin, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
