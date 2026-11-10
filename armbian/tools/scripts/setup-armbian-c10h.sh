#!/bin/bash
# ==============================================================================
# Skyworth SK-L1001 / China Telecom C10H Armbian One-Click Setup Script
# Configures:
#   1. Chinese locales & WenQuanYi CJK fonts (fixes blank squares)
#   2. Jadard JD9366TC Multi-touch Daemon & Systemd Service
#   3. X11 Touchscreen Calibration & Transformation Rules
#   4. Chromium Touch Gestures, Smooth Scrolling & Overlay Scrollbars
#   5. Onboard Virtual Keyboard Desktop Autostart & Schema Dependencies
# ==============================================================================

set -e

if [ "$(id -u)" -ne 0 ]; then
    echo "[!] This script must be run as root. Use: sudo $0"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARMBIAN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== [1/5] Installing Required Dependencies & Fonts ==="
apt-get update
apt-get install -y --no-install-recommends \
    fonts-wqy-microhei \
    fonts-wqy-zenhei \
    gsettings-desktop-schemas \
    onboard \
    python3-evdev \
    scrot \
    network-manager \
    x11-utils

echo "=== [2/5] Configuring Chinese Locale (zh_CN.UTF-8) ==="
sed -i 's/# zh_CN.UTF-8 UTF-8/zh_CN.UTF-8 UTF-8/' /etc/locale.gen || true
locale-gen || true

echo "=== [3/5] Installing Jadard Touch Daemon ==="
cp "$ARMBIAN_ROOT/tools/c10h-touch/c10h-touch-daemon.py" /usr/local/bin/c10h-touch-daemon.py
chmod +x /usr/local/bin/c10h-touch-daemon.py

cp "$ARMBIAN_ROOT/systemd/c10h-touch.service" /etc/systemd/system/c10h-touch.service
systemctl daemon-reload
systemctl enable --now c10h-touch.service

echo "=== [4/5] Configuring X11 & Chromium Flags ==="
mkdir -p /etc/X11/xorg.conf.d/
cp "$ARMBIAN_ROOT/configs/xorg/40-touchscreen.conf" /etc/X11/xorg.conf.d/40-touchscreen.conf

mkdir -p /etc/chromium.d/
cp "$ARMBIAN_ROOT/configs/chromium/custom-flags" /etc/chromium.d/custom-flags

echo "=== [5/5] Configuring Onboard Virtual Keyboard Autostart ==="
mkdir -p /etc/xdg/autostart/
cp "$ARMBIAN_ROOT/configs/autostart/onboard.desktop" /etc/xdg/autostart/onboard.desktop

echo "=== Setup Completed Successfully! Please reboot or restart X11. ==="
