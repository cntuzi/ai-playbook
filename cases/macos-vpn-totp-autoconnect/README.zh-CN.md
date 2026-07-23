# macOS VPN 自动连接（Tunnelblick + TOTP 动态码）

[English](./README.md) | [中文](./README.zh-CN.md)

macOS 上每天全自动连接 VPN——密码是**静态密码 + 滚动 TOTP 动态码**的那种，正常情况下你每天早上都得掏手机抄一遍 6 位码。

**技术栈：** Tunnelblick + macOS 钥匙串 + python3（纯标准库）+ launchd + pmset

## 为什么这事能成

验证器 App 上的 6 位"授权码"不是从哪取来的，TOTP（RFC 6238）是个纯函数：

```
码 = HMAC-SHA1(密钥, Unix时间 ÷ 30) → 截断成 6 位数字
```

密钥就是绑定 MFA 时扫的二维码里那串固定的 base32 字符串。手机离线也能算，shell 脚本当然也能算。**不需要联网、不需要手机、不需要 OCR 之类的歪招。**

于是整个系统收敛为：

```
钥匙串（TOTP 密钥 + 静态密码）
   → 脚本：算当期码，把「静态+动态」写进 Tunnelblick 的钥匙串条目
   → AppleScript：触发 Tunnelblick 连接
   → launchd：每天 06:00 执行
   → pmset：06:00 唤醒机器，让 launchd 有机器可跑
```

## 脚本

`~/bin/vpn-autoconnect.sh` —— 所有秘密只存钥匙串，脚本里一个都没有：

```bash
#!/bin/bash
set -euo pipefail

CONFIG="MyVPN"                     # Tunnelblick 配置名
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

# 计算当期 TOTP；若本 30 秒周期只剩 <5s，等下一周期，避免握手途中过期
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

# 原地更新密码（-U）。绝不能删除重建——见坑 #1。
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

信任自己的 TOTP 实现之前，先用 RFC 6238 官方测试向量验一下：密钥 `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ` 在时间 59 秒时必须算出 `287082`。

## 定时

`~/Library/LaunchAgents/com.<you>.vpn-autoconnect.plist`：

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
sudo pmset repeat wakeorpoweron MTWRFSU 06:00:00   # 每天 6 点唤醒（关机则开机，需接电源）
```

不配 pmset 也行：6 点机器在睡的话，launchd 会在下次唤醒时补跑错过的任务——"开盖时已经连上"这个效果依然成立。

## 安装步骤

```bash
# 1. 存 TOTP 密钥（MFA 绑定二维码里的 base32 字符串）
security add-generic-password -s vpn-totp-secret -a you -w 'BASE32SECRET'

# 2. 存静态密码前缀（密码框只填纯动态码的话跳过）
security add-generic-password -s vpn-static-password -a you -w 'staticpassword'

# 3. 用 Tunnelblick 图形界面【手动连一次】，输入 静态+动态码，
#    勾选「保存在钥匙串」——让钥匙串条目由 Tunnelblick 自己创建。
#    必须做，原因见坑 #1。

# 4. 验证
~/bin/vpn-autoconnect.sh && echo OK
```

首次运行会弹两个一次性授权：钥匙串访问（点「始终允许」）和控制 Tunnelblick 的自动化权限。之后全程静默。

手头只有二维码没有密钥字符串？用 CoreImage 本地解码，零第三方依赖，密钥不出本机：

```swift
// swift qr.swift photo.png
import CoreImage; import Foundation
let img = CIImage(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))!
let det = CIDetector(ofType: CIDetectorTypeQRCode, context: nil,
                     options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
for f in det.features(in: img) { print((f as! CIQRCodeFeature).messageString!) }
// → otpauth://totp/issuer:user?secret=BASE32SECRET&issuer=...
```

## 踩坑记录（本文最值钱的部分）

### 1. Tunnelblick 的钥匙串条目绝不能删除重建

脚本第一版用的是 `security delete-generic-password` + `add-generic-password -T /Applications/Tunnelblick.app`。看着合理，**直接全挂**。

macOS 钥匙串条目带 *partition ID*，跟创建者绑定。用 `security` CLI 重建的条目 partition 变成 `apple-tool:`——即便 `-T` 把 Tunnelblick 加进了 ACL，它照样读不了。而且失败方式极其迷惑：

```
MANAGEMENT: Client disconnected
ERROR: could not read Auth username/password/ok/string from management interface
Exiting due to fatal error
```

Tunnelblick 在 `hold release` 之后 15 秒直接放弃，连接死在 `EXITING`，认证请求根本没发到服务器。

**修法：** 条目必须由 Tunnelblick 自己创建（手动连一次、勾选保存钥匙串）。之后 `security add-generic-password -U` **原地更新**值、保留原始 ACL，每天改写永远有效。

### 2. 密码格式别猜，看 OpenVPN 日志

密码到底是「静态+动态」还是纯动态码？不用靠回忆——OpenVPN 日志给出了铁证：第一次认证（用钥匙串里存的纯静态密码）`AUTH_FAILED`，7 秒后的重试（人工输入）成功了。存的密码不够用 ⇒ 动态码是拼接上去的。**证据永远比记忆可靠。**

### 3. TOTP 码会在握手途中过期

周期还剩 3 秒时算出的码，等服务器校验时可能已经过期。脚本在剩余 <5 秒时等下一周期——两行代码消灭约 17% 的随机失败率。

### 4. 合盖状态没问题，但有一个细节

pmset 定时唤醒合盖的 MacBook 是 *dark wake*：屏幕不亮，但 launchd、网络、脚本全部正常跑。几分钟后机器会睡回去、VPN 随之断开——这拦不住，但实际不影响：OpenVPN 服务器会下发 `auth-token` 会话票据，开盖唤醒时 Tunnelblick 的自动重连直接复用 token，**不需要新的动态码**。若确实需要合盖期间保持在线（如远程访问），改成阻止睡眠：接电源时 `sudo pmset -a disablesleep 1`。

## 安全说明

- TOTP 密钥和静态密码只存在登录钥匙串里——不在脚本、plist、shell 历史里。
- 把 TOTP 密钥和静态密码放在同一台机器上，等于把第二因子降级成"同一块盘上的第二个秘密"。这是全自动化的显式代价，要清楚地做这个取舍。
- 提取完密钥后删掉二维码图片。密钥随时可以从钥匙串取回。
