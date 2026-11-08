# 重启到飞牛 (Reboot to fnOS) - Android App

针对创维 C10H / SK-L1001 (S905L3A) 电视盒定制的安卓端一键重启引导工具。

## 功能介绍
当盒子运行在安卓系统下，需要切换启动到外置介质（U盘 / TF卡）中的飞牛 fnOS (Linux) 时，由于非 Root 普通应用在 Android 9 下直接执行 `/system/xbin/su` 会报 `Permission denied`，本应用内置多级提权与引导触发机制：
1. **系统 Init 服务触发（最稳）**：通过固件内置的 `telecom_shell` 服务（`root` 权限进程），执行 `/system/bin/reboot update`；
2. **内核属性控制**：下发 `sys.powerctl = reboot,update`；
3. **系统二进制调用**：直接调用系统级 `/system/bin/reboot update`；
4. **SuperSU / Magisk 提权回退**；
5. **系统电源管理 API 回退** (`PowerManager.reboot("update")`)。

点击按钮后，设备将瞬间下发指令关机并从 U盘/TF卡 引导启动进入飞牛 fnOS。

## 安装方式
1. **ADB 安装**：
   ```bash
   adb connect <盒子IP>:5555
   adb install -r RebootToFnOS.apk
   ```
2. **U盘安装**：
   将 `RebootToFnOS.apk` 拷入 U 盘，在当贝桌面或自带文件管理器中点击安装。

## 源码与编译
源码位于本目录下的 `src/` 与 `res/`，使用原生 AOSP AAPT2 + D8 即可极简编译。