#!/bin/bash
# ==============================================================================
# C10H Smart Screen Wayland Kiosk Starter Script
# Launches Cage compositor and hardware-accelerated Chromium kiosk
# ==============================================================================

export XDG_RUNTIME_DIR=/run/user/1000
export LIBSEAT_BACKEND=seatd
export WLR_DRM_NO_MODIFIERS=1

# Defaults
KIOSK_URL="http://127.0.0.1:5666"
ROTATION_ARGS="-r"
ENABLE_TOUCH_KEYBOARD=1
ENABLE_BROWSER_NAV=1
ENABLE_TOUCH_SCROLL=1
DEFAULT_INPUT_MODE="xiaohe"

# Source persistent system configuration
[ -f /etc/c10h-kiosk.env ] && source /etc/c10h-kiosk.env

mkdir -p "$XDG_RUNTIME_DIR" /home/arrow/.config/c10h-kiosk-chrome
chmod 700 "$XDG_RUNTIME_DIR"

# Generate runtime configuration for web extension
CONFIG_FILE="/usr/local/share/c10h-touch-keyboard/config.js"
if [ -d "/usr/local/share/c10h-touch-keyboard" ]; then
    cat <<EOF > "$CONFIG_FILE"
window.__C10H_CONFIG = {
  enableKeyboard: ${ENABLE_TOUCH_KEYBOARD:-1},
  enableNav: ${ENABLE_BROWSER_NAV:-1},
  enableTouchScroll: ${ENABLE_TOUCH_SCROLL:-1},
  defaultInputMode: "${DEFAULT_INPUT_MODE:-xiaohe}"
};
EOF
fi

exec cage $ROTATION_ARGS -s -- chromium \
    --ozone-platform=wayland \
    --enable-features=UseOzonePlatform,CanvasOopRasterization \
    --touch-events=enabled \
    --load-extension=/usr/local/share/c10h-touch-keyboard \
    --disable-extensions-except=/usr/local/share/c10h-touch-keyboard \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-component-update \
    --check-for-update-interval=31536000 \
    --autoplay-policy=no-user-gesture-required \
    --no-first-run \
    --password-store=basic \
    --renderer-process-limit=2 \
    --js-flags="--max_old_space_size=256" \
    --disk-cache-size=10485760 \
    --user-data-dir=/home/arrow/.config/c10h-kiosk-chrome \
    "$KIOSK_URL"
