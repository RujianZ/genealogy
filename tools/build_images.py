"""
图片建档：16 幅手绘山图 + 4 张印刷拼版（切成 8 个版面）+ 封面。

印刷拼版是一张纸的正反面，左右各一个独立版面，必须切开——
不切的话「征地协议」和「门口塘」永远挤在一张图里，点不开也说不清。

山图与卷首题记的对应：卷首里「图名一页 + 题记一页」已在 build_shou_json 合并，
这里按顺序把 shantu-NN 对上那 16 篇。**顺序对应是有依据的**——
原书图版与题记本来就是一图一记、依次排列（README-交接包 的对照表也是这个顺序）。

输出 data/images.json；网页图放 prototype/img/
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

# 四张拼版，左右两个版面各是什么。逐张看图记下来的，不是猜的。
PANELS = {
    "正": [("先发祖堂屋上重", "堂屋"), ("胜公祠下重", "祠堂")],
    "反": [("胜公祠上重", "祠堂"), ("先发祖堂屋下重", "堂屋")],
    "正1 拷贝": [("十七世焕先公墓碑记", "祖墓图"), ("多云山九世祖墓图", "祖墓图")],
    "反1 拷贝": [("张胜二门口塘", "门口塘"), ("二〇一六年四月三日征地协议书", "协议")],
}
NOTES = {
    "胜公祠下重": "重建于 2009 年",
    "胜公祠上重": "重建于 2009 年",
    "张胜二门口塘": "重建于 2013 年",
    "多云山九世祖墓图": "改建于 2016 年",
    "十七世焕先公墓碑记": "碑记撰者：二十七世孙 张呈祥（湖北省黄梅县第五高级中学高级教师）。"
                    "碑上刻「名昌字焕先」，而世系表作「啟昌」——两处写法不同，谱与碑各自照录。",
    "二〇一六年四月三日征地协议书": "湖北省黄梅县苦竹乡杨谷村民委员会。"
                    "甲方王街村山地所有权人，乙方黄梅县苦竹乡张胜二家族。"
                    "占地约五十平方购地 2600 元（含两棵板栗树损失），"
                    "长岗路至祖坟小路长 50 米宽 2 米付 2000 元，合计 4600 元。",
}


def main() -> None:
    out = Path("prototype/img"); out.mkdir(parents=True, exist_ok=True)
    shou = json.loads(Path("data/shou.json").read_text(encoding="utf-8"))
    shantu_docs = [d for d in shou if d["title"].startswith("图")]

    imgs = []

    # ── 封面 ──
    imgs.append({
        "id": "cover", "file": "cover.jpg", "kind": "封面",
        "title": "卷首封面", "note": "张氏胜二户宗谱编修委员会，二〇一六年十二月，清河郡。"
                                "界面的红色 #660000 和金色 #C08C10 就是从这张图上采的。",
        "src_human": "卷首 封面",
    })

    # ── 16 幅山图，配卷首题记 ──
    for i, p in enumerate(sorted(Path("assets/shantu").glob("*.webp"))):
        d = shantu_docs[i] if i < len(shantu_docs) else None
        imgs.append({
            "id": p.stem, "file": p.stem + ".jpg", "kind": "山图",
            "title": (d["title_read"] if d else p.stem),
            "note": "原书卷首手绘风水图。图名在原书上是右起横排。",
            "doc": d["id"] if d else None,
            "mentions": d["mentions"] if d else [],
            "src_human": f"卷首 第{d['page_from']}页" if d else "卷首 山图",
            "caption": d["text"] if d else "",
        })

    # ── 4 张拼版切成 8 个版面 ──
    for stem, panels in PANELS.items():
        im = Image.open(Path("source") / (stem + ".jpg")).convert("RGB")
        w, h = im.size
        for j, (title, kind) in enumerate(panels):
            box = (0, 0, w // 2, h) if j == 0 else (w // 2, 0, w, h)
            crop = im.crop(box)
            s = min(1600 / max(crop.size), 1.0)
            crop = crop.resize((int(crop.width * s), int(crop.height * s)), Image.LANCZOS)
            fid = f"panel-{stem.replace(' ', '_')}-{j}"
            crop.save(out / (fid + ".jpg"), "JPEG", quality=84, optimize=True)
            imgs.append({
                "id": fid, "file": fid + ".jpg", "kind": kind, "title": title,
                "note": NOTES.get(title, ""),
                "src_human": f"卷首 图版（印刷拼版「{stem}」{'左' if j == 0 else '右'}半）",
            })

    Path("data/images.json").write_text(json.dumps(imgs, ensure_ascii=False), encoding="utf-8")
    print(f"图片条目 {len(imgs)} 条")
    for k in ("封面", "山图", "祠堂", "堂屋", "门口塘", "祖墓图", "协议"):
        n = [x for x in imgs if x["kind"] == k]
        if n:
            print(f"   {k:<6} {len(n):>3}   " + "、".join(x["title"] for x in n[:4])
                  + ("…" if len(n) > 4 else ""))
    print(f"\n网页图 {len(list(out.glob('*.jpg')))} 个文件，"
          f"{sum(f.stat().st_size for f in out.glob('*.jpg')) // 1024} KB")


if __name__ == "__main__":
    main()
