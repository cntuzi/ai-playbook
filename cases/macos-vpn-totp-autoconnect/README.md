# macOS VPN Auto-Connect with TOTP (Tunnelblick)

[English](./README.md) | [中文](./README.zh-CN.md)

Fully unattended daily VPN connection on macOS, where the password is **static password + rotating TOTP code** — the kind of setup that normally forces you to type a 6-digit code from your phone every morning.

**Stack:** Tunnelblick + macOS Keychain + python3 (stdlib only) + launchd + pmset

## Why This Works at All

The 6-digit "authorization code" from your authenticator app is not fetched from anywhere. TOTP (RFC 6238) is a pure function:

```
code = HMAC-SHA1(secret, unix_time ÷ 30) → truncate to 6 digits
```

The secret is a fixed base32 string embedded in the QR code you scanned when binding MFA. Your phone computes the code offline; a shell script can do exactly the same. **No network, no phone, no OCR hacks.**

So the whole system reduces to:

```
Keychain (TOTP secret + static password)
   → script: compute code, write "static+code" into Tunnelblick's Keychain item
   → AppleScript: tell Tunnelblick to connect
   → launchd: run daily at 06:00
   → pmset: wake the Mac at 06:00 so launchd has a machine to run on
```

## The Script

`~/bin/vpn-autoconnect.sh` — secrets live in Keychain, never in the script:

```bash
#!/bin/bash
set -euo pipefail

CONFIG="MyVPN"                     # Tunnelblick configuration name
LOG="$HOME/Library/Logs/vpn-autoconnect.log"

log() { echo "$(date '+%F %T') $*" >>"$LOG"; }

state() {
  osascript -e "tell application \"Tunnelblick\" to get state of first configuration where name = \"$CONFIG\""
}

if [[ "$(state)" == "CONNECTED" ]]; then
  log "already connected"
  exit 0
fi

SECRET=$(security find-generic-password -s vpn-totp-secret -w)
PREFIX=$(security find-generic-password -s vpn-static-password -w 2>/dev/null || true)

# Compute current TOTP; if <5s left in the 30s window, wait for the next one
# so the code doesn't expire mid-handshake.
CODE=$(python3 - "$SECRET" <<'EOF'
import sys, time, hmac, hashlib, base64, struct
s = sys.argv[1].replace(" ", "").upper()
key = base64.b32decode(s + "=" * ((8 - len(s) % 8) % 8))
now = int(time.time())
if 30 - now % 30 < 5:
    time.sleep(30 - now % 30)
    now = int(time.time())
h = hmac.new(key, struct.pack(">Q", now // 30), hashlib.sha1).digest()
o = h[-1] & 15
print(f"{(struct.unpack('>I', h[o:o+4])[0] & 0x7FFFFFFF) % 1000000:06d}")
EOF
)

# Update the password IN PLACE (-U). Never delete + recreate — see pitfall #1.
security add-generic-password -U -s "Tunnelblick-Auth-$CONFIG" -a password -w "${PREFIX}${CODE}"

osascript -e "tell application \"Tunnelblick\" to connect \"$CONFIG\"" >/dev/null
log "connect issued"

for _ in $(seq 1 30); do
  sleep 2
  s=$(state)
  if [[ "$s" == "CONNECTED" ]]; then
    log "connected"
    exit 0
  fi
done

log "timeout, state=$s"
exit 1
```

Sanity-check your TOTP implementation against the RFC 6238 test vector before trusting it: secret `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ` at time 59 must produce `287082`.

## Scheduling

`~/Library/LaunchAgents/com.<you>.vpn-autoconnect.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.you.vpn-autoconnect</string>
    <key>ProgramArguments</key>
    <array><string>/Users/you/bin/vpn-autoconnect.sh</string></array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key><integer>6</integer>
        <key>Minute</key><integer>0</integer>
    </dict>
    <key>StandardErrorPath</key>
    <string>/Users/you/Library/Logs/vpn-autoconnect.log</string>
</dict>
</plist>
```

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.you.vpn-autoconnect.plist
sudo pmset repeat wakeorpoweron MTWRFSU 06:00:00   # wake (or power on) the Mac daily
```

If the Mac is asleep at 06:00 and you skip the `pmset` part, launchd fires the missed job on next wake — "connected by the time you open the lid" still holds.

## Setup

```bash
# 1. Store the TOTP secret (the base32 string from the MFA binding QR code)
security add-generic-password -s vpn-totp-secret -a you -w 'BASE32SECRET'

