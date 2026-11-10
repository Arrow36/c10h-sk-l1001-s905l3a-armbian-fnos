# 天翼智屏 C10H / SK-L1001 Linux 适配记录

创维 SK-L1001（中国电信天翼智屏 C10H，Amlogic S905L3A）的外置 Linux 启动、板级适配和显示研究。仓库涵盖社区 ARM fnOS 与 Armbian 两套独立系统方案：
- **社区 ARM fnOS（飞牛私有云 / NAS 系统）**：提供 NAS 工作站、Wayland Cage Kiosk 仪表盘副屏与双模虚拟输入法。
- **Armbian 26.11.0 Bookworm（Debian 12 桌面系统）**：提供完整 XFCE4 桌面、1280×800 正向横屏、JD9366TC 原生多点触控驱动、板载 W2 PCIe Wi-Fi 联网、Chromium 触控手势及 Onboard 屏幕键盘生态。**所有 Armbian 专有源码与配置完全独立归档于 [`armbian/`](armbian/README.md) 目录，不影响飞牛原有代码。**

**fnOS 与 Armbian 内屏均已实测显示正常。** 项目仍属实验性移植，未完成整机外设、长期运行及完整恢复流程验收；仓库提供源码、配置示例与研究记录，没有完整预制系统镜像或一键安装方案。

## 设备与研究目标

研究设备为 C10H / SK-L1001，原厂平台标识 `p291_iptv`。内屏为 JD9366TC、四通道 MIPI DSI、RGB888，物理扫描模式为 **800×1280**；横屏终端呈现为 **1280×800**。当前目标是在外置介质上启动 Linux，并逐项验证显示与其他外设。

Linux 中出现的 `SKYWORTH E900V22C` 来自借用的设备树，不是实物型号或新增兼容设备。标称硬件与信息来源见 [硬件说明](docs/hardware.md)。

## 已验证的成果

