#!/bin/bash
export XDG_RUNTIME_DIR=/run/user/1000
export LIBSEAT_BACKEND=seatd
export WLR_DRM_NO_MODIFIERS=1

# Source config
KIOSK_URL="http://127.0.0.1:5666"
ROTATION_ARGS="-r"
[ -f /etc/c10h-kiosk.env ] && source /etc/c10h-kiosk.env

mkdir -p "$XDG_RUNTIME_DIR" /home/arrow/.config/c10h-kiosk-chrome
chmod 700 "$XDG_RUNTIME_DIR"

exec cage $ROTATION_ARGS -s -- chromium \
    --ozone-platform=wayland \
    --enable-features=UseOzonePlatform \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-component-update \
    --check-for-update-interval=31536000 \
    --autoplay-policy=no-user-gesture-required \
    --no-first-run \
    --password-store=basic \
    --user-data-dir=/home/arrow/.config/c10h-kiosk-chrome \
    "$KIOSK_URL"
