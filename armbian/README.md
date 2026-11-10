# 天翼智慧屏 C10H / 创维 SK-L1001 Armbian 适配套件

本目录包含了创维 SK-L1001（天翼智慧屏 C10H，Amlogic S905L3A）在 **Armbian 26.11.0 Bookworm (Debian 12, Linux 6.12.114-ophub)** 下的完整驱动代码、服务单元、配置文件及部署脚本。

与飞牛（fnOS）系统独立，所有 Armbian 专有组件集中于本目录，便于按需安装与移植。

---

## 目录结构

```
armbian/
├── README.md                              # 本说明文档
├── docs/
│   └── c10h_armbian_exploration_report.md # 完整适配与逆向技术探索报告
├── systemd/
│   └── c10h-touch.service                 # 触控驱动开机自启 systemd 服务
├── tools/
│   ├── c10h-touch/
│   │   └── c10h-touch-daemon.py           # JD9366TC Multi-touch Protocol B 触控守护进程
│   └── scripts/
│       ├── setup-armbian-c10h.sh          # 一键安装部署配置脚本
│       └── run_remote.py                  # 远程开发与维护自动化脚本（双 IP 支持）
├── configs/
│   ├── xorg/
│   │   └── 40-touchscreen.conf            # X11 libinput 触控屏类匹配与单位变换矩阵配置
│   ├── chromium/
│   │   └── custom-flags                   # Chromium 浏览器触控手势、平滑滚动及无沙箱配置
│   └── autostart/
│       └── onboard.desktop                # Onboard 屏幕虚拟键盘桌面自启动项
└── drivers/
    └── c10h-wifi/                         # Linux 6.12.114-ophub 内核下 W2 PCIe 结构体补丁与说明
```

---

## 特性与已实现能力

1. **1280×800 正向横屏显示**：
   - 驱动华星光电 10.1 寸 MIPI-DSI 原生 800×1280 竖屏面板。
   - X11 环境 `xrandr --output DSI-1 --rotate left` 保持横向正立，任务栏在顶部，硬件加速正常。
2. **Jadard JD9366TC TDDI In-Cell 触控全面打通**：
   - 包含专有 `0xF2` 序列握手与后门解锁（芯片 ID `0x9032`）。
   - Linux 原生 Multi-Touch Protocol B + `INPUT_PROP_DIRECT` 支持。
   - 8px 硬件消抖死区滤波，确保点按桌面图标、菜单和虚拟键盘 100% 灵敏响应。
3. **板载 W2 PCIe Wi-Fi (`1f35:0642`) 连网**：
   - PCIe 链路复位唤醒，成功加载驱动生成 `wlan0`。
   - 接入 NetworkManager，开机自动连接家庭 Wi-Fi，系统托盘实时显示网络状态。
4. **中文支持与屏幕软键盘**：
   - 预装文泉驿微米黑/正黑，彻底消除浏览器中文字符白块（豆腐块）乱码。
   - Onboard 虚拟键盘开机自动悬浮显示在屏幕底部，支持完全无实体键盘的触控操作。
5. **Chromium 浏览器硬件与触控优化**：
   - 绑定 touch-devices、touch-events 及平滑滚动。
   - 支持单指拖曳与平滑滚动、捏合缩放（Pinch-to-zoom）。

---

## 快速安装与使用

在刚刚刷入并启动好的 Armbian C10H 设备上，执行一键配置脚本即可完成所有驱动与环境的安装：

```bash
cd armbian/tools/scripts
sudo bash setup-armbian-c10h.sh
```

脚本将自动完成：
1. 安装中文字体、虚拟键盘依赖与 `python3-evdev`。
2. 配置系统中文本地化 `zh_CN.UTF-8`。
3. 部署 `c10h-touch-daemon.py` 并启用 `c10h-touch.service` 开机自启。
4. 配置 X11 触控规则及 Chromium 触屏手势参数。
5. 开启 Onboard 虚拟键盘随桌面自启动。

安装完成后重启系统即可享用完整的 Linux 桌面平板环境。
