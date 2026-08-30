M["tree"] = (() => {
/**
 * 世系树：从最早的一代往下排到你，一世一行，能点。
 *
 * ★ 为什么不是一条链，是一棵树
 *
 *   过继。用户自己家就是这个情况：第 17 世**启昌（字焕先）**
 *     生父　朝相公（梦庚公支）
 *     嗣父　朝阳公（梦林公支）
 *   谱的凡例明文要求双记，理由写着「不忘所自出」。
 *   所以从启昌往上，**血缘一条路、宗法一条路，是两条真路，不是一条加一个注**。
 *   两条在第 9 世世昂公合回去。
 *
 *   全谱 143 个嗣子/祧子，其中 94 个两条边都有。
 *   剩下两千多人两条线走的是同一串人。
 *
 * ★ 所以这里的规矩是：
 *
 *   **两条线走到同一个人 → 这一世画一格。**
 *   **两条线走到不同的人 → 这一世画两格，标上哪格是血缘、哪格是宗法。**
 *
 *   祖上没过继过的人，从头到尾都是一格——他根本看不见「两条线」这回事，
 *   界面上也不该出现这四个字。有过继的人，一打开就看见路在哪一世分开、
 *   在哪一世又合上。**不用切换、不用先懂什么叫宗法。**
 *
 * ★ 分叉不止过继一种。同名候选也是分叉：
 *   谱上只写了父亲叫「铣发」，而谱里有两个铣发。那一世就是两条可能的路。
 *   这种也照样摆出来，**一个都不删**（CLAUDE.md 第二节「不漏」）。
 */
                                                     
                                                                 
const { principalChain, MAX_DEPTH } = M["lineage"];

                           
                 
                                      
                    
     
                                      
                                  
     
                         
     
                                      
                                    
                                    
     
                             
                         
                     
               
                          
            
                 
 

                          
              
                    
                                                   
                          
 

                       
                  
                                           
                  
                                        
                          
                         
                              
                  
 

const stepOf = (c             , pid        ) => c.find(s => s.person.pid === pid) ?? null;

function buildTree(
  idx                     , pid        , maxDepth = MAX_DEPTH,
)       {
  const blood = principalChain(idx, pid, '血缘线', maxDepth);
  const clan = principalChain(idx, pid, '宗法线', maxDepth);
  if (!blood.length) return { rows: [], single: true, splitGen: null, joinGen: null, summary: '' };

  const same = blood.length === clan.length
    && blood.every((s, i) => s.person.pid === clan[i].person.pid);

  // 按世次对齐。两条链长度可能不同（宗法线可能先断），所以不能按下标配对。
  const byGen = new Map                                                 ();
  for (const s of blood) (byGen.get(s.person.gen) ?? byGen.set(s.person.gen, {}).get(s.person.gen) ).blood = s;
  if (!same) {
    for (const s of clan) (byGen.get(s.person.gen) ?? byGen.set(s.person.gen, {}).get(s.person.gen) ).clan = s;
  }

  const cell = (s           , lines            )           => ({
    person: s.person, lines,
    via: s.taken,                 // 本人的父边 = 连到上面那一格的线
    alternatives: s.alternatives, // 上面那一格本来可能是谁——全部
    ambiguous: s.ambiguous,
    deadEnd: s.deadEnd,
    focus: s.person.pid === pid,
  });

  // ★ 你在最上面，往下走 = 往回追祖先。
  //   这样过继那一处才读得顺：走到启昌，路**分成两条**往下（往上追），
  //   两条各走各的，一直走到第 9 世世昂公才碰到同一个人。
  //   反过来排（始祖在上）会画成「两个人合成一个孩子」，那是家族树的读法，
  //   不是「我往上有两条路」的读法。
  const gens = [...byGen.keys()].sort((a, b) => b - a);
  const rows            = gens.map(g => {
    const { blood: b, clan: c } = byGen.get(g) ;
    if (b && c && b.person.pid !== c.person.pid) {
      return { gen: g, cells: [cell(b, ['血缘线']), cell(c, ['宗法线'])] };
    }
    const s = (b ?? c) ;
    const lines             = same || (b && c) ? ['血缘线', '宗法线'] : b ? ['血缘线'] : ['宗法线'];
    return { gen: g, cells: [cell(s, lines)] };
  });

  // 往下 = 往回追。所以「分开」的世次数字**大**（离你近），「合回」的**小**（更早）。
  const splits = rows.filter(r => r.cells.length === 2).map(r => r.gen);
  const splitGen                = splits.length ? Math.max(...splits) : null;

  // ★ 「合回去」必须是**两条线真的都走到了这个人**，不能只是上面那条断了。
  //   承健这一支就是后者：宗法线走到第 16 世朝阳公就断了——
  //   谱里没有朝阳公接到他父亲的那一条。所以第 15 世往上只有血脉一条路，
  //   **那不叫合回，那叫另一条走不下去了**。写成「合回」就是替谱说了它没说的话。
  const joinRow = splitGen == null ? null
    : rows.find(r => r.gen < splitGen && r.cells.length === 1
                     && r.cells[0].lines.length === 2) ?? null;
  const joinGen = joinRow?.gen ?? null;
  // 两条线分开之后，某一条自己断了（不是合回）——把断的那条记下来，界面要说清楚。
  const brokeRow = splitGen == null ? null
    : rows.filter(r => r.cells.length === 2).flatMap(r => r.cells).find(c => c.deadEnd) ?? null;
  if (splitGen != null) {
    for (const r of rows) {
      if (r.gen === splitGen) r.mark = 'split';
      if (joinGen != null && r.gen === joinGen) r.mark = 'join';
    }
  }

  // 过继的那个人，是分开的那几世**再往下一世**的人：
  // 他自己一个人同时在两条线上，他的两个父亲才是分开的第一对。
  const kid = splitGen == null ? null
    : rows.find(r => r.gen === splitGen + 1 && r.cells.length === 1)?.cells[0].person ?? null;
  const j = joinGen == null ? null : rows.find(r => r.gen === joinGen)?.cells[0].person ?? null;

  // 用词全部照谱自己的：凡例第十三则写「於**嗣父母**下直书嗣子某，
  // 而於**本生父母**下必注明第几子某出承与某为嗣，**不忘所自出也**」。
  const summary = splitGen == null ? '' :
    (kid ? `第 ${kid.gen} 世**${kid.name}**是过继的。` : '这一支有过继。')
    + `往回追祖先有两条路：一条走**本生**（生他的那一家），一条走**嗣**（把他接过去的那一家）。`
    + (j ? `两条路走到第 ${j.gen} 世**${j.name}**，是同一个人。`
         : brokeRow ? `**嗣**那条到第 ${brokeRow.person.gen} 世${brokeRow.person.name}就没了下文，谱里没有他父亲单独的一条。` : '')
    + `凡例第十三则要求两边都写，理由是「不忘所自出」。`

  return { rows, single: same, splitGen, joinGen, summary };
}

return { buildTree };
})();