- **Armbian 桌面系统全面点亮与交互闭环**：在 Linux Kernel `6.12.114-ophub` 下，实测完成 10.1 寸 MIPI-DSI 内屏正向横屏显示（1280×800）、W2 PCIe 无线网卡自动连接 Wi-Fi、Jadard JD9366TC 原生多点触控（Multi-Touch Protocol B）、中文显示环境、Onboard 悬浮键盘及 Chromium 触屏手势平滑滚动。详见 [Armbian 专区说明](armbian/README.md)与 [深度探索技术总结报告](armbian/docs/c10h_armbian_exploration_report.md)。
- **Armbian 外置启动与有线调试**：U 盘根文件系统、systemd 多用户启动、有线 SSH、HDMI 控制台，以及一次 DNS/HTTPS 访问结果。见 [启动证据摘录](evidence/verified-boot.txt)与 [网络记录](docs/network.md)。自动联网曾间歇失败，不能视为每次启动均可联网。
- **fnOS 外置启动与内屏点亮**：`6.12.41-trim #219` 环境中，DSI 主机/面板绑定，禁用 HDMI 后内屏独占当前 CRTC。早期画面存在分区、重复与偏色，见 [完整实验及终端输出](docs/research/fnos-lcd-full-record-2026-11-04.md)。
- **fnOS 普通画面恢复正常**：11 月 6 日记录及设备使用者后续确认，VPU/DSI 寄存器调整后画面完整、颜色正常、无可见折叠或抖动，并实现 1280×800 横屏控制台。见 [修复记录](docs/research/fnos-display-resolution-record-2026-11-06.md)。这是指定设备与配置的实际成果；不等于量化色彩准确度或长期可靠性认证。
- **自动修复方案已有实现与部署记录**：提供独立 MMIO 工具、systemd 单元，以及后续加入面板驱动的写入路径。见 [实现导航](#技术实现与源码导航)与 [证据评价](evidence/README.md)。已采集当前模块/文件指纹及本次启动日志；精确源码构建对应、两条修复路径的独立贡献和跨重启成功率仍待验证。
- **fnOS 板载 Amlogic W2 PCIe Wi-Fi (`1f35:0642`) 枚举与双频扫描验证**：通过独立 PCIe 控制器初始化驱动 [`c10h_pcie.c`](drivers/c10h-wifi/c10h_pcie.c) 与 ARM64 对齐修复补丁 [`w2-arm64-6.12-fixes.patch`](drivers/c10h-wifi/w2-arm64-6.12-fixes.patch)，在 `6.12.41-trim #219` 下实测完成冷启动 PCIe Gen2 x1 握手、固件握手、`wlan0` / `p2p0` / `ap0` 接口注册及 2.4GHz / 5GHz 双频热点扫描。见 [Wi-Fi 适配记录](docs/wifi.md)与 [实机取证摘录](evidence/fnos-wifi-bringup-2026-11-07.txt)。长期关联吞吐与 Armbian 侧适配仍待验证。
- **触控屏驱动全面点亮与 1:1 硬件像素校准**：实机验证 Jadard JD9366TC TDDI (In-Cell) 芯片走 `/dev/i2c-0` (`0x68`)。通过厂商握手解锁、1:1 硬件像素映射（`Screen_X = 1279 - raw_y`, `Screen_Y = raw_x`）彻底消除边缘偏离，配合 140Hz 高频极速轮询与 uinput 绝对指针，实现亚毫米级精准点触与流畅跟手。详见 [触控驱动记录](docs/touchscreen.md)。
- **fnOS Wayland Kiosk 副屏与交互套件（全模块可选）**：通过 Cage + Chromium 原生硬件加速呈现飞牛桌面。集成双模触控输入法（小鹤双拼 / 全拼）、手势拖拽滑动、浏览器顶部导航条与 GPU 性能优化（规避 `backdrop-filter` 达到 60 FPS 满帧）。导航条与虚拟键盘支持在图形化设置弹窗、命令行工具 `c10h-kiosk-ctl` 及 `/etc/c10h-kiosk.env` 中随时自由启停。详见 [Kiosk 副屏套件](docs/kiosk.md)。

## Armbian / fnOS 独立状态

“已验证”指已有记录中的指定设备与配置；“未测试/待验证”不等于硬件不受支持。详细证据、归属冲突和外设状态见 [硬件表](docs/hardware.md)与 [证据索引](evidence/README.md)。

| 项目 | Armbian 桌面系统 | 社区 ARM fnOS |
| --- | --- | --- |
| 记录中的系统 | Debian 12 Bookworm；`6.12.114-ophub` | fnOS 1.1.20 / Debian 12；`6.12.41-trim #219` |
| U 盘启动与根文件系统 | **已验证**，`/dev/sda2` ext4 | 已记录成功，`/dev/sda2` Btrfs |
| 引导与内置 eMMC | Android update 路径 → U-Boot 链式引导；保留内置 eMMC | 有同类启动与禁用 eMMC 的记录；实际配套脚本/DTB 不在仓库 |
| Ethernet / SSH | **已验证**，100 Mbps 全双工网络与 SSH 调试 | SSH、100 Mbps 全双工本轮已确认；长期联网未验收 |
| fnOS Web 管理页 | 不适用（专注标准 Linux XFCE4 桌面环境） | 本轮首页 HTTP 200；未据此验收 NAS 工作负载 |
| HDMI 控制台 | 已确认 | 早期已记录；LCD 独占配置禁用 HDMI |
| MIPI DSI / 背光 | **已全面点亮**，背光恢复与自动使能 | 已点亮，普通画面显示正常 |
| 分辨率与方向 | **1280×800 正向横屏**（X11 Rotate Left） | 原生 800×1280；横屏控制台 1280×800 |
| 色彩、折叠与抖动 | **实测正常**，色彩鲜艳，无条纹无抖动 | 实测颜色正常、无可见折叠或抖动 |
| 开机修复 | X11 KMS modesetting 原生支持，无需额外 MMIO 补丁 | 显示修复服务保持运行；控制台由 `fbcon=rotate:3` 旋转，旧旋转服务已移除 |
| SD / eMMC 安装 | 未验证；保留原厂 Android 系统 | 未验证；实验记录禁用 SD/eMMC |
| 板载 Wi-Fi (`1f35:0642`) | **已打通并联网**：PCIe 唤醒、`wlan0` 注册、NetworkManager 托盘支持与连网通过 | **已枚举并完成 2.4G/5G 扫描**（`wlan0`/`p2p0`/`ap0`）；长期连接吞吐待测 |
| 触控屏 (JD9366TC) | **已全面验证**：Linux 原生 Multi-Touch Protocol B、8px 消抖、1:1 像素映射、140Hz 极速轮询 | **已全面验证**：1:1 像素映射精准点触、140Hz 轮询无延迟，注册绝对指针 |
| 中文字体与虚拟键盘 | **已全面验证**：文泉驿微米黑/正黑，Onboard 悬浮键盘开机常驻 | 内置小鹤双拼/全拼 Web 虚拟输入法 |
| 网页浏览器 (Chromium) | **已全面验证**：Chromium 156 硬件优化、触屏原生手势与平滑滚屏 | **已全面验证**：Wayland Cage + Chromium 硬件加速，可选虚拟键盘与导航栏 |
| 音频、蓝牙、摄像头 | 待后续专项验证 | 均未完成实际功能验收 |

早期资料将部分显示实验归于 Armbian，与设备使用者后续明确确认冲突；保留原始材料，当前不据此宣称 Armbian 内屏已测。见 [冲突说明](docs/audit.md#材料冲突与处理)。

## 简易研究时间线

日期按现有实验文档或提交记录标示，不将提交时间当作首次发现时间；原厂资料提取的首次日期无法确认。

| 日期 | 研究里程碑 | 依据 |
| --- | --- | --- |
| 2026-11-02 至 11-03（初始记录所列测试区间） | Armbian U 盘启动、HDMI 与有线调试；首次初始化发生扩容，取证脚本曾报错 | [初始提交](https://github.com/Arrow36/c10h-sk-l1001-s905l3a-armbian-fnos/commit/9b53b5d1445c2b73c881e0230615ed30fb7917a0) · [启动摘录](evidence/verified-boot.txt) |
| 2026-11-03（归档日期） | 保存原生 DRM/ENCL、Gamma/HLINE 失败实验与暂停检查点；系统归属存在后述冲突 | [历史检查点](docs/checkpoint-2026-11-03.md) · [显示摘要](evidence/display-2026-11-03.txt) |
| 2026-11-04（研究记录日期） | fnOS 内屏点亮；禁用 HDMI 后自动取得 CRTC，普通画面仍分区/重复 | [fnOS 完整记录](docs/research/fnos-lcd-full-record-2026-11-04.md) |
| 2026-11-04（研究记录日期） | 浏览器 framebuffer 滑杆、通道补偿、全白图和状态采样用于分离颜色与空间故障，尚未完成系统修复 | [滑杆方法](docs/research/browser-slider-method-2026-11-04.md) · [详细纪要](docs/research/fnos-lcd-experiment-log-2026-11-04.md) |
| 2026-11-06（修复记录日期） | fnOS 寄存器调整后显示正常；形成 MMIO 工具、横屏和自启方案，驱动随后加入直接写入实现 | [修复记录](docs/research/fnos-display-resolution-record-2026-11-06.md) · [源码演变与验证边界](docs/audit.md#提交历史与日期口径) |
| 2026-11-07（实测记录日期） | fnOS 下完成 S905L3A 原生 PCIe 控制器独立驱动与 Amlogic W2 ARM64 对齐修复，`wlan0` 双频扫描成功 | [Wi-Fi 记录](docs/wifi.md) · [取证摘录](evidence/fnos-wifi-bringup-2026-11-07.txt) |
| 2026-11-09（实测记录日期） | fnOS 触控驱动逆向点亮、1:1 硬件像素校准与 140Hz 高频轮询；Wayland Kiosk 双模中文虚拟输入法、手势拖拽滑动与浏览器导航栏全面支持，所有功能支持模块化自由启停 | [触控文档](docs/touchscreen.md) · [Kiosk 文档](docs/kiosk.md) |
| 2026-11-10 至 11-11（实测交付日期） | **Armbian 桌面系统全面打通**：内屏 1280×800 正向横屏、W2 PCIe Wi-Fi 成功联网、JD9366TC 原生多点触控与消抖、文泉驿中文字体补齐、Onboard 虚拟键盘及 Chromium 触屏优化，全部源码与配置独立归档于 `armbian/` 目录 | [Armbian 专区说明](armbian/README.md) · [总结报告](armbian/docs/c10h_armbian_exploration_report.md) |

## 启动、构建与研究文档

| 目的 | 入口 |
| --- | --- |
| 准备外置启动 | [启动路径与回退边界](docs/boot.md) → [镜像来源与历史校验值](docs/provenance.md) → [有线网络](docs/network.md) |
| 研究内屏 | [显示概览](docs/display.md) → [11 月 6 日记录](docs/research/fnos-display-resolution-record-2026-11-06.md) → [源码构建](docs/build-display.md) |
| 追溯原始过程 | [研究日志索引](docs/research/README.md) · [文档导航](docs/README.md) |
| 核查真实性与下一步 | [证据索引](evidence/README.md) · [文档审计](docs/audit.md) · [源码审计](docs/code-audit.md) · [验证计划](docs/validation.md) |

整盘写入会覆盖目标介质数据。仓库不提供 eMMC/Bootloader 刷写教程；测试 DTB 禁用 eMMC 只在 Linux 接管后生效，不能约束此前原厂 U-Boot 的烧录/恢复逻辑。一次断电拔盘返回 Android 不等于完整恢复验收。实验前核对目标介质、启动脚本、DTB 与离线回退文件，详见 [启动边界](docs/boot.md)。

## 技术实现与源码导航

| 路径 | 用途及边界 |
| --- | --- |
| **[armbian/](armbian/)** | **Armbian 独立适配套件**：包含多点触控驱动、Systemd 单元、X11/Chromium 规则、Onboard 配置及一键部署脚本 |
| [boot/](boot/) · [启动容器生成器](tools/make_boot_script.py) | 一次性 U-Boot 脚本与实验模板；UUID、文件系统和路径须与镜像一致，脚本不导入 `uEnv.txt` |
| [eMMC DTB 工具](tools/disable_emmc.py) · [dts/](dts/) | 基线 eMMC 节点修改、面板/PWM/DSI overlay；Wi-Fi overlay 是失败/未验证实验 |
| [面板驱动](drivers/c10h-display/panel-c10h-jd9366tc.c) · [初始化表](drivers/c10h-display/c10h-panel-init.h) | JD9366TC 上电、DCS 初始化、800×1280 模式，以及 `prepare()` 中的固定地址 MMIO 写入 |
| [DSI 主机](drivers/c10h-display/c10h-dsi-host.c) · [驱动目录](drivers/c10h-display/) | 基于 Meson 驱动的实验适配，按实际位时钟配置 PHY，配置 HS/VS 极性 |
| [PCIe 主控驱动](drivers/c10h-wifi/c10h_pcie.c) · [W2 补丁](drivers/c10h-wifi/w2-arm64-6.12-fixes.patch) · [Wi-Fi 服务](systemd/c10h-wifi-power.service) | S905L3A PCIe Gen2 硬件时序初始化、Amlogic W2 ARM64 `Device-nGnRE` 对齐修复与模块加载脚本 |
| [MMIO 工具](tools/c10h-display-fix.c) · [修复服务](systemd/c10h-display-fix.service) · [旋转服务](systemd/c10h-fbcon-rotate.service) | 用户态寄存器写入与开机单元；有实现不代表当前设备已运行该版本 |
| [显示探针](experiments/display/) · [取证脚本](scripts/) | DRM 几何图、Canvas/寄存器快照、硬件彩条与启动记录；部分工具会写硬件或切换图层 |
| [安卓重启工具](tools/reboot-to-fnos/) | 安卓端一键重启到飞牛/Linux 应用及源码，通过 telecom_shell root 机制与 sys.powerctl 触发引导 |
| [触控驱动](tools/c10h-touch/c10h-touch-daemon.py) · [触控服务](systemd/c10h-touch.service) | JD9366TC TDDI In-Cell I2C 厂商后门解锁、1:1 像素映射与 140Hz 极速轮询 uinput 绝对指针驱动 |
| [Kiosk 套件](tools/c10h-kiosk/) · [虚拟键盘与导航扩展](tools/c10h-kiosk/c10h-touch-keyboard/) | Wayland Cage Kiosk 启动脚本、`c10h-kiosk-ctl` 快捷控制工具、小鹤双拼/全拼输入法、手势滑动与 GPU 性能调优 |

寄存器值与命名核对集中于 [显示配置表](docs/display.md#寄存器配置与命名核对)。特别是 `0x1DF5` 在仓库头文件中定义为 `VPP_OSD1_BLD_H_SCOPE`，不能直接解释为“1919 深度输出 FIFO”。

## 已知问题与待验证事项

- Armbian 内屏首次测试；触摸、无线、音频等外设实际功能；fnOS 存储与 NAS 工作负载。
- fnOS 当前 DTB/模块/工具哈希与服务本次日志已取得；精确源码构建映射、冷启动和长期负载仍待验证。
- 各寄存器的单独贡献、色彩矩阵和欠载机制；当前目视正常不支持“100% 色彩准确”或“永久稳定”等承诺。
- MMIO 工具映射失败后仍可能返回成功；驱动映射失败与成功日志不一致；服务排序不等于显示硬件就绪。详见 [源码审计](docs/code-audit.md)。
- 原厂完整固件恢复、升级后兼容性与其他批次设备均未验收。

## 上游、参考与致谢

- [ophub/amlogic-s9xxx-armbian](https://github.com/ophub/amlogic-s9xxx-armbian) 与 [ophub/fnnas](https://github.com/ophub/fnnas)：社区系统基础。
- [Calmact/e900v22c](https://github.com/Calmact/e900v22c)：借用板级配置的参考。
- [原厂 Android 研究记录](https://github.com/Arrow36/tianyi-c10h-skyworth-SK-L1001-mod)：原厂硬件与运行参数资料来源。
- [unifreq/linux-6.12.y](https://github.com/unifreq/linux-6.12.y/tree/main/drivers/gpu/drm/meson)：显示驱动参考，具体派生关系仍需结合提交与构建材料。
- [zanjie1999/rk3566-guomeiyun-armbian](https://github.com/zanjie1999/rk3566-guomeiyun-armbian)：提供 U-Boot Logo 初始化显示通路的参考思路，不代表 C10H 兼容 RK3566 配置。

维护者为 Arrow36。本仓库未指定统一许可证；上游及派生文件按各自许可、SPDX 和版权声明处理。

## 本轮 fnOS 实机补证

经 SSH 只读核查，已直接取得 100 Mbps 全双工链路、USB Btrfs 根挂载、DSI 活动 800×1280、rotate=3、模块/工具/DTB哈希、实际 unit 和本次启动服务日志；管理首页 HTTP 200，使用者同时确认实屏正常。见 [实机证据及配置差异](evidence/fnos-live-check-2026-11-06.md)。

这些新证据部分补齐上文的静态审计缺口；精确源码构建对应、寄存器回读、冷启动和长时测试仍未完成。经设备使用者授权，随后已移除实机旧旋转服务；保留 `fbcon=rotate:3`，当前 rotate=3，显示修复服务保持 active。Armbian 内屏仍未测试。
