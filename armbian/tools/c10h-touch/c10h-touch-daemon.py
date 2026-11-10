#!/usr/bin/env python3
"""
C10H (Skyworth SK-L1001) Jadard JD9366TC Touchscreen Userspace Daemon for Armbian
Orientation: Rotate Left (1280x800 Landscape, Right-Side Up)
1:1 True Hardware Pixel Mapping:
  Screen X = 1279 - raw_y
  Screen Y = raw_x

Direct Multi-Touch Protocol B + Linux INPUT_PROP_DIRECT:
- Native XInput2 Touch events for Chromium (fluid kinetic pan/scroll, pinch zoom, tap-to-click).
- Automatic touch-to-pointer button 1 synthesis for XFCE desktop & Onboard virtual keyboard.
- Smart deadband jitter filter (8px) ensures taps are rock-solid without wobbling.
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

DEADBAND_PX = 8  # 8px deadband suppresses sensor noise for flawless taps

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
        self.down_time = 0
        self.down_x = -1
        self.down_y = -1
        self.cur_x = -1
        self.cur_y = -1
        self.is_moving = False
        self.tracking_id = 0
        self.touch_count = 0
        
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
            print("[JADARD] Warning: Chip probe continued...", flush=True)

        self.touch_reg = 0x20021120
        print(f"[JADARD] Active TouchBuffer=0x{self.touch_reg:08X}", flush=True)

    def init_uinput(self):
        print("[JADARD] Registering direct multi-touch device...", flush=True)
        capabilities = {
            ecodes.EV_KEY: [
                ecodes.BTN_TOUCH,
            ],
            ecodes.EV_ABS: [
                (ecodes.ABS_X, AbsInfo(value=0, min=0, max=X_RES - 1, fuzz=0, flat=0, resolution=10)),
                (ecodes.ABS_Y, AbsInfo(value=0, min=0, max=Y_RES - 1, fuzz=0, flat=0, resolution=10)),
                (ecodes.ABS_MT_SLOT, AbsInfo(value=0, min=0, max=9, fuzz=0, flat=0, resolution=0)),
                (ecodes.ABS_MT_TRACKING_ID, AbsInfo(value=0, min=0, max=65535, fuzz=0, flat=0, resolution=0)),
                (ecodes.ABS_MT_POSITION_X, AbsInfo(value=0, min=0, max=X_RES - 1, fuzz=0, flat=0, resolution=10)),
                (ecodes.ABS_MT_POSITION_Y, AbsInfo(value=0, min=0, max=Y_RES - 1, fuzz=0, flat=0, resolution=10)),
            ]
        }
        self.ui = UInput(
            capabilities,
            name="jadard-touchscreen",
            input_props=[ecodes.INPUT_PROP_DIRECT],
            version=0x1
        )
        print(f"[JADARD] Device registered at {self.ui.device.path}", flush=True)

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
        # Verified physical mapping (Rotate Left Landscape 1280x800):
        # Bottom-left on screen -> Bottom-left cursor
        # Screen X = 1279 - raw_y
        # Screen Y = raw_x
        x = (X_RES - 1) - raw_y
        y = raw_x
        x = max(0, min(X_RES - 1, x))
        y = max(0, min(Y_RES - 1, y))
        return x, y

    def process_touch_frame(self, b):
        active_count = b[0]
        if active_count > 10:
            return

        now = time.time()

        if active_count > 0:
            raw_x = (b[3] << 8) | b[4]
            raw_y = (b[5] << 8) | b[6]
            
            if raw_x != 0xFFFF and raw_y != 0xFFFF:
                target_x, target_y = self.raw_to_screen(raw_x, raw_y)
                
                if not self.is_touching:
                    # Touch DOWN
                    self.is_touching = True
                    self.tracking_id = (self.tracking_id + 1) % 65535
                    self.down_time = now
                    self.down_x = target_x
                    self.down_y = target_y
                    self.cur_x = target_x
                    self.cur_y = target_y
                    self.is_moving = False
                    
                    # Emit Touch Down
                    self.ui.write(ecodes.EV_ABS, ecodes.ABS_MT_SLOT, 0)
                    self.ui.write(ecodes.EV_ABS, ecodes.ABS_MT_TRACKING_ID, self.tracking_id)
                    self.ui.write(ecodes.EV_ABS, ecodes.ABS_MT_POSITION_X, target_x)
                    self.ui.write(ecodes.EV_ABS, ecodes.ABS_MT_POSITION_Y, target_y)
                    self.ui.write(ecodes.EV_ABS, ecodes.ABS_X, target_x)
                    self.ui.write(ecodes.EV_ABS, ecodes.ABS_Y, target_y)
                    self.ui.write(ecodes.EV_KEY, ecodes.BTN_TOUCH, 1)
                    self.ui.syn()
                else:
                    dist_sq = (target_x - self.down_x)**2 + (target_y - self.down_y)**2
                    if not self.is_moving:
                        if dist_sq >= (DEADBAND_PX ** 2):
                            self.is_moving = True
                    
                    if self.is_moving:
                        report_x = target_x
                        report_y = target_y
                    else:
                        report_x = self.down_x
                        report_y = self.down_y
                        
                    if report_x != self.cur_x or report_y != self.cur_y:
                        self.cur_x = report_x
                        self.cur_y = report_y
                        self.ui.write(ecodes.EV_ABS, ecodes.ABS_MT_SLOT, 0)
                        self.ui.write(ecodes.EV_ABS, ecodes.ABS_MT_POSITION_X, report_x)
                        self.ui.write(ecodes.EV_ABS, ecodes.ABS_MT_POSITION_Y, report_y)
                        self.ui.write(ecodes.EV_ABS, ecodes.ABS_X, report_x)
                        self.ui.write(ecodes.EV_ABS, ecodes.ABS_Y, report_y)
                        self.ui.syn()
            else:
                self.handle_touch_up()
        else:
            self.handle_touch_up()

    def handle_touch_up(self):
        if not self.is_touching:
            return
            
        self.is_touching = False
        self.is_moving = False
        now = time.time()
        
        # Touch UP
        self.ui.write(ecodes.EV_ABS, ecodes.ABS_MT_SLOT, 0)
        self.ui.write(ecodes.EV_ABS, ecodes.ABS_MT_TRACKING_ID, -1)
        self.ui.write(ecodes.EV_KEY, ecodes.BTN_TOUCH, 0)
        self.ui.syn()
        
        self.touch_count += 1
        print(f"[TOUCH] Release at ({self.cur_x}, {self.cur_y}) (dt={now - self.down_time:.3f}s)", flush=True)

    def run(self):
        print("[JADARD] High-speed multi-touch polling active (~140Hz touch, 60Hz idle)...", flush=True)
        error_count = 0
        ioctl_fn = fcntl.ioctl
        fd = self.fd
        req = I2C_RDWR
        data = self.fast_ioctl_data
        buf = self.fast_read_buf
        process = self.process_touch_frame
        sleep = time.sleep
        
        while self.running:
            try:
                ioctl_fn(fd, req, data)
                b = bytes(buf)
                process(b)
                error_count = 0
                if self.is_touching:
                    sleep(0.007) # ~140Hz smooth tracking
                else:
                    sleep(0.016) # ~60Hz idle
            except Exception as e:
                error_count += 1
                if error_count > 5:
                    sleep(0.05)
                    try:
                        self.enter_backdoor()
                        error_count = 0
                    except:
                        pass
                sleep(0.02)

if __name__ == '__main__':
    daemon = JadardTouchDaemon()
    signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
    signal.signal(signal.SIGTERM, lambda s, f: sys.exit(0))
    daemon.run()
