// lib/vmProviders/windowsLoginCheck.ts
// Verifies a Windows-on-DigitalOcean VM's RDP credentials actually work,
// not just that port 3389 is open. Needed because dockur/windows (the
// unattended Windows 11 install this path uses -- see digitalocean.ts)
// occasionally leaves the guest's Administrator account unable to log in
// after a from-scratch install (confirmed directly, twice, on real VMs:
// the droplet/RDP port come up fine, but Guacamole reports "denied access"
// forever after -- there's no way to fix this post-hoc since dockur/windows
// only applies USERNAME/PASSWORD during the very first Windows setup).
//
// This connects to our own Guacamole gateway's raw WebSocket tunnel
// directly -- not through a headless browser (playwright is a devDependency
// only, not something to run inside a Vercel serverless function) and not
// through a full RDP client library (the only real option on npm,
// node-rdpjs, is unmaintained and AGPL-licensed -- a real risk to bundle).
// Guacamole's own tunnel protocol is a simple length-prefixed text format,
// and reading it directly is enough to tell a real login from a denied one:
// confirmed empirically against both a known-good and a known-bad VM this
// session -- a successful RDP session produces a sustained stream of "sync"
// instructions (real framebuffer updates), while a rejected login produces
// an "error" instruction (status 769/771, Guacamole's UNAUTHORIZED/
// FORBIDDEN codes) before any of that ever starts.
import WebSocket from "ws";
import { getGuacamoleSession, resolveGuacamoleUrl } from "@/lib/guacamole";
import { resolveFlyRegion } from "./regions";
import type { CloudProviderId } from "./types";

export type WindowsLoginCheck = "success" | "auth-failed" | "inconclusive";

// Guacamole's wire format is length-prefixed ("<byte-length>.<value>",
// comma-separated, semicolon-terminated) specifically so values can contain
// commas/semicolons themselves (real error messages do, e.g. "Access denied
// by server (account locked/disabled?)") -- naive comma-splitting would
// misparse those. Buffers partial instructions across multiple WebSocket
// frames.
class GuacInstructionParser {
  private buffer = "";

  // Returns every complete instruction found so far as [opcode, ...args].
  push(chunk: string): string[][] {
    this.buffer += chunk;
    const instructions: string[][] = [];
    while (true) {
      const parsed = this.tryParseOne();
      if (!parsed) break;
      instructions.push(parsed);
    }
    return instructions;
  }

  private tryParseOne(): string[] | null {
    let pos = 0;
    const elements: string[] = [];
    while (true) {
      const dot = this.buffer.indexOf(".", pos);
      if (dot === -1) return null; // incomplete -- wait for more data
      const length = Number(this.buffer.slice(pos, dot));
      if (!Number.isFinite(length)) return null;
      const valueStart = dot + 1;
      const valueEnd = valueStart + length;
      if (this.buffer.length < valueEnd + 1) return null; // value + terminator not fully arrived yet
      elements.push(this.buffer.slice(valueStart, valueEnd));
      const terminator = this.buffer[valueEnd];
      pos = valueEnd + 1;
      if (terminator === ";") {
        this.buffer = this.buffer.slice(pos);
        return elements;
      }
      if (terminator !== ",") return null; // malformed -- give up on this buffer
    }
  }
}

const AUTH_FAILURE_STATUSES = new Set(["769", "771"]); // Guacamole CLIENT_UNAUTHORIZED / CLIENT_FORBIDDEN
const SYNC_INSTRUCTIONS_FOR_SUCCESS = 2;
const CHECK_TIMEOUT_MS = 12000;

export async function verifyWindowsRdpLogin(
  vm: { id: string; provider: string; region: string },
  ip: string,
  username: string,
  password: string
): Promise<WindowsLoginCheck> {
  const guacamoleUrl = resolveGuacamoleUrl(resolveFlyRegion(vm.provider as CloudProviderId, vm.region));
  const connectionLabel = `verify-${vm.id}`;

  let session;
  try {
    session = await getGuacamoleSession({
      connectionLabel,
      protocol: "rdp",
      hostname: ip,
      username,
      password,
      guacamoleUrl,
      width: 1024,
      height: 768,
      dpi: 96,
    });
  } catch {
    // Couldn't even reach the gateway to mint a token -- a transient
    // problem on our end, not a signal about the VM's credentials.
    return "inconclusive";
  }

  return new Promise((resolve) => {
    const wsUrl =
      `${guacamoleUrl.replace(/^http/, "ws")}/websocket-tunnel` +
      `?token=${session.authToken}&GUAC_DATA_SOURCE=json&GUAC_ID=${connectionLabel}` +
      `&GUAC_TYPE=c&GUAC_WIDTH=1024&GUAC_HEIGHT=768&GUAC_DPI=96` +
      `&GUAC_AUDIO=&GUAC_VIDEO=&GUAC_IMAGE=image%2Fpng`;

    const parser = new GuacInstructionParser();
    let syncCount = 0;
    let settled = false;
    let ws: WebSocket;

    const finish = (result: WindowsLoginCheck) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws?.close();
      resolve(result);
    };

    const timer = setTimeout(() => finish(syncCount > 0 ? "success" : "inconclusive"), CHECK_TIMEOUT_MS);

    try {
      ws = new WebSocket(wsUrl);
    } catch {
      finish("inconclusive");
      return;
    }

    ws.on("message", (data) => {
      for (const [opcode, ...args] of parser.push(data.toString())) {
        if (opcode === "sync") {
          syncCount++;
          if (syncCount >= SYNC_INSTRUCTIONS_FOR_SUCCESS) finish("success");
        } else if (opcode === "error" && syncCount === 0) {
          // Only trust an error seen *before* any real graphics activity --
          // once sync instructions have arrived the login already
          // succeeded, and a later error (e.g. this same check's own
          // timeout disconnect, which guacd reports as a benign
          // CLIENT_TIMEOUT/status 776) doesn't mean auth failed.
          const status = args[1];
          finish(AUTH_FAILURE_STATUSES.has(status) ? "auth-failed" : "inconclusive");
        }
      }
    });
    ws.on("error", () => finish("inconclusive"));
  });
}
