# C10H W2 PCIe Wi-Fi Driver Notes for Armbian (Linux 6.12.114-ophub)

在 Armbian 官方提供的 6.12 内核（如 `6.12.114-ophub`）中，内核主线源码树的 `struct dw_pcie` 结构体相较于旧版 `6.12.41-trim` 发生了一个指针偏移的变化：
- 结构体 `struct dw_pcie` 中由于内核补丁差异，`struct dw_pcie_rp pp` 的偏移量为 `0x58` (88 字节)。
- 如果编译 `c10h_pcie.ko` 时直接使用原版头文件，会导致 `dw_pcie_read_dbi` 时访问空指针产生 Kernel Oops。
- 在 `struct dw_pcie` 中添加填充对齐：
  ```c
  struct dw_pcie {
      struct device       *dev;
      void __iomem        *dbi_base;
      void __iomem        *dbi_base2;
      u32                 num_lanes;
      u32                 link_gen;
      u8                  n_fts[2];
      u32                 num_ob_windows;
      u32                 region_align;
      u64                 region_limit;
      u64                 _pad_kernel_6_12; /* Match Linux 6.12.114 ophub offset (0x58 = 88) */
      struct dw_pcie_rp   pp;
      ...
  };
  ```
- 编译后生成的模块：`c10h_pcie.ko`, `w2_comm.ko`, `w2.ko`。
- 加载后即可在 `lspci` 探测到 `1f35:0642` 并成功生成 `wlan0` 网络接口。
