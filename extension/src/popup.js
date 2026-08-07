// extension/src/popup.js
// Extension toolbar popup: connection status (delegated to background.js's
// own supabase session via a runtime message, so this file doesn't need its
// own supabase client), the tracking on/off toggle, and the excluded-
// domains list -- both of the latter are read/written directly via
// chrome.storage.local since the popup runs in the same extension context
// as the background worker.
const APP_URL = "https://diract.io";

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const trackingToggle = document.getElementById("trackingToggle");
const connectPrompt = document.getElementById("connectPrompt");
const connectLink = document.getElementById("connectLink");
const excludedDomainsEl = document.getElementById("excludedDomains");
const syncNowBtn = document.getElementById("syncNowBtn");

connectLink.href = `${APP_URL}/dashboard/settings/extension`;

async function refreshStatus() {
  const { connected } = await chrome.runtime.sendMessage({ type: "get_status" });
  statusDot.classList.toggle("connected", !!connected);
  statusText.textContent = connected ? "Connected" : "Not connected";
  connectPrompt.style.display = connected ? "none" : "block";
}

async function loadSettings() {
  const { trackingEnabled, excludedDomains } = await chrome.storage.local.get(["trackingEnabled", "excludedDomains"]);
  trackingToggle.checked = !!trackingEnabled;
  excludedDomainsEl.value = Array.isArray(excludedDomains) ? excludedDomains.join("\n") : "";
}

trackingToggle.addEventListener("change", () => {
  chrome.storage.local.set({ trackingEnabled: trackingToggle.checked });
});

excludedDomainsEl.addEventListener("blur", () => {
  const domains = excludedDomainsEl.value.split("\n").map((d) => d.trim()).filter(Boolean);
  chrome.storage.local.set({ excludedDomains: domains });
});

syncNowBtn.addEventListener("click", async () => {
  syncNowBtn.disabled = true;
  syncNowBtn.textContent = "Syncing...";
  await chrome.runtime.sendMessage({ type: "sync_now" });
  syncNowBtn.textContent = "Sync now";
  syncNowBtn.disabled = false;
});

refreshStatus();
loadSettings();