# 2. Store the static password prefix (skip if the password is the code alone)
security add-generic-password -s vpn-static-password -a you -w 'staticpassword'

# 3. Connect once MANUALLY via Tunnelblick GUI, enter static+code,
#    and check "Save in Keychain" — this creates the Keychain item
#    with Tunnelblick as the owner. Required. See pitfall #1.

# 4. Test
~/bin/vpn-autoconnect.sh && echo OK
```

First run pops two one-time dialogs: Keychain access ("Always Allow") and Automation permission for controlling Tunnelblick. After that it's fully silent.

If the QR code is all you have, decode it locally with CoreImage — no third-party tools, and the secret never leaves the machine:

```swift
// swift qr.swift photo.png
import CoreImage; import Foundation
let img = CIImage(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))!
let det = CIDetector(ofType: CIDetectorTypeQRCode, context: nil,
                     options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
for f in det.features(in: img) { print((f as! CIQRCodeFeature).messageString!) }
// → otpauth://totp/issuer:user?secret=BASE32SECRET&issuer=...
```

## Pitfalls (the part worth reading)

### 1. Never delete + recreate Tunnelblick's Keychain item

The first version of the script did `security delete-generic-password` + `add-generic-password -T /Applications/Tunnelblick.app`. Looks reasonable. **Broke everything.**

macOS Keychain items carry a *partition ID* tied to whoever created them. An item recreated by the `security` CLI gets partition `apple-tool:` — and Tunnelblick, despite being listed in the ACL via `-T`, can no longer read it. The failure is silent and confusing:

```
MANAGEMENT: Client disconnected
ERROR: could not read Auth username/password/ok/string from management interface
Exiting due to fatal error
```

Tunnelblick just gives up 15 seconds after `hold release`; the connection dies in `EXITING` with no auth attempt ever reaching the server.

**Fix:** the item must be created by Tunnelblick itself (connect once manually with "Save in Keychain" checked). After that, `security add-generic-password -U` updates the value *in place* and preserves the original ACL — the daily rewrite works forever.

### 2. Read the OpenVPN log before guessing the password format

Was the password `static+code`, or just `code`? Instead of asking the user to remember, the OpenVPN log answered definitively: the first auth attempt (using the Keychain-saved static password alone) returned `AUTH_FAILED`, and the retry 7 seconds later — a human typing — succeeded. Saved password alone insufficient ⇒ the code is appended. Evidence beats memory.

### 3. TOTP codes expire mid-handshake

A code computed with 3 seconds left in its 30-second window may be expired by the time the server validates it. The script waits for the next window when fewer than 5 seconds remain — two lines that remove a ~17% random failure rate.

### 4. Lid-closed behavior is fine, with one caveat

A `pmset` scheduled wake on a closed MacBook is a *dark wake*: screen off, but launchd, network, and the script all run normally. The machine goes back to sleep minutes later and the VPN drops with it — that's unavoidable. In practice it doesn't matter: OpenVPN servers push an `auth-token` session ticket, so when you open the lid, Tunnelblick's wake-reconnect reuses the token and comes back up **without needing a fresh TOTP**. If you need the VPN alive *while* the lid is closed (remote access), prevent sleep instead: `sudo pmset -a disablesleep 1` while on AC power.

## Security Notes

- The TOTP secret and static password live only in the login Keychain — never in the script, launchd plist, or shell history.
- Storing the TOTP secret on the same machine that holds the static password does weaken the second factor to "second secret on the same disk". That's the explicit trade-off for unattended operation; make it consciously.
- Delete QR code images after extracting the secret. The secret can always be re-read from Keychain.
