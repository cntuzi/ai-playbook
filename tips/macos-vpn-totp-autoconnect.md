# macOS 脚本自动连接带 TOTP 动态码的 VPN

密码是「静态密码 + 6 位动态码」的 VPN（Tunnelblick），也能每天全自动连接，不用手机抄码。

## 原理

TOTP 动态码不是从哪取的，是本地算的（RFC 6238）：

```
码 = HMAC-SHA1(密钥, Unix时间 ÷ 30) → 截断成 6 位
```

密钥就是绑 MFA 时二维码里那串 base32 字符串，拿到它脚本就能和手机 App 算出一样的码。

## 结构

```
钥匙串（TOTP 密钥 + 静态密码）
  → 脚本：python3 算码 → security -U 把「静态+动态」写进 Tunnelblick 钥匙串条目
  → osascript 触发连接，轮询到 CONNECTED
  → launchd 每天 06:00 执行 + pmset 同时点唤醒机器
```

核心命令：

```bash
# 算码（python3 标准库，hmac+base64+struct 十来行；用 RFC 6238 测试向量验证：t=59 → 287082）
# 更新密码（必须 -U 原地更新）
security add-generic-password -U -s "Tunnelblick-Auth-<配置名>" -a password -w "${静态}${动态码}"
# 触发连接
osascript -e 'tell application "Tunnelblick" to connect "<配置名>"'
# 定时唤醒
sudo pmset repeat wakeorpoweron MTWRFSU 06:00:00
```

## 坑

1. **Tunnelblick 的钥匙串条目绝不能删除重建**。`security` CLI 重建的条目 partition ID 是 `apple-tool:`，即便 `-T` 加了 ACL，Tunnelblick 也读不了，症状是 openvpn 日志 `could not read Auth username/password from management interface` 后直接 EXITING。条目必须由 Tunnelblick 手动连一次（勾选保存钥匙串）创建，之后脚本只用 `-U` 原地改值。
2. **密码格式别猜，看 OpenVPN 日志**。存的纯静态密码第一次 AUTH_FAILED、7 秒后人工重试成功 ⇒ 证明动态码是拼在后面的。
3. **周期边缘防过期**：动态码剩 <5 秒时等下一个 30 秒周期再连，否则握手途中过期，约 17% 随机失败。
4. **合盖没问题**：pmset 唤醒是 dark wake，屏幕不亮脚本照跑；之后机器睡回去 VPN 会断，但服务器发过 `auth-token`，开盖时 Tunnelblick 自动重连走 token，不需要新码。
5. 二维码用 CoreImage（swift 几行）本地解出 `otpauth://` URI，密钥不出本机；提取后删图。

## 安全取舍

密钥和静态密码只存钥匙串，不进脚本和 shell 历史。但 TOTP 密钥和密码放同一台机器，第二因子实际降级成"同盘第二个秘密"——全自动化的代价，要想清楚再做。
