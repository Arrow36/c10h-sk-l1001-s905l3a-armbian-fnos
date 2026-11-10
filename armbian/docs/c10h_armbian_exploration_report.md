# 天翼智慧屏 C10H (Skyworth SK-L1001) Armbian 适配探索与成果完整总结

> **设备型号**：天翼智慧屏 C10H / 创维 Skyworth SK-L1001  
> **核心处理器**：Amlogic S905L3A (Quad-core Cortex-A53, Mali-G31 MP2)  
> **系统平台**：Armbian 26.11.0 Bookworm (Debian 12, Linux Kernel `6.12.114-ophub`)  
> **引导媒介**：USB 闪存盘 (`/dev/sda1` FAT32 启动区 + `/dev/sda2` ext4 根文件系统)

---

## 一、 硬件配置全景

| 硬件模块 | 硬件芯片 / 规格参数 | 接口总线 / 拓扑 | 原厂 Android 状态 | Armbian 现阶段达成状态 |
| :--- | :--- | :--- | :--- | :--- |
| **SoC** | Amlogic S905L3A | 内部总线 | 正常运行 (Android 9 32位) | **100% 正常** (Linux 6.12 64位全核心运行) |
| **内存/存储** | 2GB DDR4 + 64GB eMMC | MMC 接口 | 正常运行 | **100% 正常** (可自由读写 eMMC 与 USB) |
| **显示屏幕** | 10.1 寸 CSOT (华星光电) 800×1280 竖屏 | 4-lane MIPI-DSI | 正常显示 | **100% 正常** (X11 1280×800 正向横屏硬件加速) |
| **触摸芯片** | Jadard JD9366TC TDDI In-Cell 触控 | I2C-0 (地址 `0x68`) | 闭源内核驱动加载 | **100% 逆向突破** (开源 Userspace 驱动 140Hz 运作) |
| **无线网卡** | Onboard W2 PCIe Wi-Fi (`1f35:0642`) | PCIe x1 总线 | 内核专有模块 `w2.ko` | **100% 打通** (`wlan0` 成功握手 Wi-Fi 并联网) |
| **红外遥控** | meson-ir | 内部专用 IR RX | 正常运行 | **100% 正常** (内核自动支持) |
| **屏幕软键盘** | Onboard Virtual Keyboard | X11 悬浮窗口 | 原生输入法 | **100% 正常** (700×205 悬浮键盘开机常驻) |
| **网页浏览器** | Chromium 156 (Debian Bookworm) | X11 Desktop | 系统预装 Chrome | **100% 正常** (中文字体补齐、触控参数深度优化) |

---

## 二、 核心攻关探索过程与关键突破

### 1. 引导启动与主线内核适配（U-Boot / DTB）
- **引导机制**：基于 Amlogic U-Boot 的 Autoscript 与 `uEnv.txt` 链式引导，通过 USB 外置存储引导进入 Armbian 系统，保留了机身原厂 eMMC 的 Android 固件完整不受损。
- **设备树匹配**：选用兼容 S905L3A/SM1 的通用设备树并修正 MIPI-DSI 节点、时钟树分频与 GPIO 引脚分配，确保主线内核能顺利探测核心外设。

### 2. 显示屏幕打通（MIPI-DSI & DRM KMS 1280×800 正向横屏）
- **硬件物理特性**：屏幕面板物理原生为 800×1280 竖屏面板，在底座放置状态下，使用者视觉为 1280×800 横屏。
- **背光控制**：逆向确认背光使能与 PWM 控制引脚，系统启动后自动解除背光睡眠。
- **横屏正向旋转**：在 X11 与 LightDM 阶段通过 `xrandr --output DSI-1 --rotate left`（或内核 modesetting 旋转）实现 1280×800 宽屏输出，桌面任务栏位于顶部，方向完全符合桌面平板人机工程学。

### 3. 触摸屏底层逆向工程（Jadard JD9366TC TDDI）
这是整个适配过程中技术难度最高、耗时最长的一环：
1. **通信阻断与后门握手破解**：
   - JD9366TC 属于面板与触控一体的 TDDI 架构芯片。在普通 Linux I2C 探测中，芯片会处于休眠锁定状态（直接读取 `0x68` 会产生 I2C NAK）。
   - 我们对原厂 Android 内核反编译逆向分析，提取到了专有的后门解锁序列（Magic Backdoor Sequence）：
     ```python
     payload = bytes([0xF2, 0xAA, 0x55, 0x0F, 0xF0, 0x68])
     ```
     写入该序列后，芯片成功应答，回读芯片 ID `0x9032`（JD9366T 系列专属硬件 ID），成功打通 I2C 总线握手。
2. **高速触控数据帧解析**：
   - 逆向确认有效触控缓冲区地址为 `0x20021120`。
   - 使用 I2C `0xF3` 寄存器读写协议，编写 ctypes 零拷贝 `i2c_rdwr_ioctl`，实现单帧仅 7 字节的高速流水线轮询，在低 CPU 占用下维持 ~140Hz 的高频采样。
