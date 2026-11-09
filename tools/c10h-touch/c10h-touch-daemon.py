#!/usr/bin/env python3
"""
C10H (Skyworth SK-L1001) Jadard JD9366TC Touchscreen Userspace Daemon
High-speed 140Hz fast-poll absolute pointer driver for Cage and Chromium kiosk mode.
"""

import os
import sys
import time
import fcntl
import ctypes
import signal
from evdev import UInput, ecodes, AbsInfo

I2C_DEV = "/dev/i2c-0"
I2C_ADDR = 0x68
I2C_SLAVE = 0x0703
I2C_M_RD = 0x0001
I2C_RDWR = 0x0707

X_RES = 1280
Y_RES = 800

class i2c_msg(ctypes.Structure):
    _fields_ = [
        ('addr', ctypes.c_ushort),
        ('flags', ctypes.c_ushort),
        ('len', ctypes.c_ushort),
        ('buf', ctypes.POINTER(ctypes.c_char))
    ]

class i2c_rdwr_ioctl_data(ctypes.Structure):
    _fields_ = [
        ('msgs', ctypes.POINTER(i2c_msg)),
        ('nmsgs', ctypes.c_uint)
    ]

class JadardTouchDaemon:
    def __init__(self):
        self.running = True
        self.is_touching = False
        self.last_x = -1
        self.last_y = -1
        
        self.open_i2c()
        self.init_chip()
        self.init_uinput()
        self.prepare_fast_io()

    def open_i2c(self):
        self.fd = os.open(I2C_DEV, os.O_RDWR)
        fcntl.ioctl(self.fd, I2C_SLAVE, I2C_ADDR)

    def enter_backdoor(self):
        payload = bytes([0xF2, 0xAA, 0x55, 0x0F, 0xF0, 0x68])
        os.write(self.fd, payload)
        time.sleep(0.01)

    def reg_read_f3(self, reg, length):
        write_buf = (ctypes.c_char * 6)(
            0xF3,
            (reg >> 24) & 0xFF,
            (reg >> 16) & 0xFF,
            (reg >> 8) & 0xFF,
            reg & 0xFF,
            0x03
        )
        read_buf = (ctypes.c_char * length)()
        msgs = (i2c_msg * 2)(
            i2c_msg(addr=I2C_ADDR, flags=0, len=6, buf=write_buf),
            i2c_msg(addr=I2C_ADDR, flags=I2C_M_RD, len=length, buf=read_buf)
        )
        ioctl_data = i2c_rdwr_ioctl_data(msgs=msgs, nmsgs=2)
        fcntl.ioctl(self.fd, I2C_RDWR, ioctl_data)
        return bytes(read_buf)

    def init_chip(self):
        print("[JADARD] Connecting to JD9366T IC via I2C backdoor...", flush=True)
        for attempt in range(5):
            try:
                self.enter_backdoor()
                time.sleep(0.02)
                id_bytes = self.reg_read_f3(0x40008076, 2)
                chip_id = id_bytes[0] | (id_bytes[1] << 8)
                if chip_id == 0x9032:
                    print(f"[JADARD] Chip ID 0x9032 verified on attempt {attempt+1}", flush=True)
                    break
            except Exception:
                time.sleep(0.1)
        else:
            raise RuntimeError("Failed to detect JD9366T IC (ID != 0x9032)")

        self.touch_reg = 0x20021120
        print(f"[JADARD] Active TouchBuffer=0x{self.touch_reg:08X}", flush=True)

    def init_uinput(self):
        print("[JADARD] Registering absolute pointer device...", flush=True)
        capabilities = {
            ecodes.EV_KEY: [ecodes.BTN_LEFT],
            ecodes.EV_ABS: [
                (ecodes.ABS_X, AbsInfo(value=0, min=0, max=X_RES - 1, fuzz=0, flat=0, resolution=0)),
                (ecodes.ABS_Y, AbsInfo(value=0, min=0, max=Y_RES - 1, fuzz=0, flat=0, resolution=0)),
            ]
        }
        self.ui = UInput(
            capabilities,
            name="jadard-touch-pointer"
        )
        print(f"[JADARD] Absolute pointer device registered at {self.ui.device.path}", flush=True)

    def prepare_fast_io(self):
        reg = self.touch_reg
        self.fast_write_buf = (ctypes.c_char * 6)(
            0xF3,
            (reg >> 24) & 0xFF,
            (reg >> 16) & 0xFF,
            (reg >> 8) & 0xFF,
            reg & 0xFF,
            0x03
        )
        self.fast_read_buf = (ctypes.c_char * 7)()
        self.fast_msgs = (i2c_msg * 2)(
            i2c_msg(addr=I2C_ADDR, flags=0, len=6, buf=self.fast_write_buf),
            i2c_msg(addr=I2C_ADDR, flags=I2C_M_RD, len=7, buf=self.fast_read_buf)
        )
        self.fast_ioctl_data = i2c_rdwr_ioctl_data(msgs=self.fast_msgs, nmsgs=2)

    def raw_to_screen(self, raw_x, raw_y):
        # 1:1 In-Cell Hardware Pixel Mapping:
        # Long axis runs horizontally: Screen X = 1279 - raw_y
        # Short axis runs vertically:   Screen Y = raw_x
        x = 1279 - raw_y
        y = raw_x
        
        x = max(0, min(X_RES - 1, x))
        y = max(0, min(Y_RES - 1, y))
        return x, y

    def process_touch_frame(self, b):
        active_count = b[0]
        if active_count > 10:
            return

        if active_count > 0:
            raw_x = (b[3] << 8) | b[4]
            raw_y = (b[5] << 8) | b[6]
            
            if raw_x != 0xFFFF and raw_y != 0xFFFF:
                target_x, target_y = self.raw_to_screen(raw_x, raw_y)
                
                if not self.is_touching:
                    self.is_touching = True
                    self.last_x = target_x
                    self.last_y = target_y
                    self.ui.write(ecodes.EV_ABS, ecodes.ABS_X, target_x)
                    self.ui.write(ecodes.EV_ABS, ecodes.ABS_Y, target_y)
                    self.ui.write(ecodes.EV_KEY, ecodes.BTN_LEFT, 1)
                    self.ui.syn()
                    print(f"[TOUCH] DOWN at Screen=({target_x}, {target_y}) (Raw={raw_x},{raw_y})", flush=True)
                else:
                    if target_x != self.last_x or target_y != self.last_y:
                        self.last_x = target_x
                        self.last_y = target_y
                        self.ui.write(ecodes.EV_ABS, ecodes.ABS_X, target_x)
                        self.ui.write(ecodes.EV_ABS, ecodes.ABS_Y, target_y)
                        self.ui.syn()
        else:
            if self.is_touching:
                self.is_touching = False
                self.ui.write(ecodes.EV_KEY, ecodes.BTN_LEFT, 0)
                self.ui.syn()
                print("[TOUCH] UP", flush=True)

    def run(self):
        print("[JADARD] High-speed polling active (~140Hz touch, 60Hz idle)...", flush=True)
        error_count = 0
        while self.running:
            try:
                fcntl.ioctl(self.fd, I2C_RDWR, self.fast_ioctl_data)
                # Convert ctypes array to bytes so b[0] is int (0..255)
                b = bytes(self.fast_read_buf)
                self.process_touch_frame(b)
                error_count = 0
                
                if self.is_touching:
                    time.sleep(0.005) # ~140Hz smooth drag
                else:
                    time.sleep(0.015) # ~60Hz idle poll
            except Exception as e:
                error_count += 1
                if error_count > 5:
                    print(f"[JADARD] Error in poll loop: {e}", flush=True)
                    time.sleep(0.05)
                    try:
                        self.enter_backdoor()
                        error_count = 0
                    except:
                        pass
                time.sleep(0.02)

    def stop(self):
        self.running = False
        if hasattr(self, 'ui'):
            self.ui.close()
        if hasattr(self, 'fd'):
            os.close(self.fd)

if __name__ == '__main__':
    daemon = JadardTouchDaemon()
    def sig_handler(sig, frame):
        daemon.stop()
        sys.exit(0)
    signal.signal(signal.SIGINT, sig_handler)
    signal.signal(signal.SIGTERM, sig_handler)
    daemon.run()
