// SPDX-License-Identifier: GPL-2.0
#include <linux/clk.h>
#include <linux/delay.h>
#include <linux/gpio/consumer.h>
#include <linux/init.h>
#include <linux/io.h>
#include <linux/kernel.h>
#include <linux/mod_devicetable.h>
#include <linux/module.h>
#include <linux/of.h>
#include <linux/of_platform.h>
#include <linux/pci.h>
#include <linux/phy/phy.h>
#include <linux/platform_device.h>
#include <linux/reset.h>
#include <linux/resource.h>
#include <linux/types.h>

#include "pcie-designware.h"

#define to_meson_pcie(x) dev_get_drvdata((x)->dev)

#define PCIE_CAP_MAX_PAYLOAD_SIZE(x)	((x) << 5)
#define PCIE_CAP_MAX_READ_REQ_SIZE(x)	((x) << 12)

#define PCIE_CFG0			0x0
#define APP_LTSSM_ENABLE		BIT(7)

#define PCIE_CFG_STATUS12		0x30
#define IS_SMLH_LINK_UP(x)		((x) & (1 << 6))
#define IS_RDLH_LINK_UP(x)		((x) & (1 << 16))
#define IS_LTSSM_UP(x)			((((x) >> 10) & 0x1f) == 0x11)

#define PCIE_CFG_STATUS17		0x44
#define PM_CURRENT_STATE(x)		(((x) >> 7) & 0x1)

#define WAIT_LINKUP_TIMEOUT		4000
#define MAX_PAYLOAD_SIZE		256
#define MAX_READ_REQ_SIZE		256

enum pcie_data_rate {
	PCIE_GEN1,
	PCIE_GEN2,
	PCIE_GEN3,
	PCIE_GEN4
};

struct meson_pcie_clk_res {
	struct clk *clk;
	struct clk *port_clk;
	struct clk *general_clk;
};

struct meson_pcie_rc_reset {
	struct reset_control *port;
	struct reset_control *apb;
};

struct meson_pcie {
	struct dw_pcie pci;
	void __iomem *cfg_base;
	struct meson_pcie_clk_res clk_res;
	struct meson_pcie_rc_reset mrst;
	struct gpio_desc *reset_gpio;
	struct phy *phy;
};

