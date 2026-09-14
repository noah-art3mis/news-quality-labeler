"""Render the exploratory report produced by analyze-thresholds.ts."""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import StrMethodFormatter

root = Path(__file__).resolve().parent.parent
report = json.loads((root / "docs/threshold-analysis.json").read_text())
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10})
fig, axes = plt.subplots(2, 1, figsize=(10, 7.6), gridspec_kw={"height_ratios": [1.8, 1]})
fig.set_facecolor("#f7f7f2")
for axis in axes:
    axis.set_facecolor("#f7f7f2")
    axis.spines[["top", "right"]].set_visible(False)
    axis.spines[["bottom", "left"]].set_color("#aebbb3")
    axis.tick_params(colors="#33443d")

bins = report["histogram"]
axes[0].bar([b["from"] for b in bins], [b["count"] for b in bins],
            width=0.019, align="edge", color="#70998c")
for cutoff in (0.4, 0.7):
    axes[0].axvline(cutoff, color="#263e34", linestyle="--", linewidth=1.3)
    axes[0].text(cutoff + 0.008, axes[0].get_ylim()[1] * 0.92, f"{cutoff:.2f}", color="#263e34")
axes[0].set(xlim=(0, 1), xlabel="PC1 source rating", ylabel="Dataset entries",
            title="Distribution with proposed 0.40 / 0.70 boundaries")
axes[0].yaxis.set_major_formatter(StrMethodFormatter("{x:,.0f}"))

policies = report["candidates"]
left = [0.0] * len(policies)
for category, color in [("low", "#526b60"), ("medium", "#a5baaf"), ("high", "#d9e5de")]:
    values = [policy["percent"][category] for policy in policies]
    axes[1].barh(range(len(policies)), values, left=left, color=color, label=category.title())
    for index, value in enumerate(values):
        axes[1].text(left[index] + value / 2, index, f"{value:.1f}%", ha="center", va="center",
                     color="white" if category == "low" else "#202b35", fontsize=9)
    left = [start + value for start, value in zip(left, values)]
axes[1].set_yticks(range(len(policies)), [f"{p['low']:.2f} / {p['high']:.2f}" for p in policies])
axes[1].invert_yaxis()
axes[1].set(xlim=(0, 100), xlabel="Percentage of dataset entries", ylabel="Candidate cutoffs")
axes[1].legend(loc="upper center", bbox_to_anchor=(0.5, -0.35), ncol=3, frameon=False)
fig.suptitle("News Quality · threshold policy comparison", fontsize=17, x=0.1, ha="left")
fig.text(0.1, 0.015,
         f"{report['totalEntries']:,} entries · snapshot {report['version'][:12]} · equal entry weights, not Bluesky exposure\n"
         "Dashed boundaries are a proposed policy, not validated cutoffs from the paper.",
         fontsize=9, color="#586570")
fig.tight_layout(rect=(0, 0.07, 1, 0.96), h_pad=2.6)
fig.savefig(root / "docs/threshold-distribution.png", dpi=160, facecolor=fig.get_facecolor())
