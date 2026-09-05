# -*- coding: utf-8 -*-
"""逐世通读用的档案打印：给一个 pid，把谱上关于他的一切原样摊开。
   用法： python tools/dossier.py <pid> [<pid> ...]
         python tools/dossier.py --gen 3          # 该世全部人
"""
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

J = lambda n: json.load(open(f'data/{n}.json', encoding='utf-8'))
P = J('people'); BY = {p['pid']: p for p in P}
PROSE = J('prose'); BUR = J('burials')
kids = {}
for p in P:
    for e in p.get('parent_edges') or []:
        kids.setdefault(e['parent'], []).append((p, e))

def blk(t): print('\n' + '─'*72 + f'\n{t}\n' + '─'*72)

def show(pid):
    p = BY.get(pid)
    if not p: print('!! 无此 pid', pid); return
    blk(f"第{p['gen']}世　{p['name']}　（{p.get('name_raw')}）　{p['src_human']}　pid={pid}")
    for k in ('zi','hui','hao','ming'):
        if p.get(k): print(f"  {k}: {p[k]['text']}")
    print(f"  谱写父名: {p.get('father_name')}　行次: {p.get('filiation')}　父名出处: {p.get('father_src')}　嗣子: {p.get('is_heir')}")
    print(f"  别名: {[a['form']+'('+a['why']+')' for a in p.get('aliases') or []]}")
    for k in ('birth','death','burial','age'):
        v = p.get(k)
        print(f"  {k}: {v['text'] if v else None}")
    if p.get('titles'): print('  titles:', p['titles'])
    if p.get('marks'): print('  marks:', json.dumps(p['marks'], ensure_ascii=False))
    for s in p.get('spouses') or []:
        print(f"  配偶 {s['rel']}{s['name_raw']}｜生 {(s.get('birth') or {}).get('text')}｜殁 {(s.get('death') or {}).get('text')}｜葬 {(s.get('burial') or {}).get('text')}")
    print('  生子(原文列):', p.get('sons_claimed'), '　女:', p.get('daughters_claimed'))
    print('  父边:')
    for e in p.get('parent_edges') or []:
        print(f"    → {e['parent_name']}({e['parent']}) {e['kind']} rank{e['rank']} {e['evidence']} | {e['evidence_cn']} | {e.get('matched_as')} | {e.get('parent_src')}")
    ks = kids.get(pid, [])
    if ks:
        print('  谱里认他作父的人:')
        for c, e in ks:
            print(f"    ← 第{c['gen']}世 {c['name']} [{c.get('filiation')}] {e['kind']} rank{e['rank']} {c['src_human']}")
    for b in BUR:
        if b['owner'] == pid:
            print(f"  葬地解析: {b['text']}　→ places={b.get('places')}　group={[g['group'] for g in b.get('groups') or []]}")
    pr = [x for x in PROSE if x['host'] == pid]
    if pr:
        print('  事迹段:')
        for x in pr:
            print(f"    [{x['chars']}字 {'/'.join(x['kinds'])} 写的是:{x.get('about')}] {x['text']}")
    if p.get('unparsed'):
        print('  未归类残句:')
        for u in p['unparsed']:
            print(f"    (seq{u['seq']} p{u['page']}) {u['text']}")
    print('  ── raw_text ──')
    for ln in p['raw_text'].split('\n'):
        if ln.strip(): print('   |', ln)

if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--gen':
        for p in sorted([q for q in P if q['gen'] == int(a[1])], key=lambda q: (q['src']['vol'], q['src']['page'], q['src']['row'])):
            show(p['pid'])
    else:
        for pid in a: show(pid)