static int c10h_pcie_hw_bringup(struct device_node *np)
{
	void __iomem *ao_base;
	void __iomem *hhi_base;
	void __iomem *pwm_e;
	void __iomem *periphs_base;
	void __iomem *phy_base;
	void __iomem *reset_base;
	void __iomem *elbi_base;
	void __iomem *cfg_base;
	struct clk *clk_general, *clk_pclk, *clk_port, *clk_ref;
	u32 val, st12, st17;
	int i;

	clk_general = of_clk_get_by_name(np, "general");
	clk_pclk    = of_clk_get_by_name(np, "pclk");
	clk_port    = of_clk_get_by_name(np, "port");
	clk_ref     = of_clk_get_by_name(np, "pcie_refpll");

	if (!IS_ERR(clk_general)) clk_prepare_enable(clk_general);
	if (!IS_ERR(clk_pclk))    clk_prepare_enable(clk_pclk);
	if (!IS_ERR(clk_port))    clk_prepare_enable(clk_port);
	if (!IS_ERR(clk_ref))     clk_prepare_enable(clk_ref);

	ao_base    = ioremap(0xff800000, 0x1000);
	hhi_base   = ioremap(0xff63c000, 0x1000);
	reset_base = ioremap(0xffd01000, 0x1000);
	cfg_base   = ioremap(0xff648000, 0x2000);
	if (!ao_base || !hhi_base || !reset_base || !cfg_base)
		return -ENOMEM;

	if (!(readl(ao_base + 0xe8) & BIT(18)) &&
	    !(readl(hhi_base + 0x100) & GENMASK(29, 26)) &&
	    ((readl(reset_base + 0x80) & (BIT(12) | BIT(14) | BIT(15))) ==
	     (BIT(12) | BIT(14) | BIT(15)))) {
		st12 = readl(cfg_base + PCIE_CFG_STATUS12);
		if (IS_SMLH_LINK_UP(st12) && IS_RDLH_LINK_UP(st12) && IS_LTSSM_UP(st12)) {
			pr_info("c10h_pcie: PCIe link already up (STATUS12=0x%08x)\n", st12);
			iounmap(cfg_base);
			iounmap(reset_base);
			iounmap(hhi_base);
			iounmap(ao_base);
			return 0;
		}
	}

	val = readl(ao_base + 0xe8);
	if (val & BIT(18)) {
		writel(val & ~BIT(18), ao_base + 0xe8);
		udelay(100);
	}
	val = readl(hhi_base + 0x100);
	if (val & GENMASK(29, 26)) {
		writel(val & ~GENMASK(29, 26), hhi_base + 0x100);
		udelay(100);
	}
	val = readl(ao_base + 0xec);
	if (val & BIT(18)) {
		u32 rval = readl(reset_base + 0x80);
		writel(rval & ~BIT(12), reset_base + 0x80);
		udelay(100);
		writel(val & ~BIT(18), ao_base + 0xec);
		udelay(100);
		writel(rval | BIT(12), reset_base + 0x80);
		udelay(100);
	}

	pwm_e = ioremap(0xffd19000, 0x100);
	writel((366 << 16) | 365, pwm_e + 0x00);
	writel((366 << 16) | 364, pwm_e + 0x14);
	writel((11 << 8) | 9,     pwm_e + 0x10);
	val = readl(pwm_e + 0x08);
	val &= ~((0x3 << 4) | (0x7f << 8));
	val |= BIT(15) | BIT(0) | BIT(25);
	writel(val, pwm_e + 0x08);
	iounmap(pwm_e);

	periphs_base = ioremap(0xff634400, 0x400);
	val = readl(periphs_base + 0x2d4);
	val = (val & ~0xff) | 0x01;
	writel(val, periphs_base + 0x2d4);

	val = readl(periphs_base + 0x2cc);
	val &= ~((0xf << 20) | (0xf << 24) | (0xf << 28));
	writel(val, periphs_base + 0x2cc);

	val = readl(reset_base + 0x80);
	val &= ~(BIT(12) | BIT(14) | BIT(15));
	writel(val, reset_base + 0x80);
	udelay(100);

	writel(0x28060464, hhi_base + 0x98);
	writel(0x38060464, hhi_base + 0x98);
	writel(0x00000000, hhi_base + 0x9c);
	writel(0x00001100, hhi_base + 0xa0);
	writel(0x10058e00, hhi_base + 0xa4);
	writel(0x000100c0, hhi_base + 0xa8);
	writel(0x68000048, hhi_base + 0xac);
	writel(0x68000068, hhi_base + 0xac);
	udelay(20);
	writel(0x008100c0, hhi_base + 0xa8);
	udelay(10);
	writel(0x3c060464, hhi_base + 0x98);
	writel(0x1c060464, hhi_base + 0x98);
	udelay(10);
	writel(0x00001000, hhi_base + 0xa0);
	udelay(100);

	val = readl(reset_base + 0x80);
	val |= BIT(15);
	writel(val, reset_base + 0x80);
	udelay(100);

	phy_base = ioremap(0xff646000, 0x2000);
	writel(0x1c, phy_base + 0x00);
	udelay(100);

	val = readl(reset_base + 0x80);
	val |= BIT(14);
	writel(val, reset_base + 0x80);
	mdelay(1);

	val = readl(reset_base + 0x80);
	val |= BIT(12);
	writel(val, reset_base + 0x80);
	mdelay(1);

	val = readl(periphs_base + 0x58);
	val |= BIT(7);
	val &= ~(BIT(5) | BIT(6) | BIT(17));
	writel(val, periphs_base + 0x58);

	val = readl(periphs_base + 0x5c);
	writel(val & ~(BIT(5) | BIT(6) | BIT(17)), periphs_base + 0x5c);
	msleep(50);

	val = readl(periphs_base + 0x5c);
	writel((val & ~BIT(5)) | BIT(6) | BIT(17), periphs_base + 0x5c);
	msleep(100);

	elbi_base = ioremap(0xfc000000, 0x1000);

	val = readl(cfg_base + 0x00);
	val &= ~BIT(7);
	writel(val, cfg_base + 0x00);

	writel(readl(elbi_base + 0x8bc) | BIT(0), elbi_base + 0x8bc);

	val = readl(elbi_base + 0x710);
	val = (val & ~(0x3f << 16)) | (0x1 << 16);
	writel(val, elbi_base + 0x710);

	val = readl(elbi_base + 0x80c);
	val = (val & ~(0x1f << 8)) | (0x1 << 8) | BIT(17);
	writel(val, elbi_base + 0x80c);

	writel(0x0, elbi_base + 0x10);
	writel(0x0, elbi_base + 0x14);

	val = readl(elbi_base + 0x78);
	val = (val & ~((0x7 << 5) | (0x7 << 12))) | (1 << 5) | (1 << 12);
	writel(val, elbi_base + 0x78);

	writel(0x00010100, elbi_base + 0x18);
	writel(0x7, elbi_base + 0x04);

	writel(readl(elbi_base + 0x8bc) & ~BIT(0), elbi_base + 0x8bc);

	val = readl(periphs_base + 0x5c);
	writel(val | BIT(5) | BIT(6) | BIT(17), periphs_base + 0x5c);
	msleep(20);

	val = readl(cfg_base + 0x00);
	val |= BIT(7);
	writel(val, cfg_base + 0x00);

	for (i = 0; i < 50; i++) {
		st12 = readl(cfg_base + PCIE_CFG_STATUS12);
		st17 = readl(cfg_base + PCIE_CFG_STATUS17);
		if (IS_SMLH_LINK_UP(st12) && IS_RDLH_LINK_UP(st12) && IS_LTSSM_UP(st12)) {
			pr_info("c10h_pcie: link up achieved (STATUS12=0x%08x GEN%d)\n",
				st12, PM_CURRENT_STATE(st17) + 1);
			break;
		}
		msleep(10);
	}

	iounmap(elbi_base);
	iounmap(phy_base);
	iounmap(periphs_base);
	iounmap(reset_base);
	iounmap(hhi_base);
	iounmap(ao_base);
	iounmap(cfg_base);

	return 0;
}

