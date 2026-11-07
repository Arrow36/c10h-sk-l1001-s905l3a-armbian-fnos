# 天翼智屏 C10H / SK-L1001 Linux 适配记录

创维 SK-L1001（中国电信天翼智屏 C10H，Amlogic S905L3A）的外置 Linux 启动、板级适配和显示研究。主要开发基线为 Armbian，同一台设备也运行了社区 ARM fnOS。

**fnOS 内屏已实测显示正常；Armbian 内屏尚未测试。** 项目仍属实验性移植，未完成整机外设、长期运行及完整恢复流程验收；仓库提供源码、配置示例与研究记录，没有完整预制系统镜像或一键安装方案。

## 设备与研究目标

研究设备为 C10H / SK-L1001，原厂平台标识 `p291_iptv`。内屏为 JD9366TC、四通道 MIPI DSI、RGB888，物理扫描模式为 **800×1280**；横屏终端呈现为 **1280×800**。当前目标是在外置介质上启动 Linux，并逐项验证显示与其他外设。

Linux 中出现的 `SKYWORTH E900V22C` 来自借用的设备树，不是实物型号或新增兼容设备。标称硬件与信息来源见 [硬件说明](docs/hardware.md)。

## 已验证的成果

- **Armbian 外置启动与有线调试**：U 盘根文件系统、systemd 多用户启动、有线 SSH、HDMI 控制台，以及一次 DNS/HTTPS 访问结果。见 [启动证据摘录](evidence/verified-boot.txt)与 [网络记录](docs/network.md)。自动联网曾间歇失败，不能视为每次启动均可联网。
- **fnOS 外置启动与内屏点亮**：`6.12.41-trim #219` 环境中，DSI 主机/面板绑定，禁用 HDMI 后内屏独占当前 CRTC。早期画面存在分区、重复与偏色，见 [完整实验及终端输出](docs/research/fnos-lcd-full-record-2026-11-04.md)。
- **fnOS 普通画面恢复正常**：11 月 6 日记录及设备使用者后续确认，VPU/DSI 寄存器调整后画面完整、颜色正常、无可见折叠或抖动，并实现 1280×800 横屏控制台。见 [修复记录](docs/research/fnos-display-resolution-record-2026-11-06.md)。这是指定设备与配置的实际成果；不等于量化色彩准确度或长期可靠性认证。
- **自动修复方案已有实现与部署记录**：提供独立 MMIO 工具、systemd 单元，以及后续加入面板驱动的写入路径。见 [实现导航](#技术实现与源码导航)与 [证据评价](evidence/README.md)。已采集当前模块/文件指纹及本次启动日志；精确源码构建对应、两条修复路径的独立贡献和跨重启成功率仍待验证。
- **fnOS 板载 Amlogic W2 PCIe Wi-Fi (`1f35:0642`) 枚举与双频扫描验证**：通过独立 PCIe 控制器初始化驱动 [`c10h_pcie.c`](drivers/c10h-wifi/c10h_pcie.c) 与 ARM64 对齐修复补丁 [`w2-arm64-6.12-fixes.patch`](drivers/c10h-wifi/w2-arm64-6.12-fixes.patch)，在 `6.12.41-trim #219` 下实测完成冷启动 PCIe Gen2 x1 握手、固件握手、`wlan0` / `p2p0` / `ap0` 接口注册及 2.4GHz / 5GHz 双频热点扫描。见 [Wi-Fi 适配记录](docs/wifi.md)与 [实机取证摘录](evidence/fnos-wifi-bringup-2026-11-07.txt)。长期关联吞吐与 Armbian 侧适配仍待验证。

## Armbian / fnOS 独立状态

“已验证”指已有记录中的指定设备与配置；“未测试/待验证”不等于硬件不受支持。详细证据、归属冲突和外设状态见 [硬件表](docs/hardware.md)与 [证据索引](evidence/README.md)。

| 项目 | Armbian | 社区 ARM fnOS |
| --- | --- | --- |
| 记录中的系统 | Debian 13 Trixie；`6.12.114-ophub` | fnOS 1.1.20 / Debian 12；`6.12.41-trim #219` |
| U 盘启动与根文件系统 | 已验证，`/dev/sda2` ext4 | 已记录成功，`/dev/sda2` Btrfs |
| 引导与内置 eMMC | Android update 路径 → U-Boot 一次性脚本；测试 DTB 禁用 eMMC | 有同类启动与禁用 eMMC 的记录；实际配套脚本/DTB 不在仓库 |
| Ethernet / SSH | 已验证；DHCP/DNS 有过间歇问题 | SSH、100 Mbps 全双工本轮已确认；长期联网未验收 |
| fnOS Web 管理页 | 不适用 | 本轮首页 HTTP 200；未据此验收 NAS 工作负载 |
| HDMI 控制台 | 已确认 | 早期已记录；LCD 独占配置禁用 HDMI |
| MIPI DSI / 背光 | **内屏尚未测试** | 已点亮，普通画面显示正常 |
| 分辨率与方向 | 内屏尚未测试 | 原生 800×1280；横屏控制台 1280×800 |
| 色彩、折叠与抖动 | 内屏尚未测试 | 实测颜色正常、无可见折叠或抖动 |
| 开机修复 | 源码/服务可供适配，未作内屏实测 | 显示修复服务保持运行；控制台由 `fbcon=rotate:3` 旋转，旧旋转服务已移除 |
| SD / eMMC 安装 | 未验证；内屏 overlay 禁用借用的 SD 节点 | 未验证；实验记录禁用 SD/eMMC |
| 板载 Wi-Fi (`1f35:0642`) | 未验证 | **已枚举并完成 2.4G/5G 扫描**（`wlan0`/`p2p0`/`ap0`）；长期连接吞吐待测 |
| 触摸、音频、蓝牙、摄像头、GPU 加速 | 均未完成实际功能验收 | 均未完成实际功能验收 |

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
| [boot/](boot/) · [启动容器生成器](tools/make_boot_script.py) | 一次性 U-Boot 脚本与实验模板；UUID、文件系统和路径须与镜像一致，脚本不导入 `uEnv.txt` |
| [eMMC DTB 工具](tools/disable_emmc.py) · [dts/](dts/) | 基线 eMMC 节点修改、面板/PWM/DSI overlay；Wi-Fi overlay 是失败/未验证实验 |
| [面板驱动](drivers/c10h-display/panel-c10h-jd9366tc.c) · [初始化表](drivers/c10h-display/c10h-panel-init.h) | JD9366TC 上电、DCS 初始化、800×1280 模式，以及 `prepare()` 中的固定地址 MMIO 写入 |
| [DSI 主机](drivers/c10h-display/c10h-dsi-host.c) · [驱动目录](drivers/c10h-display/) | 基于 Meson 驱动的实验适配，按实际位时钟配置 PHY，配置 HS/VS 极性 |
| [PCIe 主控驱动](drivers/c10h-wifi/c10h_pcie.c) · [W2 补丁](drivers/c10h-wifi/w2-arm64-6.12-fixes.patch) · [Wi-Fi 服务](systemd/c10h-wifi-power.service) | S905L3A PCIe Gen2 硬件时序初始化、Amlogic W2 ARM64 `Device-nGnRE` 对齐修复与模块加载脚本 |
| [MMIO 工具](tools/c10h-display-fix.c) · [修复服务](systemd/c10h-display-fix.service) · [旋转服务](systemd/c10h-fbcon-rotate.service) | 用户态寄存器写入与开机单元；有实现不代表当前设备已运行该版本 |
| [显示探针](experiments/display/) · [取证脚本](scripts/) | DRM 几何图、Canvas/寄存器快照、硬件彩条与启动记录；部分工具会写硬件或切换图层 |

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
