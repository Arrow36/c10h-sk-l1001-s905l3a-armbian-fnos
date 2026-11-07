# C10H 板载 Amlogic W2 PCIe Wi-Fi (`1f35:0642`) 驱动与适配记录

天翼智屏 C10H（创维 SK-L1001，Amlogic S905L3A）板载无线网卡为 **Amlogic W2 (`1f35:0642`)**，通过 **S905L3A 原生 PCIe Gen2 x1 (`0xfc000000`)** 连接，而非 SDIO。已在社区 ARM fnOS（`Linux 6.12.41-trim #219 aarch64`）上完成实机冷启动枚举、固件加载、`wlan0` / `p2p0` / `ap0` 接口创建及 2.4GHz / 5GHz 双频 Wi-Fi 扫描验证。

---

## 1. 硬件拓扑与上电时序 (`c10h_pcie.ko`)

原厂 Android 4.9 (`g12a_s905l3a_skt.dts`) 与实机寄存器分析确认硬件拓扑如下：

1. **PCIe 电源域与总线复位**：
   - `AO_RTI_GEN_PWR_SLEEP0` (`0xff8000e8`) bit 18 置 `0`；
   - `HHI_MEM_PD_REG0` (`0xff63c100`) bits `29:26` 置 `0`；
   - `AO_RTI_GEN_PWR_ISO0` (`0xff8000ec`) bit 18 置 `0`；
   - **注意**：在冷启动状态下，若未开启上述电源域与解除 `RESET0_LEVEL` (`0xffd01080`) bits `12/14/15` 即直接读取 `PCIE_CFG_STATUS12` (`0xff648030`)，将触发 ARM64 同步外部中止（`synchronous external abort`）。[`c10h_pcie.c`](../drivers/c10h-wifi/c10h_pcie.c) 已加入电源域与复位状态预检。
2. **32.768 kHz 低功耗参考时钟 (`PWM_E` -> `GPIOX_16`)**：
   - 不能通过遍历 `/sys/class/pwm/pwmchip*` 导出 PWM（会覆盖 LCD 背光 PWM 导致黑屏）；
   - 直接配置 `PWM_E` (`0xffd19000`) 输出 32.768 kHz，并将 `PERIPHS_PIN_MUX_B` (`0xff6346d4`) `GPIOX_16` 设为 Function 1 (`PWM_E`)。
3. **G12A/SM1 100 MHz PCIe HCSL 参考时钟 PLL**：
   - 主线 Linux 6.12 的 `clk-meson-g12a` 驱动对 S905L3A 的 `pcie_pll` 锁定序列不兼容（报错 `pll pcie_pll didn't lock`）；
   - [`c10h_pcie.c`](../drivers/c10h-wifi/c10h_pcie.c) 直接按 Amlogic 序列配置 `HHI_PCIE_PLL_CNTL0..5` (`0xff63c098..0xff63c0ac`) 并使能 100 MHz CML 输出。
4. **控制引脚 (`GPIOX_5` / `GPIOX_6` / `GPIOX_17`)**：
   - 将 `GPIOX_5`、`GPIOX_6` (`WL_REG_ON`)、`GPIOX_17` (`PCIE_PERST#`) 设为 GPIO 输出并拉低 50ms，随后拉高 `GPIOX_6` 与 `GPIOX_17` 100ms，最后在 DBI 初始化完成后将三者全部拉高并启动 LTSSM (`PCIE_CFG_0` bit 7)，实现稳定 PCIe Gen2 x1 握手 (`STATUS12=0x00014470`)。

---

## 2. Amlogic W2 驱动 (`w2.ko`) ARM64 6.12 内核崩溃修复

原厂 W2 驱动 (`w2-aml-2.3.4-r3.7.2_2026-07.25-w2`) 在 ARM64 Linux 6.12 下加载时存在两处致命问题，均已定位并修复：

1. **BAR2 (`ep_bar2_addr`) `Device-nGnRE` 未对齐内存访问崩溃 (`alignment fault 0x96000021`)**：
   - `w2_comm` 使用 `pci_ioremap_bar(pdev, 2)` 映射 PCIe BAR2，ARM64 下属性为 `Device-nGnRE`；
   - 原厂驱动在 `aml_utils.c` (`aml_msgind`)、`aml_platform.c` (`aml_Check_fw_is_compressible`)、`ipc_host.c` (`ipc_host_init`) 中直接对 `aml_hw->ipc_env->shared` 使用普通 `memcpy` / `memset` 或结构体强转解引用，在 ARM64 下被编译为非对齐指令触发内核 Oops，导致 `amlw_irqhdlr` 线程死亡、`MM_VERSION_REQ` 超时 (`-110`)；
   - **修复**：统一替换为 `memcpy_fromio()` / `memset_io()`。
2. **64 位指针转 32 位无符号偏移溢出 (`aml_fw_trace.c`)**：
   - `aml_fw_trace_buf_init()` 将 64 位内核虚拟地址差值截断为 `uint32_t` 偏移并在超时转储时反向寻址，导致二次崩溃；
   - **修复**：在 `aml_fw_trace_buf_init()` 中直接返回 `-ENOENT` 禁用不兼容的 32 位偏移固件 trace。
3. **编译参数**：
   - 编译时必须显式传入 `CONFIG_AML_PLATFORM_ANDROID=n`：
     ```bash
     make ARCH=arm64 CROSS_COMPILE= KERNELDIR=/lib/modules/$(uname -r)/build CONFIG_AML_PLATFORM_ANDROID=n -j4
     ```

---

## 3. 开机自启服务 (`c10h-wifi-power.service`)

- 模块安装路径：
  - `/lib/modules/6.12.41-trim/extra/c10h_pcie.ko`
  - `/lib/modules/6.12.41-trim/kernel/drivers/net/wireless/amlogic/w2_comm.ko`
  - `/lib/modules/6.12.41-trim/kernel/drivers/net/wireless/amlogic/w2.ko`
- 服务配置（`/etc/systemd/system/c10h-wifi-power.service`）必须置于 `After=c10h-display-fix.service network.target NetworkManager.service` 并设置 `TimeoutStartSec=30`，防止任何模块异常阻塞有线网口 `eth0` 初始化。