static inline u32 meson_cfg_readl(struct meson_pcie *mp, u32 reg)
{
	return readl(mp->cfg_base + reg);
}

static inline void meson_cfg_writel(struct meson_pcie *mp, u32 val, u32 reg)
{
	writel(val, mp->cfg_base + reg);
}

static int meson_size_to_payload(struct meson_pcie *mp, int size)
{
	if (!is_power_of_2(size) || size < 128 || size > 4096)
		return 1;
	return fls(size) - 8;
}

static void meson_set_max_payload(struct meson_pcie *mp, int size)
{
	struct dw_pcie *pci = &mp->pci;
	u32 val;
	u16 offset = dw_pcie_find_capability(pci, PCI_CAP_ID_EXP);
	int max_payload_size = meson_size_to_payload(mp, size);

	val = dw_pcie_readl_dbi(pci, offset + PCI_EXP_DEVCTL);
	val &= ~PCI_EXP_DEVCTL_PAYLOAD;
	dw_pcie_writel_dbi(pci, offset + PCI_EXP_DEVCTL, val);

	val = dw_pcie_readl_dbi(pci, offset + PCI_EXP_DEVCTL);
	val |= PCIE_CAP_MAX_PAYLOAD_SIZE(max_payload_size);
	dw_pcie_writel_dbi(pci, offset + PCI_EXP_DEVCTL, val);
}

