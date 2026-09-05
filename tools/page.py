# -*- coding: utf-8 -*-
"""把谱的**原始一页**按表格摊开——直接读 jsonl，不经过任何解析。

    python tools/page.py 册4 258
    python tools/page.py 册4 258 259 260

欧式五世一图：一页一表，第 0 行是页眉带（卷次·世系名·跨页父名指向），
第 1–5 行各是一代，奇数页正文在第 1 列、偶数页在第 0 列。
看这个才是看谱，看 people.json 是看我们对谱的理解。
"""
import json, sys, io, os, glob
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

VOL = {'册1': '张氏谱首_一_.jsonl', '册2': '合一_1_2_3_4_.jsonl',
       '册3': '合二_5_6_7_.jsonl', '册4': '合三_8_9_.jsonl'}
GEN_BASE = {'册2': [(1,6,1),(7,16,6),(17,44,11),(45,300,16),(301,372,21)],
            '册3': [(1,410,21)], '册4': [(1,282,26)]}

def gen_of(vol, page, row):
    for lo, hi, base in GEN_BASE.get(vol, []):
        if lo <= page <= hi:
            return base + (row - 1)
    return None

def show(vol, page):
    fp = os.path.join('parser', 'jsonl', VOL[vol])
    for line in io.open(fp, encoding='utf-8'):
        b = json.loads(line)
        if b.get('block_index') != page:
            continue
        body = 1 if page % 2 == 1 else 0
        print('=' * 78)
        print(f'{vol}  第 {page} 页   （正文在第 {body} 列）')
        print('=' * 78)
        cells = sorted(b.get('cells', []), key=lambda c: (c.get('r', 0), c.get('c', 0)))
        for c in cells:
            t = (c.get('text') or '').rstrip()
            if not t.strip():
                continue
            r, col = c.get('r'), c.get('c')
            g = gen_of(vol, page, r) if r and r > 0 else None
            tag = f'行{r} 列{col}' + (f'  第{g}世' if g else '') + ('  ← 正文' if col == body and r else '')
            if c.get('source') == 'textbox':
                tag = '文本框'
            print(f'\n┌─ {tag} ' + '─' * max(0, 60 - len(tag)))
            for ln in t.split('\n'):
                s = ln.rstrip()
                print('│ ' + (s if s.strip() else ''))
        return
    print(f'{vol} 没有第 {page} 页')

if __name__ == '__main__':
    v = sys.argv[1]
    for p in sys.argv[2:]:
        show(v, int(p))