/**
 * 界面：**一个通用渲染器**，认 Entry 不认具体数据。
 *
 * 加一类条目 = 在 src/core/entries.ts 里写一个生成器，这个文件一行不用改。
 * 之前人、妻女、地方、篇目各写一套 view 函数，再加十类就是十份重复代码。
 */
const [people, referenced, places, shou, erachart, passages, revisions, generations, images, translations, doubts] = ["people","referenced","places","shou","erachart","prose_ents","revisions","generations","images","translations","doubts"].map(n => DATA[n]);
const R = makeRegistry({ people, refs, places, shou, era, passages, revisions, generations, images, trans });
const cat = R.catalogue();

const esc = s => (s ?? '').replace(/[<>&"]/g, c =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);
// `**这样**` 加粗。只认这一种记号，别的一律当普通字。
const bold = s => esc(s).split('**').map((x, i) => i % 2 ? `<b>${x}</b>` : x).join('');

const A = (kind, id, label, cls = '') =>
  `<a class="${cls}" onclick="open_('${kind}','${String(id).replace(/'/g, "\\'")}')">${esc(label)}</a>`;

// ══════════ 只有一个「在看的东西」，配一个返回 ══════════
let hist = [], cur = null;
window.open_ = (kind, id, push = true) => {
  const e = R.build[kind]?.(id);
  if (!e) return;
  if (push && cur) hist.push(cur);
  cur = { kind, id };
  $('back').disabled = !hist.length;
  $('results').classList.add('hide');
  paint(e);
};
window.goBack = () => {
  const p = hist.pop(); if (!p) return;
  cur = p; $('back').disabled = !hist.length;
  $('results').classList.add('hide');
  if (p.kind === 'tree') return showTree(p.id, false);   // 世系树不是 Entry，另走一条
  if (p.kind === 'doubts') { cur = null; return showDoubts(p.id || undefined); }
  paint(R.build[p.kind](p.id));
};

// ══════════ 通用渲染 ══════════
function paint(e) {
  let h = `<h1 class="title">${esc(e.title)}`
    + (e.titleNote ? `<span class="gen">${esc(e.titleNote)}</span>` : '') + '</h1>';
  if (e.subtitle || e.tags?.length) {
    h += '<div class="byline">' + esc(e.subtitle ?? '')
      + (e.tags ?? []).map(t =>
        `　<span class="tag ${t.tone === 'hot' ? 'hot' : t.tone === 'gold' ? 'gold' : ''}">${esc(t.text)}</span>`
      ).join('') + '</div>';
  }
  if (e.chainFrom) h += lineBar(e.chainFrom);
  if (e.alert) h += `<div class="brk">${esc(e.alert)}</div>`;
  if (e.image) h += `<img class="pic" src="" alt="${esc(e.title)}">`;

  if (e.facts.length) {
    h += '<dl>' + e.facts.map(f => {
      let v = '';
      if (f.links?.length) {
        const ln = l => A(l.kind, l.id, l.label, l.warn ? 'warn' : '')
          + (l.note ? ` <span class="dim">${esc(l.note)}</span>` : '');
        v += f.links.map(ln).join('<span class="dim"> · </span>');
        if (f.value) v = esc(f.value) + '　' + v;
      } else v = esc(f.value ?? '');
      if (f.raw) v += `<br><span class="raw">${esc(f.raw)}</span>`;
      if (f.note) v += `<div class="calc">${bold(f.note)}</div>`;
      if (f.warn) v += `<div class="brk">${esc(f.warn)}</div>`;
      return `<dt>${esc(f.label)}</dt><dd>${v}</dd>`;
    }).join('') + '</dl>';
  }

  // 事迹条目：原文里的人名地名年份变成可点的。
  // **只把抽出来的那几处变成链接，别的字一个不动。**
  const entHtml = (txt, ents) => {
    if (!ents?.length) return linkify(txt);
    const flat = txt.replace(/[\s　]/g, '');
    let out = '', at = 0;
    for (const en of ents) {
      out += esc(flat.slice(at, en.at));
      const t = en.targets[0] || {};
      const id = t.pid ?? t.id ?? '';
      const kind = en.kind === 'person' ? 'person' : en.kind === 'place' ? 'place' : 'year';
      const many = en.targets.length > 1;
      const title = [en.why, t.note, many ? `同名 ${en.targets.length} 人，点开都列着` : '']
        .filter(Boolean).join('　');
      out += id
        ? `<a class="ent ${en.kind}${en.strong === false ? ' weak' : ''}"`
          + ` title="${esc(title)}"`
          + ` onclick="open_('${kind}','${String(id).replace(/'/g, "\'")}')">${esc(en.text)}</a>`
        : esc(en.text);
      at = en.at + en.text.length;
    }
    return out + esc(flat.slice(at));
  };

  if (e.paras?.length) {
    // 原文一段、今译一段，配着往下读。原文在上，永远在。
    h += `<div class="tnote">${esc(e.transNote ?? '')}`
      + `<b>　今译由${e.transBy === '谱' ? '谱自己带的白话本' : '本站所加'}</b>`
      + `，原文一个字没动。</div>`;
    h += '<div class="bi">' + e.paras.map(p =>
      `<div class="bir"><div class="src">${entHtml(p.src, e.ents)}</div>`
      + `<div class="cn">${esc(p.cn)}</div></div>`).join('') + '</div>';
  } else for (const s of e.sections) {
    if (s.heading) h += `<h2>${esc(s.heading)}</h2>`;
    h += `<div class="prose">${e.ents ? entHtml(s.text, e.ents) : linkify(s.text)}</div>`;
    if (s.note) h += `<div><small class="dim">${esc(s.note)}</small></div>`;
  }

  // 跟他有关的人，接着往下排。这些本来就是「这个人的事」，
  // 以前放右栏要来回看，现在跟着正文读下去就行。
  h += e.relations.map(r => {
    // 一条都不截。谱上有多少列多少——CLAUDE.md 第二节。
    return `<h2>${esc(r.heading)}<span class="dim"> ${r.items.length}</span>`
      + (r.note ? ` <span class="dim">${esc(r.note)}</span>` : '') + '</h2>'
      + '<div class="rows">' + r.items.map(l =>
          `<div class="row">${A(l.kind, l.id, l.label,
              (l.warn ? 'warn' : '') + (l.dim ? ' out' : ''))}`
          + (l.note ? ` <small class="dim">${esc(l.note)}</small>` : '') + '</div>'
        ).join('') + '</div>';
  }).join('');

  if (e.sources.length) {
    h += '<div class="foot"><small class="dim">'
      + e.sources.map(s => esc(s.src_human ?? '')).filter(Boolean).join('　')
      + '　　生卒葬按谱上原样。'
      + '</small></div>';
  }
  $('body').innerHTML = h;

  const src = e.sources[0];
  $('raw').querySelector('.src').textContent =
    src?.src_human ? '谱上原文　' + src.src_human : '谱上原文';
  $('rawtext').textContent = src?.raw || '（这一条没有对应的原文段落）';
  $('subject').scrollTop = 0;
}

// ══════════ 世系：顶上一条，点开是一整页的树 ══════════

/**
 * 人物页顶上那一条。只占一行：始祖 › …多少代… › 父 › 你在这。
 * 不是常驻的树——常驻一棵树太挤，而且大多数时候你只想知道「我在哪」。
 */
function lineBar(pid) {
  const t = buildTree(R.idx, pid);
  if (!t.rows.length) return '';
  // rows 是「你在最前、往回追」的顺序，这一条也照这个方向读：
  // 你 ‹ 父 ‹ 祖 ‹ …中间N代… ‹ 始祖
  const spine = t.rows.map(r => r.cells[0].person);
  const pick = spine.length <= 5 ? spine
    : [spine[0], spine[1], spine[2], null, spine[spine.length - 1]];
  return '<div class="linebar">'
    + pick.map(p => p
        ? (p.pid === pid ? `<b>${esc(p.name)}</b>`
                         : A('person', p.pid, p.name) + `<span class="dim">${p.gen}</span>`)
        : `<span class="dim">…往上 ${spine.length - 4} 代…</span>`
      ).join('<span class="dim"> ‹ </span>')
    + `<button class="lk" onclick="showTree('${pid.replace(/'/g, "\\'")}')">`
    + (t.single ? '看世系' : '看世系（有两条）') + '</button>'
    + '</div>';
}

/**
 * 世系树整页：**最早的一代在最上面，一路往下走到你**，每一格都能点。
 *
 * 过继的人从这里看得最清楚：他的两个父亲在同一行并排，
 * 一路往上并排走，走到某一世又变回一个人——**不用切换，不用先懂什么叫宗法**。
 * 祖上没过继过的，从头到尾就一列，界面上连「两条线」这四个字都不出现。
 */
window.showTree = (pid, push = true) => {
  const t = buildTree(R.idx, pid);
  const me = R.idx.get(pid);
  if (!t.rows.length) return;
  kinMode = false;                       // 别让关系计算器的状态漏到这里来
  let h = `<h1 class="title">${esc(me.name)}的世系<span class="gen">共 ${t.rows.length} 代</span></h1>`
    + '<div class="byline">你在最上面，往下一格就是往上一辈。每一格都能点。</div>';
  if (t.summary) h += `<div class="calc">${bold(t.summary)}</div>`;

  h += '<div class="tree">';
  // 父亲画在**下一行**（往下 = 往上追）。已经并排画出来的候选就别再重复提。
  const nextRow = t.rows.map((_, i) =>
    new Set((t.rows[i + 1]?.cells ?? []).map(c => c.person.pid)));
  h += t.rows.map((r, ri) => treeRow(t, r, ri, nextRow[ri])).join('');
  h += '</div>';
  if (push && cur) hist.push(cur);
  cur = { kind: 'tree', id: pid };
  $('back').disabled = !hist.length;
  $('results').classList.add('hide'); $('body').innerHTML = h;
  $('subject').scrollTop = 0;
};

function treeRow(t, r, ri, below) {
  let h = '';
  {
    if (r.mark === 'split') h += '<div class="tmark">从这里起，往回追有两条路</div>';
    if (r.mark === 'join') h += '<div class="tmark">两条路走到这里，是同一个人</div>';
    h += `<div class="trow${r.cells.length > 1 ? ' two' : ''}">`
      + `<div class="tgen">${r.gen}</div><div class="tcells">`;
    for (const c of r.cells) {
      const p = c.person;
      h += `<div class="tcell${c.focus ? ' now' : ''}">`;
      if (r.cells.length > 1) {
        h += `<span class="tlab">${c.lines[0] === '血缘线' ? '本生' : '嗣'}</span>`;
      }
      h += A('person', p.pid, p.name, 'nm')
        + (p.zi ? `<span class="zi">${esc(p.zi.text)}</span>` : '');
      // 这一格通到上面那一格，靠的是哪种关系
      if (c.via && c.via.kind === '嗣父') h += '<span class="tag hot">过继过去的</span>';
      // 上面那一格还可能是谁。世次差不为 1、年纪不可能、生子名单点了别人的
      // 一律不显示——那三条是谱自己的规矩和减法，是结论，不是待定。
      const cs = candidates(R.idx, p, R.chart, R.win);
      const show = (list) => list.filter(x =>
        (!c.via || x.edge.parent !== c.via.parent) && !below.has(x.edge.parent));
      const alt = show(kept(cs));
      if (alt.length) {
        h += `<div class="tfork">谱上只写了「${esc(p.father_name)}」，`
          + `同名的还有：`
          + alt.map(x => A('person', x.edge.parent, x.person?.name || x.edge.parent_name)
              + `<small class="dim"> ${esc(x.person?.src_human ?? '')}`
              + (x.layoutNote ? `　${esc(x.layoutNote)}` : '') + '</small>').join('　')
          + '</div>';
      }

      if (c.deadEnd) {
        h += `<div class="brk">谱上写着父亲叫「${esc(c.deadEnd.fatherName)}」，`
          + esc(c.deadEnd.reason.replace(/^.*?「.*?」[，,]?/, '')) + '。</div>';
      }
      h += '</div>';
    }
    h += '</div></div>';
  }
  return h;
}

// ══════════ 自动互链：正文里出现条目名就变成链接 ══════════
// 「时芳祖父子在焉」——时芳就是 19 世士利。百科的感觉全在这里。
// ★ 同名多人时不替谱选一个：链到「同名的有 N 个」，让人自己认。
const nameIndex = (() => {
  const m = new Map();
  const put = (form, ent) => {
    if (!form || form.length < 2) return;
    (m.get(form) ?? m.set(form, []).get(form)).push(ent);
  };
  // 只收谱名，不收字/讳/号——《源流序》里「运筹」「东生」这种词
  // 撞上某人的字，链过去就是误导。谱没说那是同一个人。
  for (const p of people) put(p.name, { kind: 'person', id: p.pid, label: p.name });
  for (const x of cat.place) if (x.n >= 3) put(x.label, { kind: 'place', id: x.id, label: x.label });
  for (const x of cat.branch) put(x.label, { kind: 'branch', id: x.id, label: x.label });
  return m;
})();
const nameRe = new RegExp(
  [...nameIndex.keys()].sort((a, b) => b.length - a.length)
    .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\<script type="module" src="app.js">