static void meson_set_max_rd_req_size(struct meson_pcie *mp, int size)
{
	struct dw_pcie *pci = &mp->pci;
	u32 val;
	u16 offset = dw_pcie_find_capability(pci, PCI_CAP_ID_EXP);
	int max_rd_req_size = meson_size_to_payload(mp, size);

	val = dw_pcie_readl_dbi(pci, offset + PCI_EXP_DEVCTL);
	val &= ~PCI_EXP_DEVCTL_READRQ;
	dw_pcie_writel_dbi(pci, offset + PCI_EXP_DEVCTL, val);

	val = dw_pcie_readl_dbi(pci, offset + PCI_EXP_DEVCTL);
	val |= PCIE_CAP_MAX_READ_REQ_SIZE(max_rd_req_size);
	dw_pcie_writel_dbi(pci, offset + PCI_EXP_DEVCTL, val);
}

static int c10h_pcie_start_link(struct dw_pcie *pci)
{
	struct meson_pcie *mp = to_meson_pcie(pci);
	u32 val;

	val = meson_cfg_readl(mp, PCIE_CFG0);
	val |= APP_LTSSM_ENABLE;
	meson_cfg_writel(mp, val, PCIE_CFG0);
	return 0;
}

static int c10h_pcie_rd_own_conf(struct pci_bus *bus, u32 devfn,
				 int where, int size, u32 *val)
{
	int ret;

	ret = pci_generic_config_read(bus, devfn, where, size, val);
	if (ret != PCIBIOS_SUCCESSFUL)
		return ret;

	if ((where & ~3) == PCI_CLASS_REVISION) {
		if (size <= 2)
			*val = (*val & ((1 << (size * 8)) - 1)) << (8 * (where & 3));
		*val &= ~0xffffff00;
		*val |= PCI_CLASS_BRIDGE_PCI_NORMAL << 8;
		if (size <= 2)
			*val = (*val >> (8 * (where & 3))) & ((1 << (size * 8)) - 1);
	}

	return PCIBIOS_SUCCESSFUL;
}

static struct pci_ops c10h_pci_ops = {
	.map_bus = dw_pcie_own_conf_map_bus,
	.read = c10h_pcie_rd_own_conf,
	.write = pci_generic_config_write,
};

static int c10h_pcie_link_up(struct dw_pcie *pci)
{
	struct meson_pcie *mp = to_meson_pcie(pci);
	u32 state12, state17, smlh_up, ltssm_up, rdlh_up;
	u32 speed_okay = 0;
	u32 cnt = 0;

	do {
		state12 = meson_cfg_readl(mp, PCIE_CFG_STATUS12);
		state17 = meson_cfg_readl(mp, PCIE_CFG_STATUS17);
		smlh_up = IS_SMLH_LINK_UP(state12);
		rdlh_up = IS_RDLH_LINK_UP(state12);
		ltssm_up = IS_LTSSM_UP(state12);

		if (PM_CURRENT_STATE(state17) < PCIE_GEN3)
			speed_okay = 1;

		if (smlh_up && rdlh_up && ltssm_up && speed_okay)
			return 1;

		cnt++;
		udelay(10);
	} while (cnt < WAIT_LINKUP_TIMEOUT);

	return 0;
}

static int c10h_pcie_host_init(struct dw_pcie_rp *pp)
{
	struct dw_pcie *pci = to_dw_pcie_from_pp(pp);
	struct meson_pcie *mp = to_meson_pcie(pci);

	pp->bridge->ops = &c10h_pci_ops;

	meson_set_max_payload(mp, MAX_PAYLOAD_SIZE);
	meson_set_max_rd_req_size(mp, MAX_READ_REQ_SIZE);

	return 0;
}

static const struct dw_pcie_host_ops c10h_pcie_host_ops = {
	.init = c10h_pcie_host_init,
};

