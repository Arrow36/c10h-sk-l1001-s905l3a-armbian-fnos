# C10H Wayland Kiosk 仪表盘副屏系统

针对天翼智屏 C10H (创维 SK-L1001 / Amlogic S905L3A) 10.1 英寸内屏的极简图形化副屏方案。基于 Wayland 原生架构，避免了 X11 繁重的开销，具备原生 GPU 硬件加速与旋转渲染。

---

## 1. 架构特性

* **合成器**：`cage` (基于 `wlroots` 的单窗口 Kiosk Wayland 合成器)。
* **会话管理**：`seatd` 守护进程，提供低延迟 DRM/KMS 访问与输入捕获。
* **屏幕旋转**：参数 `-r`（顺时针旋转 90 度），直接匹配 C10H 1280x800 横屏物理显示。
* **渲染核心**：Chromium (Wayland Ozone 原生模式，硬件加速渲染节点 `/dev/dri/renderD128`)。
* **开机自启**：`c10h-kiosk.service` 随系统自动运行。
* **内存占用**：约 200MB ~ 250MB，为 NAS 自身存储服务保留充裕内存。

---

## 2. 常用控制命令 (`c10h-kiosk-ctl`)

系统内置了 `c10h-kiosk-ctl` 快捷管理脚本：

```bash
# 查看当前仪表盘服务状态与屏幕亮度
c10h-kiosk-ctl status

# 切换展示的网址（支持飞牛后台、时钟天气、Home Assistant、音乐看板等）
c10h-kiosk-ctl url http://127.0.0.1:5666
c10h-kiosk-ctl url http://192.168.5.x:8123

# 调节屏幕亮度 (0 ~ 7)
c10h-kiosk-ctl brightness 5

# 刷新/重启仪表盘
c10h-kiosk-ctl restart

# 临时关闭/开启仪表盘
c10h-kiosk-ctl stop
c10h-kiosk-ctl start

# 设置是否开机自启
c10h-kiosk-ctl enable
c10h-kiosk-ctl disable
```

---

## 3. 配置文件

* 配置文件路径：`/etc/c10h-kiosk.env`
* 启动脚本：`/usr/local/bin/c10h-kiosk-start.sh`
* 服务单元：`/etc/systemd/system/c10h-kiosk.service`
