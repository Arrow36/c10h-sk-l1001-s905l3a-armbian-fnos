# C10H (创维 SK-L1001) 触控屏逆向驱动与 1:1 像素校准指南

天翼智屏 C10H (创维 SK-L1001 / Amlogic S905L3A) 搭载 10.1 英寸 800×1280 华星光电 (CSOT) IPS 内屏，触控采用 **Jadard (集创北方) JD9366TC TDDI (In-Cell)** 触控显示一体化架构。

本文档详细记录触控总线探测、后门握手时序、140Hz 高频极速轮询机制、1:1 硬件像素校准与 uinput 驱动服务配置。

---

## 1. 硬件总线与芯片探测

* **接口类型**：I2C 总线，连接至 S905L3A 的 `/dev/i2c-0`
* **I2C 设备从机地址**：`0x68`
* **芯片型号**：Jadard JD9366TC（Chip ID: `0x9032`）
* **触控架构**：TDDI (Touch and Display Driver Integration / In-Cell)，触控电极直接做在液晶屏幕内部。

### 1.1 芯片后门握手与解锁 (Backdoor Unlock)
Jadard TDDI 控制芯片在上电后处于受保护状态，通用的 Linux Goodix / Focaltech 内核驱动无法直接读取坐标，需通过 vendor 后门指令解锁总线：
```python
# 解锁握手序列
payload = bytes([0xF2, 0xAA, 0x55, 0x0F, 0xF0, 0x68])
os.write(i2c_fd, payload)
```

### 1.2 芯片 ID 校验与触控数据寄存器
* **Chip ID 寄存器**：`0x40008076`，读取 2 字节，返回值固定为 `0x9032`。
* **实时触控缓冲寄存器**：`0x20021120`，读取 7 字节即可获取完整的单帧触控状态与绝对坐标。

---

## 2. 触控数据帧协议解析

向寄存器 `0x20021120` 发起 7 字节读取操作，返回数据格式如下：

| 字节偏移 | 字段含义 | 说明 |
| :--- | :--- | :--- |
| `byte[0]` | Active Count | 触控点状态（`0`=无触摸，`1`~`10`=当前有效触摸点数量） |
| `byte[1:2]` | Reserved | 保留状态字 |
| `byte[3:4]` | Raw X | 触控原生 X 坐标（高位在先 `byte[3] << 8 \| byte[4]`），范围 `0 ~ 799` |
| `byte[5:6]` | Raw Y | 触控原生 Y 坐标（高位在先 `byte[5] << 8 \| byte[6]`），范围 `0 ~ 1279` |

---

## 3. 1:1 硬件像素映射与校准机制

### 3.1 为什么之前“越靠边缘偏离越大”？
在初期适配中，尝试采用通用校准公式与人工缩放系数（如乘以比例常数）。但实测发现：**在屏幕中心点击是准的，越往四角和边缘偏离越严重**。

根本原因在于：
1. 本屏幕是 **In-Cell TDDI 一体屏**，触控采样单元物理上与 800×1280 液晶像素点是一一对应的。
2. 物理屏幕原生方向为竖屏（宽 800，高 1280）。
3. 当在 Wayland Kiosk 中使用 Cage 顺时针旋转 90 度 (`-r`) 成为 1280×800 横屏时：
   - 物理长边变成了屏幕横轴（0 ~ 1279）
   - 物理短边变成了屏幕纵轴（0 ~ 799）

### 3.2 终极 1:1 像素校准公式
无需任何浮点数比例系数缩放，直接采用 1:1 物理像素变换：
```python
def raw_to_screen(raw_x, raw_y):
    # 物理长边映射为横向 X 轴 (0 ~ 1279)
    screen_x = 1279 - raw_y
    # 物理短边映射为纵向 Y 轴 (0 ~ 799)
    screen_y = raw_x
    
    # 边界保护
    screen_x = max(0, min(1279, screen_x))
    screen_y = max(0, min(799, screen_y))
    return screen_x, screen_y
```
实测证明：无论在屏幕中央、边缘还是四个死角，定位精度均达到亚毫米级别，彻底解决边缘漂移问题。

---

## 4. 140Hz 高频极速轮询驱动设计

为了让手指在屏幕上拖拽滑动达到丝滑无卡顿，驱动程序对 I2C 通信进行了底层优化：
1. **预分配内存结构体**：使用 Python `ctypes` 预分配 `i2c_msg` 和 `i2c_rdwr_ioctl_data`，避免每次循环的内存分配与垃圾回收开销。
2. **极短通信周期**：单次 I2C 读事务仅传输 7 字节，总耗时由原先全缓冲读取的 18ms 骤降至 **2.19ms**。
3. **自适应轮询率**：
   - 当检测到手指按下时：进入 **140Hz 极速追踪模式**（休眠 5ms），滑动轨迹与系统光标完全同步。
   - 当无触摸闲置时：降频至 60Hz 节能模式（休眠 15ms），CPU 占用率低于 0.8%。

---

## 5. 用户空间 UInput 虚拟设备

驱动通过 Linux 内核的 `/dev/uinput` 接口注册原生指针设备：
* **设备名称**：`jadard-touch-pointer`
* **事件类型**：
  - `EV_ABS`: `ABS_X` (0 ~ 1279), `ABS_Y` (0 ~ 799)
  - `EV_KEY`: `BTN_LEFT` (1=按下, 0=抬起)
Wayland Cage 合成器与 Chromium 自动捕获该设备，无需安装额外的 X11 驱动。

---

## 6. 服务部署与自启动

* **驱动代码**：[`tools/c10h-touch/c10h-touch-daemon.py`](../tools/c10h-touch/c10h-touch-daemon.py)
* **服务配置**：[`systemd/c10h-touch.service`](../systemd/c10h-touch.service)

```bash
# 安装驱动
sudo cp tools/c10h-touch/c10h-touch-daemon.py /usr/local/bin/
sudo chmod +x /usr/local/bin/c10h-touch-daemon.py

# 注册开机自启服务
sudo cp systemd/c10h-touch.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now c10h-touch.service

# 查看运行状态
sudo systemctl status c10h-touch.service
```
