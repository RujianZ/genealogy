import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { isFragment } from '../src/core/fragment.ts';
import { roster } from '../src/core/roster.ts';
import { fname } from '../src/core/fname.ts';
const J=n=>JSON.parse(readFileSync(`data/${n}.json`,'utf8'));
const people=withBacklinks(J('people'));
const idx=buildIndex(people);const chart=new EraChart(J('erachart'));
const win=buildWindows(people,chart);
const bare=s=>fname(s).replace(/公$/,'');
const forms=p=>[bare(p.name),...p.aliases.map(a=>bare(a.form))];
const NUM={一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,两:2};
const all=people.filter(p=>!isFragment(p));
const KIDS=new Map(),nDads=new Map(),CS=new Map();
for(const p of all){
  const cs=candidates(idx,p,chart,win); CS.set(p.pid,cs);
  const keep=cs.filter(c=>c.status==='ok');
  const bio=keep.filter(c=>c.edge.kind==='生父');
  nDads.set(p.pid,(bio.length?bio:keep).length);
  for(const c of keep)(KIDS.get(c.edge.parent)??KIDS.set(c.edge.parent,[]).get(c.edge.parent)).push({child:p,edge:c.edge});
}
const flag=new Map(),M=(p,k)=>(flag.get(p.pid)??flag.set(p.pid,new Set()).get(p.pid)).add(k);
for(const f of all){
  const ks=KIDS.get(f.pid)??[];
  // ★ 又是同一类错：拿生父的尺子量嗣子。
  //   嗣子**本来就不在嗣父的「生子N」名单里**——嗣父无子才立嗣。
  //   拿生子N 去卡总人数，等於把每一个立嗣都判成「多出来一个人」。
  //   所以三样检查都只对生父那条线做，嗣子另算。
  const kbio=ks.filter(k=>k.edge.kind==='生父');
  const byN=new Map();
  for(const k of kbio){const n=bare(k.child.name);(byN.get(n)??byN.set(n,[]).get(n)).push(k);}
  for(const [,v] of byN) if(v.length>1) M(f,'子女栏塞进了别人');
  for(const k of kbio) if((nDads.get(k.child.pid)??1)>1) M(f,'子女栏塞进了别人');
  const r=roster(f), dec=r.sons.length+r.daughters.length;
  if(dec&&new Set(kbio.map(k=>k.child.pid)).size>dec) M(f,'子女栏塞进了别人');
  // 父亲只靠同名
  const keep=CS.get(f.pid).filter(c=>c.status==='ok');
  const bio=keep.filter(c=>c.edge.kind==='生父'); const line=bio.length?bio:keep;
  if(line.length===1){
    const d=idx.get(line[0].edge.parent);
    const named=d&&roster(d).sons.some(x=>forms(f).includes(bare(x.name||x.raw)));
    const wrote=d&&!!bare(f.father_name)&&forms(d).includes(bare(f.father_name));
    // ★ 还有第三种「谱写过这层关系」：**对方原文里的立嗣语句**。
    //   「立胞弟光治四子壁铨为嗣」「立五弟铣青次子泽起为嗣」——
    //   立嗣的父亲生子名单本来就是空的（无子才立嗣），本人条目也常不写父名。
    //   只查名单和父名，会把这一整类判成「纯靠同名撞上」。
    //   开国、开东、开荣、壁介都是这么被误报的。
    const stated=d&&/[立以][^，。；、]{0,14}?(?:为嗣|為嗣|承嗣|入嗣|为祧|為祧|祧)/.test(
      (d.raw_text||'').replace(/[\s　]/g,''))
      && forms(f).some(x=>(d.raw_text||'').replace(/[\s　]/g,'').includes(x));
    if(!named&&!wrote&&!stated) M(f,'父亲只靠同名撞上');
  }
  // ★ 本人写的父名，要跟**留下的任何一条边**比，不能只跟生父那条比。
  //   过继的人，他自己那一条写的是**嗣父**（「朝阳公嗣子」），
  //   而生父栏认定的是生父（朝相公）——两个都对，那正是凡例要的双记。
  //   拿嗣父的名字去比生父，等於把每一个过继的人都误报成错。启昌就栽在这。
  if(bare(f.father_name)&&keep.length&&
     !keep.some(c=>forms(idx.get(c.edge.parent)).includes(bare(f.father_name))))
    M(f,'本人写的父名跟认定的父亲不符');
  // 谱明写是嗣子／祧子，却一条嗣父边都没有
  if(/嗣子|祧子|嗣男/.test(f.filiation||'')&&!keep.some(c=>c.edge.kind.includes('嗣')))
    M(f,'谱写了是嗣子，却没接上嗣父');
  let want=0,saw=false;
  for(const m of (f.raw_text??'').matchAll(/生子([一二三四五六七八九十两])/g)){want+=NUM[m[1]];saw=true;}
  if(saw&&want&&roster(f).sons.filter(x=>!x.adopted).length!==want) M(f,'生子N跟名字数对不上');
  if(CS.get(f.pid).some(c=>c.conflict)||win.get(f.pid)?.conflict) M(f,'年代兜不拢');
  // ★ 配偶的年份自相矛盾（殁在生之前）。
  //   这条是 sanity.mjs 交叉查出来的漏网——两个人违反了常识却不在疑点名单上。
  //   交叉检查就是干这个的：一份名单说「这些人可能有问题」，
  //   另一份独立地问「谁违反了常识」，两份对不上的地方，就是名单漏了。
  // ★ 承健问「继华在不在名单里」，一查不在——标准漏了两类。
  //
  //   ① 谱上写「生庚俱详前」的，是**同一个人在另一房下的第二条**。
  //      兼祧的人每承一房就立一条，只有一条写全。我们当成了不同的人，
  //      於是每条各自去配父亲，配出一堆本不该有的边。
  //      继华（壁林之子，兼祧长兄壁洲、二兄壁银）在谱上有三条。
  //
  //   ② 生父来自**另一册另一房**、而本人自己那一条根本没写生父名。
  //      过继跨房是常事（启昌就是），但那是嗣父，而且同册；
  //      生父跨册又跨房、两边文字都没写过，多半是同名撞的。
  //      继华(361页,册2·朝泰房) 被挂上壁温(册3·朝阳房) 就是这么来的。
  if(/详前|詳前|俱详|见前|已详/.test((f.raw_text||'').replace(/[\s　]/g,'')))
    M(f,'谱上写「详前」——同一个人在别房还有一条');
  // ★ 这里原来加过一条「生父来自另一册另一房就可疑」，**是错的，已撤**。
  //   分册的界正好压在世代上：第20世（铣字辈）在册2，第21世（泽字辈）起册3；
  //   第25世在册3，第26世（开字辈）起册4。五世一图本来就跨册。
  //   而「房」是嵌套的：梦林公世系（15–20世）→ 朝阳公世系（16–25世）
  //   → 学义公世系（18世起），越往下走房名越深，换房是常态。
  //   拿这两样当可疑信号，等於把整代人的正常传承全标成错——
  //   跑出来 114 条里 113 条是分册的界。**这是我今天第五次判据写错、数据没错。**
  for(const sp of f.spouses??[]){
    const sb=chart.lookup(sp.birth?.text).ad, sd=chart.lookup(sp.death?.text).ad;
    if(sb&&sd&&sd<sb) M(f,'配偶的年份自相矛盾');
  }
}
const clean=all.filter(p=>!flag.has(p.pid));
const pc=a=>(a*100/all.length).toFixed(1)+'%';
console.log('═'.repeat(66));
console.log(`全谱有独立条目的 ${all.length} 人`);
console.log(`★ 没有任何一处是我们可能弄错的   ${String(clean.length).padStart(4)} 人  ${pc(clean.length)}`);
console.log(`  至少有一处可能是我们弄错的     ${String(flag.size).padStart(4)} 人  ${pc(flag.size)}`);
console.log('═'.repeat(66));
const c={};for(const s of flag.values())for(const k of s)c[k]=(c[k]??0)+1;
for(const [k,v] of Object.entries(c).sort((a,b)=>b[1]-a[1]))console.log(`   ${String(v).padStart(4)} 人  ${k}`);
const me=people.find(p=>p.name==='承健'&&p.gen===27);
const dd=idx.get(CS.get(me.pid).find(c=>c.status==='ok').edge.parent);
const gg=idx.get(CS.get(dd.pid).find(c=>c.status==='ok').edge.parent);
console.log('');
for(const [t,q] of [['承健',me],['开赛（父）',dd],['继均（爷）',gg]])
  console.log(`   ${t.padEnd(10)}${flag.has(q.pid)?'✘ '+[...flag.get(q.pid)].join('、'):'✔ 没有可能弄错的地方'}`);

// 把疑点名单落盘，给 sanity.mjs 做交叉：
// **违反常识的人，必须全都已经在这份名单上。**
// 如果有人违反了常识却不在名单上，说明疑点标准漏了一类——那才是真问题。
import { writeFileSync } from 'node:fs';
writeFileSync('build/flagged.json', JSON.stringify([...flag.keys()]), 'utf8');
console.log(`\n疑点名单已落盘 build/flagged.json（${flag.size} 人）`);
