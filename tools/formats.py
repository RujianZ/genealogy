# -*- coding: utf-8 -*-
"""**谱面格式全面检查。**

把 jsonl 里每一条正文行按形状归类，逐类报「解析器认不认」。
不是靠想出来的规则清单，是**把谱实际写了哪些形状穷举一遍**——
认不出的形状会成堆地露出来，一眼看得见还剩什么。
"""
import json, io, os, sys, glob, re
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, '.')
from parser.fields import (RE_FILIATION, RE_ZI, RE_HUI, RE_HAO, RE_MING, RE_AGE,
                           RE_LEAD, RE_SPOUSE, RE_SONS, RE_DAUS, RE_GEN_HDR,
                           TITLES, MARKS, is_son_item, is_daughter_item)
from parser.segment import is_name_line, RE_HDR_PTR

VOL = {'张氏谱首_一_.jsonl':'册1','合一_1_2_3_4_.jsonl':'册2',
       '合二_5_6_7_.jsonl':'册3','合三_8_9_.jsonl':'册4'}

def klass(t):
    if not t: return None
    if is_name_line(t): return '名字行'
    if RE_GEN_HDR.match(t): return '世代列头'
    if RE_FILIATION.match(t.rstrip('、。，；,;')): return '行次句（X之子/嗣子/之女…）'
    for rx, n in ((RE_ZI,'字'),(RE_HUI,'讳'),(RE_HAO,'号'),(RE_MING,'名')):
        if rx.match(t): return '名号（'+n+'）'
    if RE_AGE.match(t): return '寿'
    if RE_LEAD.match(t): return '引导词（生于/殁于/葬，可带公妣）'
    if RE_SPOUSE.match(t): return '配偶行'
    if RE_SONS.match(t): return '生子名单头'
    if RE_DAUS.match(t): return '女名单头'
    if t in TITLES: return '功名'
    if is_son_item(t): return '名单里的儿子'
    if is_daughter_item(t): return '名单里的女儿'
    if re.match(r'^(葬|俱葬|合葬|同葬|附葬|祋葬|归葬|歸葬|兼葬)', t): return '葬地行'
    if re.match(r'^(公妣|公|妣|原妣|继妣)?(生|殁|歿|葬|生殁|殁葬|生殁葬)(缺|俱缺|未详|未祥|不祥|不详|年未详|年不祥)$', t): return '缺记（谱自己写的「此处无记录」）'
    if re.search(r'(详载|详前|详见|邑乘|县志|首卷)', t): return '参见句'
    if re.search(r'(大学|学院|中学|小学|毕业|教师|医生|工程师|公司|厂|院|局|书记|主任|县|镇|乡)', t): return '学历职业（近世）'
    if re.match(r'^[一-鿿]{4}$', t): return '四言句（传赞）'
    if re.search(r'^[一-鿿]{2,8}向[东西南北]', t) or re.search(r'[山向坪岖砌墓坟顶岭凹窚坬]', t): return '葬地续行'
    if re.match(r'^[一二三四五六七八九十百零廿卅0-9〇○]', t) or re.search(r'[年月日时時]', t):
        return '日期行'
    for tag, pat in MARKS.items():
        if re.search(pat, t): return '注记（'+tag+'）'
    return '★ 认不出'

def main():
  cnt = Counter(); ex = {}
  for fp in sorted(glob.glob('parser/jsonl/*.jsonl')):
      vol = VOL[os.path.basename(fp)]
      if vol == '册1': continue
      for line in io.open(fp, encoding='utf-8'):
          b = json.loads(line)
          page = b['block_index']
          body = 1 if page % 2 == 1 else 0
          for c in b.get('cells', []):
              if c.get('source') != 'cell' or c.get('r', 0) == 0 or c.get('c') != body:
                  continue
              for ln in (c.get('text') or '').split('\n'):
                  t = ln.strip()
                  if not t: continue
                  k = klass(t)
                  cnt[k] += 1
                  ex.setdefault(k, []).append(f'{vol}p{page} 「{t[:26]}」')

  tot = sum(cnt.values())
  print(f'正文行合计 {tot}\n')
  for k, n in cnt.most_common():
      print(f'{n:7}  {k}')
  print('\n' + '─'*70)
  print('★ 认不出的那些长什么样（随机 25 条）：')
  bad = ex.get('★ 认不出', [])
  for i in range(0, min(25 * max(1, len(bad)//25), len(bad)), max(1, len(bad)//25)):
      print('  ', bad[i])


if __name__ == '__main__':
    main()