3. **坐标映射与轴向反转**：
   - 针对 1280×800 Rotate Left 的屏幕布局，推导并确立了严密的数学映射模型：
     $$\text{Screen } X = 1279 - \text{raw\_y}$$
     $$\text{Screen } Y = \text{raw\_x}$$
   - 彻底解决了早期滑动时“左下角跑到右上角”的中心轴反转问题，实现 1:1 绝对像素精确贴合。
4. **多点触控（Multi-Touch Protocol B）与消抖引擎**：
   - 通过 Linux `uinput` 子系统注册带有 `INPUT_PROP_DIRECT` 的多点触控设备，支持 `ABS_MT_SLOT`、`ABS_MT_TRACKING_ID`、`ABS_MT_POSITION_X/Y`。
   - 设计了 8px Deadband 滤波消抖引擎，彻底隔离触控 IC 原生微颤，保证桌面图标、面板按钮和虚拟键盘按键 100% 敏捷触发。

### 4. 板载无线网卡打通（W2 PCIe `1f35:0642`）
1. **PCIe 链路唤醒**：
   - 板载 W2 芯片由独立 PCIe 控制器连接，开机时默认处于低功耗下电状态。
   - 通过控制专用 PCIe 复位 GPIO 并重新扫描总线，PCIe 树上成功枚举出 `00:00.0 Network controller [0280]: 1f35:0642`。
2. **内核外置模块加载与固件挂载**：
   - 加载底层支撑模块 `c10h_pcie.ko`、`w2_comm.ko` 和网络核心驱动 `w2.ko`。
   - 成功生成 `wlan0` 无线网络接口，加载 `/lib/firmware/w2/` 射频固件。
3. **网络与托盘服务**：
   - 启用 NetworkManager 并接入系统状态栏 `nm-applet`。
   - 成功扫描周围 Wi-Fi 热点，连接至用户无线网络，通过 DHCP 获取 IP，内网与外网完全畅通。

### 5. 桌面与应用生态交付（XFCE4 + Chromium + 中文支持）
1. **中文语言与字体库完善**：
   - 生成 `zh_CN.UTF-8` 本地化环境。
   - 安装文泉驿微米黑与正黑（`fonts-wqy-microhei`、`fonts-wqy-zenhei`），彻底修复中文字符显示为白色方框（豆腐块）的问题，页面与系统汉字显示清晰美观。
2. **Chromium 浏览器部署与调优**：
   - 针对 Armbian Bookworm 安装 Debian 官方 ARM64 Chromium 浏览器包。
   - 配置 `/etc/chromium.d/custom-flags`，自动追加优化参数：
     - `--no-sandbox --test-type`：解决 root 环境启动限制。
     - `--touch-events=enabled --enable-pinch --enable-smooth-scrolling`：启用触屏专用手势与平滑滚动。
     - 动态检测并绑定触控设备 ID (`--touch-devices=$TOUCH_ID`)。
     - `--enable-features=OverlayScrollbar`：触屏自适应滚动条。
3. **板载屏幕软键盘（Onboard）常驻**：
   - 修复原系统缺失 `gsettings-desktop-schemas` 导致的 Python 屏幕保护探测崩溃。
   - 配置 XFCE 自启动项，屏幕底部常驻 700×205 软键盘，实现完全脱离物理键盘的触控输入交互。

---

## 三、 本地与设备端代码资产归档索引

全部源码与配置文件均已同步保存在本地开发目录及板端相应路径：

| 资产路径 (本地 / 设备端) | 作用说明 |
| :--- | :--- |
| `tools/c10h-touch/c10h-touch-daemon.py`<br>`/usr/local/bin/c10h-touch-daemon.py` | JD9366TC 触控芯片用户态驱动核心脚本（I2C握手、坐标解算、消抖与 uinput 事件发射） |
| `/etc/systemd/system/c10h-touch.service` | 触控守护进程 Systemd 服务单元（开机自动拉起、异常崩溃自动秒级重拉） |
| `/etc/X11/xorg.conf.d/40-touchscreen.conf` | Xorg libinput 触控屏类匹配与单位变换矩阵配置 |
| `/etc/chromium.d/custom-flags` | Chromium 浏览器运行配置（触屏手势、平滑滚动、无沙箱及中文显示参数） |
| `scratch/run_remote.py` | 具备双 IP 容灾（Wi-Fi `192.168.5.30` / 以太网 `192.168.137.50`）与 SFTP 上传下载的高性能自动化维护工具 |

---

## 四、 总结与后续建议

经过这一系列的底层攻关，这台原本运行封闭 Android 系统的智能音箱/智慧屏，已经彻底蜕变为一台功能完备、开机即用的 **ARM64 Linux 桌面微型平板计算机**：
- **屏幕清晰**：1280×800 高清横屏显示，色彩鲜艳；
- **全无线化**：脱离了网线束缚，板载 PCIe Wi-Fi 稳定联机；
- **触控可用**：支持单指轻点、拖动与软键盘输入；
- **功能完备**：具备完整的 Debian 软件仓库生态，Chromium 浏览网页流畅，可胜任桌面仪表盘、家庭智能中控屏、轻量代码调试终端或流媒体播放器等多种角色。