static const struct dw_pcie_ops c10h_dw_pcie_ops = {
	.link_up = c10h_pcie_link_up,
	.start_link = c10h_pcie_start_link,
};

static int c10h_pcie_probe(struct platform_device *pdev)
{
	struct device *dev = &pdev->dev;
	struct dw_pcie *pci;
	struct meson_pcie *mp;
	int ret;

	dev_info(dev, "c10h_pcie_probe starting\n");

	mp = devm_kzalloc(dev, sizeof(*mp), GFP_KERNEL);
	if (!mp)
		return -ENOMEM;

	pci = &mp->pci;
	pci->dev = dev;
	pci->ops = &c10h_dw_pcie_ops;
	pci->pp.ops = &c10h_pcie_host_ops;
	pci->num_lanes = 1;

	if (platform_get_resource_byname(pdev, IORESOURCE_MEM, "elbi")) {
		pci->dbi_base = devm_platform_ioremap_resource_byname(pdev, "elbi");
		if (IS_ERR(pci->dbi_base))
			return PTR_ERR(pci->dbi_base);
	}

	mp->cfg_base = devm_platform_ioremap_resource_byname(pdev, "cfg");
	if (IS_ERR(mp->cfg_base))
		return PTR_ERR(mp->cfg_base);

	platform_set_drvdata(pdev, mp);

	ret = dw_pcie_host_init(&pci->pp);
	if (ret < 0) {
		dev_err(dev, "dw_pcie_host_init failed: %d\n", ret);
		return ret;
	}

	dev_info(dev, "c10h_pcie_probe succeeded!\n");
	return 0;
}

static const struct of_device_id c10h_pcie_of_match[] = {
	{ .compatible = "amlogic,c10h-pcie" },
	{},
};
MODULE_DEVICE_TABLE(of, c10h_pcie_of_match);

static struct platform_driver c10h_pcie_driver = {
	.probe = c10h_pcie_probe,
	.driver = {
		.name = "c10h-pcie",
		.of_match_table = c10h_pcie_of_match,
	},
};

static struct platform_device *c10h_pdev;
static char c10h_status_ok[] = "okay";
static char c10h_compat_str[] = "amlogic,c10h-pcie";

static int __init c10h_pcie_init(void)
{
	struct device_node *np;
	struct property *prop_status, *prop_compat;
	int ret;

	np = of_find_node_by_path("/soc/pcie@fc000000");
	if (!np)
		return -ENODEV;

	ret = c10h_pcie_hw_bringup(np);
	if (ret) {
		of_node_put(np);
		return ret;
	}

	prop_status = of_find_property(np, "status", NULL);
	if (prop_status) {
		prop_status->value = c10h_status_ok;
		prop_status->length = sizeof(c10h_status_ok);
	}

	prop_compat = of_find_property(np, "compatible", NULL);
	if (prop_compat) {
		prop_compat->value = c10h_compat_str;
		prop_compat->length = sizeof(c10h_compat_str);
	}

	of_node_clear_flag(np, OF_POPULATED);

	ret = platform_driver_register(&c10h_pcie_driver);
	if (ret) {
		of_node_put(np);
		return ret;
	}

	c10h_pdev = of_platform_device_create(np, NULL, NULL);
	of_node_put(np);
	if (!c10h_pdev) {
		pr_err("c10h_pcie: of_platform_device_create failed\n");
		platform_driver_unregister(&c10h_pcie_driver);
		return -ENODEV;
	}

	return 0;
}

static void __exit c10h_pcie_exit(void)
{
	if (c10h_pdev)
		platform_device_unregister(c10h_pdev);
	platform_driver_unregister(&c10h_pcie_driver);
}

module_init(c10h_pcie_init);
module_exit(c10h_pcie_exit);
MODULE_LICENSE("GPL");
MODULE_DESCRIPTION("Skyworth C10H S905L3A PCIe Host Controller Bringup Driver");
