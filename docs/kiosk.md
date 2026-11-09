# C10H Wayland Kiosk 仪表盘与触控副屏套件

天翼智屏 C10H (创维 SK-L1001 / Amlogic S905L3A) 10.1 英寸内屏的极简图形化副屏方案。基于 Wayland 原生架构，集成了触控输入法、手势拖拽滚动、浏览器顶部导航栏以及 GPU 性能深度调优，并提供完整的模块化可选项控制。

---

## 1. 架构特点

* **合成器**：`cage` (基于 `wlroots` 的轻量级单窗口 Kiosk Wayland 合成器)。
* **输入捕获**：`seatd` 守护进程与内核 `/dev/uinput` 原生绝对坐标指针对接。
* **屏幕旋转**：参数 `-r`（顺时针旋转 90 度），直接匹配 C10H 1280×800 横屏物理显示。
* **渲染核心**：Chromium (Wayland Ozone 原生模式，硬件加速渲染节点 `/dev/dri/renderD128`)。
* **轻量低耗**：整机内存占用约 200MB ~ 250MB，为飞牛 NAS 自身存储服务保留充裕内存。

---

## 2. 交互套件功能特性

### 2.1 虚拟触控输入法 (Virtual Keyboard)
* **全功能键盘**：支持字母、数字、常用符号切换与大小写锁定。
* **双模中文输入**：
  - **小鹤双拼 (默认推荐)**：双键高效输入，按键表面直观标注小鹤双拼声韵母助记提示（如 `Q iu`, `W ei`, `R uan`, `U sh`, `I ch`, `V zh/ui` 等）。
  - **全拼输入**：传统全拼即拼即显，点击输入法状态徽标即可实时切换。
* **零跳动候选词栏**：采用固高 38px 候选词横栏，无论是候选词展开还是空状态，按键位置均保持绝对静止，彻底消除跳键现象。

### 2.2 触屏拖拽滑动 (Kinetic Touch Scroll)
* 针对网页版 NAS 及各类第三方后台优化，按住屏幕空白处滑动即可实现如手机平板般的平滑滚动，并自带防止滑动误触保护。

### 2.3 顶部网址导航条 (Browser Navigation Bar)
* 默认吸顶折叠，轻触把手自动展开。
* 提供后退、前进、刷新、飞牛桌面一键返回按键，并支持直接在输入框输入任意 URL 前往（例如 Home Assistant、天气时钟、B 站或外部网页）。

### 2.4 Mali-G31 GPU 性能优化
* 深度规避 Bifrost GPU 在 1280×800 分辨率下多重高斯模糊着色器的性能瓶颈。
* 全局阻断昂贵的 `backdrop-filter` 模糊特效，彻底解决内核 `panfrost_gem_shrinker_scan` 引起的系统卡顿与 13% I/O Wait，使飞牛桌面与窗口动画维持 60 FPS 满帧运行。

---

## 3. 模块化可选项配置 (自由启停)

浏览器导航栏、输入法及触屏滑动均为**完全可选组件**，用户可根据使用场景自由开启或关闭：

### 方式一：终端命令行一键控制 (`c10h-kiosk-ctl`)
```bash
# 查看当前所有功能状态与亮度
c10h-kiosk-ctl status

# 开启/关闭 触控虚拟输入法
c10h-kiosk-ctl keyboard off   # 关闭虚拟键盘
c10h-kiosk-ctl keyboard on    # 开启虚拟键盘

# 开启/关闭 顶部浏览器导航条
c10h-kiosk-ctl nav off        # 纯净 Kiosk 模式（无地址栏）
c10h-kiosk-ctl nav on         # 显示顶部导航条

# 开启/关闭 触屏拖拽滑动
c10h-kiosk-ctl scroll on
c10h-kiosk-ctl scroll off

# 切换默认中文输入法模式 (xiaohe / quanpin)
c10h-kiosk-ctl input-mode xiaohe
c10h-kiosk-ctl input-mode quanpin

# 切换副屏展示网址
c10h-kiosk-ctl url http://127.0.0.1:5666
c10h-kiosk-ctl url http://192.168.5.x:8123

# 调节背光亮度 (0 ~ 7)
c10h-kiosk-ctl brightness 5
```

### 方式二：屏幕图形化设置弹窗 (UI Settings Modal)
* 点击顶部导航栏或虚拟键盘上的 **`⚙ 设置`** 按钮，屏幕中央将弹出图形化设置面板。
* 可在屏幕上勾选/取消相应选项并选择输入法，点击 **保存并生效** 即可即时应用。
* 若两项均关闭，屏幕左下角仍保留半透明设置齿轮，方便随时调出重新开启。

### 方式三：全局配置文件 (`/etc/c10h-kiosk.env`)
直接编辑配置文件，重启服务即生效：
```bash
# /etc/c10h-kiosk.env
KIOSK_URL="http://127.0.0.1:5666"
ROTATION_ARGS="-r"

# 功能模块开关 (1 为开启，0 为关闭)
ENABLE_TOUCH_KEYBOARD=1
ENABLE_BROWSER_NAV=1
ENABLE_TOUCH_SCROLL=1
DEFAULT_INPUT_MODE="xiaohe"
```

---

## 4. 文件与服务结构

* **启动控制脚本**：[`tools/c10h-kiosk/c10h-kiosk-start.sh`](../tools/c10h-kiosk/c10h-kiosk-start.sh)
* **命令行控制工具**：[`tools/c10h-kiosk/c10h-kiosk-ctl`](../tools/c10h-kiosk/c10h-kiosk-ctl)
* **配置文件模板**：[`tools/c10h-kiosk/c10h-kiosk.env`](../tools/c10h-kiosk/c10h-kiosk.env)
* **WebExtension 扩展源码**：[`tools/c10h-kiosk/c10h-touch-keyboard/`](../tools/c10h-kiosk/c10h-touch-keyboard/)
  - `manifest.json`: Web 扩展清单
  - `config.js`: 启动脚本动态注入的配置桥接
  - `keyboard.js`: 虚拟键盘、小鹤双拼引擎、手势拖拽滑动与设置弹窗
  - `keyboard.css`: GPU 性能优化与暗色扁平亚克力样式
  - `pinyin_dict.js`: 428 个汉语拼音全音节与近万常用汉字紧凑词库
* **系统服务单元**：[`systemd/c10h-kiosk.service`](../tools/c10h-kiosk/c10h-kiosk.service)
