# 硬件支持状态

审计基准：`13f3b88`，2026-11-06。状态来自既有日志、实验文档及设备使用者确认，本次未执行设备测试。节点注册、驱动加载与功能可用分别评价，见 [证据索引](../evidence/README.md)。

## 系统与硬件独立状态

| 项目 | Armbian | fnOS | 依据与限制 |
| --- | --- | --- | --- |
| CPU / 用户空间 | AArch64；Debian 13 / `6.12.114-ophub` | AArch64；Debian 12 / `6.12.41-trim #219` | [启动摘录](../evidence/verified-boot.txt)；[fnOS 记录](research/fnos-lcd-full-record-2026-11-04.md)；未做 CPU 稳定性验收 |
| USB 根文件系统 | `/dev/sda2` ext4 已挂载 | `/dev/sda2` Btrfs 有记录 | 两套文件系统与脚本参数不能混用；长时读写/异常断电待测 |
| USB 集线器 / 键盘 | 初始提交与硬件记录称使用成功，缺独立 USB/input 原始输出 | 未找到独立验证记录 | 不从 USB 根盘启动推定全部外设可用 |
| Ethernet / SSH | 有成功 SSH、DNS、HTTPS 摘录；网络文档记载 100 Mbps，DHCP/DNS 曾间歇失败 | SSH、100 Mbps 全双工本轮确认；吞吐未测 | [网络记录](network.md)；100 Mbps 链路不等于吞吐结果 |
| Web 管理页 | 不适用 | 本轮管理首页 HTTP 200 | [实机核查](../evidence/fnos-live-check-2026-11-06.md)；NAS 功能另测 |
| HDMI | 操作者确认控制台画面 | 早期记录有 HDMI 模式及画面；LCD 独占时禁用 HDMI | 热插拔、色彩、模式兼容未验收 |
| MIPI DSI / 背光 | **尚未测试** | 已点亮；实测普通画面完整、颜色正常，无可见折叠/抖动 | [11 月 6 日记录](research/fnos-display-resolution-record-2026-11-06.md)；旧记录的 Armbian 归属冲突见 [审计](audit.md#材料冲突与处理) |
| 显示方向 | 内屏尚未测试 | 原生 800×1280，横屏终端 1280×800 | fbcon 旋转不改变 DRM 物理模式，也不旋转所有 framebuffer 应用 |
| 自动修复 | 有共享源码/服务；内屏未测 | 有 live 模块/文件哈希与本次服务日志；旧旋转服务已移除，保留启动参数旋转 | 不由 `RemainAfterExit=yes` 推定显示或跨重启可靠性 |
| 触摸 | 未完成实际芯片确认及功能测试 | 未完成实际芯片确认及功能测试 | 历史 input 列表未枚举；原厂 DT 候选不等于实物识别 |
| GPU | 历史资料称 Panfrost/render 节点注册，缺独立原始输出；加速待测 | 附录有 Panfrost 初始化与 render 节点记录；加速待测 | 驱动注册不等于渲染/视频解码验证 |
| Wi-Fi | 未验证 | **已验证 PCIe Gen2 枚举、`w2_comm`/`w2` 加载、`wlan0` 注册及 2.4G/5G 扫描**；长期连接吞吐待测 | [Wi-Fi 记录](wifi.md) · [取证摘录](../evidence/fnos-wifi-bringup-2026-11-07.txt)；板载芯片为 Amlogic W2 (`1f35:0642`)，走原生 PCIe 而非借用 DTB 的 SDIO |
| 音频 | 历史汇总含声卡注册及 DAI 错误；缺可归属的完整日志 | 未找到独立扬声器/麦克风验收 | 两套系统均不能标为音频可用 |
| 蓝牙 / 摄像头 | 待识别与测试 | 待识别与测试 | 无成功功能证据 |
| 温度 / 功耗 | 历史资料称 thermal zones 注册；准确性、温控与功耗待测 | 缺独立验证 | 不能据此宣称长期稳定 |
| eMMC | 测试 DTB 禁用，无安装验收 | 实验记录禁用，无安装验收 | 不表示内核不支持；原厂 Android 保留不是写入保护保证 |
| SD | 未验证；面板 overlay 禁用借用的 SD 节点 | 记录禁用以避开 LCD 引脚冲突 | 不能宣称 SD 启动或读写可用 |

## 设备识别与标称规格


| 项目 | 记录 |
| --- | --- |
| 整机/平台 | 中国电信天翼智屏 C10H，创维 SK-L1001；原厂平台 `p291_iptv` |
| SoC | Amlogic S905L3A；实验 Linux 为 AArch64 |
| 内存 | 标称 2 GB；测试 Linux 约 1.89 GiB 可用 |
| 内置存储 | 标称 64 GB eMMC 5.0；Android 侧识别约 58.2 GiB |
| 原厂系统 | Android 9、Linux 4.9.113、ARM32 用户空间 |
| 内屏 | 10.1 英寸 IPS，JD9366TC；`C_JD9366TC_Single_CSOT_10.1_BPA107LT1-1`，原厂选择 `lcd_8` |
| 背光 | PWM_C / GPIOC_4，25 kHz、正常极性 |
| 音频资料 | 原厂样机资料记载双扬声器、CSK6012 阵列麦克风；Linux 可用性未验收 |

标称规格来自 [原厂 Android 样机记录](https://github.com/Arrow36/tianyi-c10h-skyworth-SK-L1001-mod)。面板参数见 [显示概览](display.md)，系统版本见 [项目首页](../README.md)。

Linux model 字符串 `SKYWORTH E900V22C` 来自基线 DTB。标称 2 GB/64 GB 不等于 Linux 本次精确测量；约 1.89 GiB/58.2 GiB 仅有历史汇总，原始内存/块设备输出不在公开证据摘录中。原厂 ARM32 `.ko` 不能直接装入当前 ARM64 6.12 内核。

## fnOS 本轮现场核查

[新实机记录](../evidence/fnos-live-check-2026-11-06.md)直接确认 fnOS 的 100 Mbps 全双工 Ethernet、SSH、管理首页 HTTP 200、USB Btrfs 根挂载、DSI/背光和当前正常横屏。清理前两服务均有本次启动日志；随后按使用者要求移除旧旋转服务，保留启动参数与显示修复服务。以上补充更新表内“缺独立速率/HTTP证据”的历史审计状态，不扩展为吞吐、NAS 工作负载、冷启动或 Armbian 内屏验收。
