# macOS 脚本自动连接带 TOTP 动态码的 VPN

密码是「静态密码 + 6 位动态码」的 VPN（Tunnelblick），也能每天全自动连接，不用手机抄码。

## 原理

TOTP 动态码不是从哪取的，是本地算的（RFC 6238）：

```
码 = HMAC-SHA1(密钥, Unix时间 ÷ 30) → 截断成 6 位
```

密钥就是绑 MFA 时二维码里那串 base32 字符串，拿到它脚本就能和手机 App 算出一样的码。

## 结构（关键：钥匙串静置只存纯静态，动态码只在连接瞬间拼）

```
钥匙串静置：静态密码 + TOTP密钥；Tunnelblick-Auth 条目 = 纯静态
  → 脚本：python3 算码 → security -U 把「静态+动态」瞬间写进 Tunnelblick 条目
  → osascript 触发连接，轮询到 CONNECTED
  → 连上后立即把条目还原为纯静态（restore_static）
  → launchd 每天 06:00 + 每 10min 自愈；pmset 6:00 唤醒机器
```

为什么不能把「静态+动态码」长期留在钥匙串里 —— 这是踩出来的血泪：动态码 30 秒过期，一旦 Tunnelblick 自己触发重连（睡眠保活、开机自连），就拿那个**过期码**去认证，必然失败弹模态框，而**弹框会堵死整个 AppleScript 队列**，定时脚本第一步 `get state` 就超时卡死（-1712），自己救不了自己。所以静置必须是纯静态，且要关掉 Tunnelblick 的睡眠保活。

核心命令：

```bash
# 算码（python3 标准库 hmac+base64+struct 十来行；RFC 6238 测试向量：t=59 → 287082）
# 连接瞬间拼动态码（-U 原地更新，绝不能删除重建）
security add-generic-password -U -s "Tunnelblick-Auth-<配置名>" -a password -w "${静态}${动态码}"
osascript -e 'with timeout of 10 seconds' -e 'tell application "Tunnelblick" to connect "<配置名>"' -e 'end timeout'
# 连上后还原为纯静态
security add-generic-password -U -s "Tunnelblick-Auth-<配置名>" -a password -w "${静态}"
# 关掉睡眠保活（断绝过期码自动重连的触发源）
defaults write net.tunnelblick.tunnelblick "<配置名>-doNotDisconnectOnSleep" -bool NO
# 定时唤醒
sudo pmset repeat wakeorpoweron MTWRFSU 06:00:00
```

## 坑

1. **弹框堵死 AppleScript 是头号杀手**。Tunnelblick 一出认证失败模态框，`osascript` 全部超时（-1712），脚本彻底卡死。防御两手：钥匙串静置只存纯静态（不给过期码机会）+ 关 `doNotDisconnectOnSleep`（不让 Tunnelblick 自动重连）。每个 osascript 也要加 `with timeout` 自超时，别让它挂死 launchd。
2. **钥匙串条目绝不能删除重建**。`security` CLI 重建的条目 partition ID 变 `apple-tool:`，即便 `-T` 加 ACL，Tunnelblick 也读不了 → `could not read Auth ... from management interface` → EXITING。只能 `-U` 原地改值；条目必须由 Tunnelblick 手动连一次（勾保存钥匙串）创建。
3. **强杀 Tunnelblick + CLI 改写会破坏钥匙串信任**。之后 Tunnelblick 再读条目要重新授权，隐藏的 SecurityAgent 框堵死主线程，脚本代答不了。恢复：手动连一次点「始终允许」。正常运行（不强杀）时脚本 `-U` 更新不会触发授权。
4. **别读 Tunnelblick-Auth 条目**。它归 Tunnelblick 所有，CLI 读会弹授权框。静态源单独存一份（`vpn-static-password`），脚本永远不读那个条目。
5. **密码格式看 OpenVPN 日志验证**，别猜。纯静态第一次 AUTH_FAILED、人工重试成功 ⇒ 动态码拼在后面。
6. **周期边缘防过期**：动态码剩 <5 秒等下一周期再连；慢握手服务器 TLS 协商可能吃掉整个 30 秒窗口，靠 10min 自愈兜底。
7. **合盖是 dark wake**：屏幕不亮脚本照跑，之后机器睡回去 VPN 会断；配 10min 自愈，开盖后很快自动连回。
8. 二维码用 CoreImage（swift 几行）本地解出 `otpauth://` URI，密钥不出本机；提取后删图。

## 安全取舍

密钥和静态密码只存钥匙串，不进脚本和 shell 历史。但 TOTP 密钥和密码放同一台机器，第二因子实际降级成"同盘第二个秘密"——全自动化的代价，要想清楚再做。
