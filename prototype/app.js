/**
 * 界面：**一个通用渲染器**，认 Entry 不认具体数据。
 *
 * 加一类条目 = 在 src/core/entries.ts 里写一个生成器，这个文件一行不用改。
 * 之前人、妻女、地方、篇目各写一套 view 函数，再加十类就是十份重复代码。
 */

/**
 * 图片地址。**取图只准走这一个函数。**
 *
 * ★ 出过一次事，而且是悄悄出的：
 *   打包时要把图片内嵌成 base64，靠的是一条正则去改源码里的
 *   图片路径那几处。可源码里有两种动态写法——
 *       模板字面量里一段　和　字符串拼接出来的一段
 *   那条正则的 `[^"]+` 把**整段表达式**当成文件名吃了进去，
 *   查表查不到，替换出来的 src 就是空的。
 *   於是**打出来的包里所有动态图片全是空的**，只剩 index.html 里
 *   两张写死的封面还在。而打包脚本一声不吭，还报「图片 36 张」。
 *
 *   正则改源码这条路本身就不该走。改成走函数：
 *   开发时 window.IMG 不存在，回退到 img/ 目录；打包时内嵌表已就位，直接取。
 *   两边同一段代码，打包脚本不用再动源码一个字。
 */
const PIC = (f) => (typeof window !== 'undefined' && window.IMG && window.IMG[f])
  || ('img/' + f);
import { search } from '../src/core/search.ts';
import { searchDocs } from '../src/core/docs.ts';
import { makeRegistry } from '../src/core/entries.ts';
import { edgeNote, countSameName } from '../src/core/lineage.ts';
import { srcText, unreverse } from '../src/core/entry.ts';
import { kinship, describe } from '../src/core/kinship.ts';
import { advancedSearch, ambiguity } from '../src/core/advanced.ts';
import { buildTree } from '../src/core/tree.ts';
import { doubtList } from '../src/core/doubts.ts';

// ★ 人工核定表（人工判定）一定要带上。
//   早先这份清单里没它，于是 app 里人工核过的判定全部不生效。
const [people, places, shou, era, passages, revisions, generations, images, trans, prefaces, manual, sameone] = await Promise.all(
  ['people', 'places', 'shou', 'erachart', 'prose_ents', 'revisions', 'generations', 'images', 'translations', 'prefaces', '人工判定', '同一个人'].map(n =>
    fetch('../data/' + encodeURIComponent(n) + '.json').then(r => r.json())));
const R = makeRegistry({ people, places, shou, era, passages, revisions, generations, images, trans, prefaces, manual, sameone });
const cat = R.catalogue();

const esc = s => (s ?? '').replace(/[<>&"]/g, c =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);
// `**这样**` 加粗。只认这一种记号，别的一律当普通字。
const bold = s => esc(s).split('**').map((x, i) => i % 2 ? `<b>${x}</b>` : x).join('');

const A = (kind, id, label, cls = '') =>
  `<a class="${cls}" onclick="open_('${kind}','${String(id).replace(/'/g, "\\'")}')">${esc(label)}</a>`;

// ══════════ 路由：交给浏览器自己管 ══════════
//
// 原来是自己维护一个 hist 数组。问题有两个：
//   ① 入口太多（open_ / showTree / showDoubts / showList / showCat / showAdv /
//      搜索…），漏掉一个，返回就跳错——用户遇到的「不管去哪，一按返回就跳回承健」
//      就是这么来的。
//   ② 浏览器自己的返回键（Chrome 的 ←、手机的返回手势）完全管不着。
//
// 现在**只有一条路**：所有跳转都走 go()，所有渲染都走 render()。
// 历史交给 history.pushState，返回键交给浏览器。
// 地址栏里也能看见现在在哪（#person/P-册4-0202-2-1-0），能收藏、能转发。

/**
 * 把当前视图画出来。**只读 state，不碰历史。**
 * 画成了返回 true，画不出（比如 pid 不存在）返回 false。
 */
function render(s) {
  if (!s || !s.v) { showHome(); return true; }
  switch (s.v) {
    case 'home':   showHome(); return true;
    case 'cat':    showCat(); return true;
    case 'adv':    showAdv(); return true;
    case 'kin':    showKin(); return true;
    case 'list':   showList(s.k); return true;
    case 'tree':   return drawTree(s.id);
    case 'doubts': drawDoubts(s.k || undefined); return true;
    case 'q':      $('q').value = s.q; runSearch(s.q); return true;
    default: {                                   // 条目：person / place / doc …
      const e = R.build[s.v]?.(s.id);
      if (!e) return false;
      $('results').classList.add('hide');
      paint(e);
      return true;
    }
  }
}

/**
 * 跳到一个视图，并把它记进浏览器历史。
 *
 * ★ **先画，画成了才改地址。** 反过来做的话，遇到一个不存在的 id，
 *   地址栏已经变了、页面还停在上一页——看着像「点了没反应」，
 *   而且这时按返回会退到一个假的历史条目。
 */
function go(s, replace = false) {
  if (!render(s)) return;
  const hash = s.v === 'home' ? '#'
    : s.id ? `#${s.v}/${encodeURIComponent(s.id)}`
    : s.k ? `#${s.v}/${encodeURIComponent(s.k)}`
    : s.q ? `#q/${encodeURIComponent(s.q)}`
    : `#${s.v}`;
  history[replace ? 'replaceState' : 'pushState'](s, '', hash);
}
window.addEventListener('popstate', e => render(e.state || fromHash()));

/** 地址栏里的 #… 反解成 state——直接粘链接进来也能打开。 */
function fromHash() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!h) return { v: 'home' };
  const i = h.indexOf('/');
  const v = i < 0 ? h : h.slice(0, i);
  const rest = i < 0 ? '' : h.slice(i + 1);
  if (v === 'q') return { v, q: rest };
  if (v === 'list' || v === 'doubts') return { v, k: rest };
  return rest ? { v, id: rest } : { v };
}

window.open_ = (kind, id) => { if (R.build[kind]?.(id)) go({ v: kind, id }); };

/**
 * 原文里一个名字对着好几个人时，点开先把**候选全摆出来**，各带出处。
 * 谱上只写了这两个字，没说是哪一位——就照这样告诉人，别替它选。
 */
const ENTPICK = [];
window.entPick = i => {
  const en = ENTPICK[i];
  if (!en) return;
  const kind = en.kind === 'person' ? 'person' : en.kind === 'place' ? 'place' : 'year';
  overlay(
    `<div class="grp">谱上这里写的是「${esc(en.text)}」——`
    + `全谱有 ${en.targets.length} 位对得上，谱没说是哪一位</div>`
    + en.targets.map(t => {
        const id = t.pid ?? t.id ?? '';
        const bits = [t.gen ? `第${t.gen}世` : '', t.src_human || '', t.matched_as || '', t.note || '']
          .filter(Boolean).map(esc).join('　');
        return `<div class="hit">`
          + (id ? A(kind, id, t.name || en.text) : esc(t.name || en.text))
          + `<div class="why">${bits}</div></div>`;
      }).join(''));
};
window.goBack = () => history.back();
// 返回键什么时候可按：这个标签页里我们走过至少一步就可以。
let steps = 0;
const _go = go;
go = (s, replace) => { const before = location.hash; _go(s, replace);
  if (!replace && location.hash !== before) steps++;
  $('back').disabled = steps === 0; };
window.addEventListener('popstate', () => { steps = Math.max(0, steps - 1);
  $('back').disabled = steps === 0; });
/** 顶栏那几个按钮：首页 / 高级搜索 / 全部目录 */
window.nav = v => go({ v });
/** 首页卡片 / 目录里点一类 */
window.list = k => {
  if (k === '@kin') return go({ v: 'kin' });
  if (k === '@adv') return go({ v: 'adv' });
  go({ v: 'list', k });
};


/**
 * 列表页（首页 / 目录 / 搜索结果 / 关系计算器…）用一个浮层显示。
 *
 * ★ 浮层是 position:absolute，**只盖住一屏**。页面往下滚，
 *   底下那一页的正文就露出来了——用户看到的「点首页，底部残留之前的东西」
 *   就是这么来的。所以显示浮层时必须**把正文清空、底部原文栏也清掉**。
 */
function overlay(html) {
  const box = $('results');
  $('body').innerHTML = '';          // ← 关键：把正文清掉，不然滚下去会露出来
  box.innerHTML = html;
  box.classList.remove('hide');
  $('subject').scrollTop = 0;
  box.scrollTop = 0;
  $('raw').querySelector('.src').textContent = '谱上原文';
  $('rawtext').textContent = '';
}

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
  if (e.image) h += `<img class="pic" src="${PIC(e.image)}" alt="${esc(e.title)}">`;

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
  //
  // 同名多个的那几处放这里，onclick 只传下标——
  // 名字和出处里带引号、括号，拼进 onclick 迟早出事（前面栽过两次）。
  const entHtml = (txt, ents) => {
    if (!ents?.length) return linkify(txt);
    const flat = txt.replace(/[\s　]/g, '');
    let out = '', at = 0;
    for (const en of ents) {
      out += esc(flat.slice(at, en.at));
      const kind = en.kind === 'person' ? 'person' : en.kind === 'place' ? 'place' : 'year';
      const many = en.targets.length > 1;
      // ★ 同名不止一个时**绝不直接跳第一个**。
      //   原先写的是 targets[0]：提示上说「同名 N 人，点开都列着」，
      //   点下去却直接进了第一个的卡片——那就是替谱做了决定。
      //   现在点开先摆出全部候选，各带出处，自己看是哪一个。
      if (many) {
        const i = ENTPICK.push(en) - 1;
        out += `<a class="ent ${en.kind} weak" title="${esc(en.why)}　`
          + `同名 ${en.targets.length} 位，点开都列着"`
          + ` onclick="entPick(${i})">${esc(en.text)}</a>`;
        at = en.at + en.text.length;
        continue;
      }
      const t = en.targets[0] || {};
      const id = t.pid ?? t.id ?? '';
      const title = [en.why, t.note].filter(Boolean).join('　');
      out += id
        ? `<a class="ent ${en.kind}${en.strong === false ? ' weak' : ''}"`
          + ` title="${esc(title)}"`
          + ` onclick="open_('${kind}','${String(id).replace(/'/g, "\'")}')">${esc(en.text)}</a>`
        : esc(en.text);
      at = en.at + en.text.length;
    }
    return out + esc(flat.slice(at));
  };

  // ★ sections 和 paras **两个都要画**。
  //   原先写的是 if(paras) … else sections，结果修谱届次页一旦有了序的全文，
  //   「这一届为什么修」那段就整个被挤没了。
  for (const s of e.sections) {
    if (s.heading) h += `<h2>${esc(s.heading)}</h2>`;
    h += `<div class="prose">${e.ents ? entHtml(s.text, e.ents) : linkify(s.text)}</div>`;
    if (s.note) h += `<div><small class="dim">${esc(s.note)}</small></div>`;
  }
  if (e.paras?.length) {
    // 原文一段、今译一段，配着往下读。原文在上，永远在。
    if (e.transNote || e.transBy) {
      h += `<div class="tnote">${esc(e.transNote ?? '')}`
        + (e.transBy ? `<b>　今译：${e.transBy === '谱' ? '谱自带白话本' : '本站所加'}</b>` : '')
        + '</div>';
    }
    h += '<div class="bi">' + e.paras.map(p =>
      `<div class="bir"><div class="src">${entHtml(p.src, e.ents)}</div>`
      + `<div class="cn">${bold(p.cn)}`          // ← esc 会把 ** 原样吐出来
      + (p.note ? `<div class="pnote">${bold(p.note)}</div>` : '')
      + `</div></div>`).join('') + '</div>';
  }

  // 跟他有关的人，接着往下排。这些本来就是「这个人的事」，
  // 以前放右栏要来回看，现在跟着正文读下去就行。
  h += e.relations.map(r => {
    // 一条都不截。谱上有多少列多少——CLAUDE.md 第二节。
    return `<h2>${esc(r.heading)}<span class="dim"> ${r.items.length}</span>`
      + (r.note ? ` <span class="dim">${esc(r.note)}</span>` : '') + '</h2>'
      + '<div class="rows">' + r.items.map(l =>
          // plain：谱上写了这个名字，但连不到条目。**照样列，只是不能点。**
          `<div class="row">${l.plain ? `<span class="plainname">${esc(l.label)}</span>`
            : A(l.kind, l.id, l.label,
              (l.warn ? 'warn' : '') + (l.dim ? ' out' : ''))}`
          + (l.note ? ` <small class="dim">${esc(l.note)}</small>` : '') + '</div>'
        ).join('') + '</div>';
  }).join('');

  if (e.sources.length) {
    h += '<div class="foot"><small class="dim">'
      + e.sources.map(s => esc(s.src_human ?? '')).filter(Boolean).join('　')
      + ''
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
  const t = buildTree(R.idx, pid, undefined, R.parents);
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
function drawTree(pid) {
  const me = R.idx.get(pid);
  if (!me) return false;
  const t = buildTree(R.idx, pid, undefined, R.parents);
  if (!t.rows.length) return false;
  let h = `<h1 class="title">${esc(me.name)}的世系<span class="gen">共 ${t.rows.length} 代</span></h1>`
    + '<div class="byline">你在最上面，往下一格就是往上一辈。</div>';
  if (t.summary) h += `<div class="calc">${bold(t.summary)}</div>`;

  h += '<div class="tree">';
  // 父亲画在**下一行**（往下 = 往上追）。已经并排画出来的候选就别再重复提。
  const nextRow = t.rows.map((_, i) =>
    new Set((t.rows[i + 1]?.cells ?? []).map(c => c.person.pid)));
  h += t.rows.map((r, ri) => treeRow(t, r, ri, nextRow[ri])).join('');
  h += '</div>';
  $('results').classList.add('hide'); $('body').innerHTML = h;
  $('subject').scrollTop = 0;
  return true;
}
window.showTree = pid => go({ v: 'tree', id: pid });

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
      //
      // ★ 只跟**同一种关系**比。
      //   过继的人有两位父亲，那不是「说不清」，那是谱按凡例第十三则双记的结果。
      //   原来这里把两种混在一起：启昌那一行左边走生父（朝相），
      //   於是右边的嗣父朝阳被当成「同名的还有」列了出来——
      //   而全谱只有一个朝阳（依据 sole_homonym＝全谱只有这一位），本该一个字都不说。
      //   人物卡上早已按 kind 分组（entries.ts 那一处），树这里漏了，是同一个错的第二处。
      // ★ 读全站那一份判定，不在前端另算一遍
      const _ps = R.parents(p);
      const cs = [..._ps.birth, ..._ps.heir, ..._ps.alsoNamed];
      // 本行别的格子已经摆出来的父亲，不算「还可能是谁」
      const shown = new Set(r.cells.map(x => x.via && x.via.parent).filter(Boolean));
      const alt = cs.filter(x =>
        (!c.via || x.edge.kind === c.via.kind)      // 同一种关系才比
        && !shown.has(x.edge.parent)
        && !below.has(x.edge.parent));
      if (alt.length) {
        const k = c.via ? c.via.kind : '父亲';
        // ★ 走的这一位就印在正上一格、而别的同名候选都不在 —— 那不是「分不出」。
        //   五世一图横着读，谱把谁摆在正上一格就是谁。照直说，另一位照旧列出。
        const mine = c.via && cs.find(x => x.edge.parent === c.via.parent);
        const settled = mine && mine.printedAbove && !alt.some(x => x.printedAbove);
        const others = alt.map(x =>
          A('person', x.edge.parent, x.person?.name || x.edge.parent_name)
          + `<small class="dim"> ${esc(x.person?.src_human ?? '')}`
          + (x.layoutNote ? `　${esc(x.layoutNote)}` : '') + '</small>').join('　');
        h += settled
          ? `<div class="tfork calm">谱把他印在正上一格，按五世一图的读法就是这一位。`
            + `同名的另一位：${others}</div>`
          : `<div class="tfork">谱上只写了「${esc(p.father_name)}」，`
            + `叫这个名字的不止一位，分不出哪个是${esc(k)}：${others}</div>`;
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
    .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

function linkify(text) {
  return esc(text).replace(nameRe, m => {
    const hits = nameIndex.get(m);
    if (!hits) return m;
    // ★ 自动互链本身就是一次推断——谱没说这两个字指的是这个人。
    //   所以一律标成虚线，鼠标停上去说清楚，不装成确定的事实。
    if (hits.length === 1) {
      return `<a class="maybe" title="谱上有人叫这个名字，未必就是指他"`
        + ` onclick="open_('${hits[0].kind}','${hits[0].id}')">${m}</a>`;
    }
    // 同名多人——不选，跳到同名列表
    return `<a class="warn" onclick="sameName('${m}')">${m}</a>`;
  });
}
window.sameName = form => {
  const hits = nameIndex.get(form) ?? [];
  overlay(`<div class="grp">谱上叫「${esc(form)}」的有 ${hits.length} 个　谱没说是哪一个</div>`
    + hits.map(x => {
      const p = R.idx.get(x.id);
      return `<div class="hit">${A(x.kind, x.id, x.label)}`
        + (p ? ` <small class="dim">第${p.gen}世${p.zi ? ' 字' + esc(p.zi.text) : ''}　`
          + `${esc(p.father_name ? p.father_name + '之子' : '')}　${esc(p.src_human)}</small>` : '')
        + '</div>';
    }).join(''));
};

// ══════════ 首页：能点的入口 ══════════
const HOME = [
  ['高级搜索', '@adv', () => '按亲属找',
   '两个士利分不开？加一句「父亲是学义」就唯一了。父母、配偶、子女、兄弟、葬地都能当条件'],
  ['算一算该叫什么', '@kin', () => '选两个人',
   '纯算法。共祖全部列出，不挑一个；结构事实在前，通用叫法在后并标明'],
  ['祖先的故事', 'kind', () => passages.length + ' 段',
   '德懋讨饭养母 · 咸丰七年御贼 · 「谨请先祖赦罪」'],
  ['老照片和山图', 'image', () => images.length + ' 张',
   '16 幅手绘山图 · 祠堂 · 堂屋 · 门口塘 · 祖墓碑记 · 2016 征地协议原件'],
  ['祖山和坟地', 'place', () => cat.place.length + ' 处',
   '云山 712 人 · 胡家林 141 · 牌子山 67 · 南池寺 22'],
  ['历届修谱', 'revision', () => revisions.length + ' 届',
   '康熙四十九年（1710）到二〇一六年，三百零六年，十届没断'],
  ['谱前面的文章', 'doc', () => shou.length + ' 篇',
   '源流序 · 旧序 · 凡例二十则 · 家规十二则 · 各房私山 · 合户雜据'],
  ['房支世系', 'branch', () => cat.branch.length + ' 支',
   '朝阳公 611 人 · 学义公 384 人 · 朝纪公 173 人'],
  ['按世次看', 'gen', () => cat.gen.length + ' 世',
   '第一世胜二（1227）到第三十世，七百七十二年'],
  ['娶进来的姓', 'surname', () => cat.surname.length + ' 姓',
   '王 82 · 程 76 · 李 73 · 柳 58 —— 嫁进张家的女子'],
  ['功名身份', 'title', () => cat.title.length + ' 种',
   '贡生 · 太学生 · 儒士 · 陆军参谋 · 律师'],
  ['谱上的标记', 'mark', () => cat.mark.length + ' 种',
   '立嗣 147 · 出嗣 117 · 无后 98 · 迁徙 52 · 有碑 36'],
];

function showHome() {
  overlay('<div class="hero"><div class="hero-t">张氏宗谱 · 胜二户</div>'
    + '<div class="hero-s">湖北黄梅 · 南宋宝庆丁亥（1227）迁梅至今 · 二十七世 · 全谱一千三百一十四页</div>'
    + '<div class="hero-s">收 ' + people.length.toLocaleString() + ' 人，'
    + '连谱上提到而没有单独一条的妻、女、子在内共 '
    + R.idx.size.toLocaleString() + ' 人</div></div>'
    + '<div class="cards">'
    + HOME.map(([t, k, n, d]) =>
        `<div class="card" onclick="list('${k}')">`
        + '<div class="card-t">' + t + '<span class="card-n">' + n() + '</span></div>'
        + '<div class="card-d">' + d + '</div></div>').join('')
    + '</div>');
};

const LIST_TITLE = {
  kind: '祖先的故事', image: '老照片和山图', place: '祖山和坟地', revision: '历届修谱',
  doc: '谱前面的文章', branch: '房支世系', gen: '按世次看', surname: '娶进来的姓',
  title: '功名身份', mark: '谱上的标记',
};

function showList(k) {
  if (k === '@kin') { enterKin(); return; }
  if (k === '@adv') { showAdv(); return; }
  let rows = cat[k] || [];
  if (k === 'kind') {
    // 按类翻。**长的在前**——长的才是真有话说的；三五个字的碎片折到后面。
    const MIN = kindAll ? 0 : 8;
    const cnAll = passages.filter(p => p.cn).length;
    const row = p => '<div class="hit">'
      + A('passage', p.id, p.flat.slice(0, 34) + (p.chars > 34 ? '…' : ''))
      + ' <small class="dim">' + esc(p.host_name) + '（第' + p.gen + '世）　'
      + p.chars + '字' + (p.cn ? '　<b>有今译</b>' : '')
      + (p.author?.targets?.some(t => t.strong)
          ? '　' + esc(p.author.targets.find(t => t.strong).name) + ' 写的' : '')
      + '</small></div>';
    const cats = [...cat.kind, { id: '未分类', label: '还没归类', n:
      passages.filter(p => p.kinds.includes('未分类')).length }];
    overlay('<div class="grp">祖先的故事　' + passages.length + ' 段　'
      + passages.reduce((a, p) => a + p.chars, 0).toLocaleString() + ' 字　'
      + '<b>' + cnAll + ' 段配了今译</b></div>'
      + '<div class="calc">' + (kindAll ? '' : '先列每类里 8 字以上的。')
      + '<button class="lk" onclick="toggleKindAll()">'
      + (kindAll ? '只看有分量的' : '连零碎的一起看') + '</button></div>'
      + cats.map(c => {
          const xs = passages.filter(p => p.kinds.includes(c.id) && p.chars >= MIN)
            .sort((a, b) => b.chars - a.chars);
          if (!xs.length) return '';
          const cn = xs.filter(p => p.cn).length;
          return '<div class="grp2">' + esc(c.label) + '　' + xs.length + ' 段'
            + (cn ? '　<small class="dim">' + cn + ' 段有今译</small>' : '') + '</div>'
            + xs.map(row).join('');
        }).join('')); return;
  }
  if (k === 'image') {
    const byKind = {};
    for (const x of images) (byKind[x.kind] ??= []).push(x);
    overlay('<div class="grp">老照片和山图　' + images.length + ' 张</div>'
      + Object.entries(byKind).map(([kk, xs]) =>
        '<div class="grp2">' + esc(kk) + '　' + xs.length + ' 张</div><div class="gal">'
        + xs.map(x => `<figure onclick="open_('image','${x.id}')">`
            + '<img src="' + PIC(x.file) + '" loading="lazy" alt="' + esc(x.title) + '">'
            + '<figcaption>' + esc(x.title) + '</figcaption></figure>').join('')
        + '</div>').join('')); return;
  }
  if (k === 'place') rows = rows.filter(x => x.n >= 2);
  overlay('<div class="grp">' + (LIST_TITLE[k] || k) + '　' + rows.length + '</div>'
    + '<div class="cloud">' + rows.map(r =>
      A(k, r.id, r.label) + '<small class="dim">' + (r.n || r.note || '') + '</small>').join('　')
    + '</div>');
};

// ══════════ 目录：能逛 ══════════
function showCat() {
  const sec = (title, rows, kind) =>
    `<div class="grp">${title}　${rows.length}</div><div class="cloud">`
    + rows.map(r => `${A(kind, r.id, r.label)}<small class="dim">${r.n}</small>`).join('　')
    + '</div>';
  overlay(sec('房支世系', cat.branch, 'branch')
    + sec('世次', cat.gen, 'gen')
    + sec('功名身份', cat.title, 'title')
    + sec('标记', cat.mark, 'mark')
    + sec('地方', cat.place.filter(x => x.n >= 3), 'place')
    + sec('娶进来的姓', cat.surname, 'surname')
    + sec('嫁出去的姓', cat.husbandSurname, 'surname')
    + sec('谱前面的文章', cat.doc, 'doc')
    + sec('记事', cat.kind, 'kind')
    + sec('历届修谱', cat.revision, 'revision'));
};

// ══════════ 搜索 ══════════
let timer;
// 「按类翻」是否连三五个字的零碎一起列。
// 用函数而不是内联 onclick 里写引号——嵌套引号被吃过一次。
let kindAll = false;
window.toggleKindAll = () => { kindAll = !kindAll; showList('kind'); };
// showList/showCat/showAdv/showKin/showHome 由 render() 调用，只负责画；
// 顶栏按钮走下面这几个包装，才进历史。
$('q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(doSearch, 170); });
$('q').addEventListener('keydown', e => {
  if (e.key === 'Escape') { $('results').classList.add('hide'); e.target.blur(); }
});

/**
 * 命中理由：**对上了就不写，只写对不上的。**
 * 搜「火生」搜出字就叫火生的人，再标一句「字完全相同」是废话；
 * 搜出来的是「差一字」「同音」「单字包含」，那才必须说清楚。
 */
function whyLine(m) {
  return m && m.score === 1 ? '' : (m ? m.why : '');
}

// 打字时只画结果，**不进历史**——每敲一个字都塞一条历史，返回键就废了。
// 回车（或点结果）才算一次「去过」。
function doSearch() { runSearch($('q').value.trim(), false); }
window.setQ = q => { $('q').value = q; go({ v: 'q', q }); };

function runSearch(qv, fromRoute = true) {
  // ★ 顶栏一搜索就退出关系计算器。
  //   看着就像「搜索第二次失效」。
  const q = (qv ?? $('q').value).trim();
  if (!q) { $('results').classList.add('hide'); $('qhint').textContent = ''; return; }
  // ★ 搜**全部 4,999 人**，不只是有独立条目的那 2,233。
  //   妻女现在各有 pid、各有一页，跟男人一样进同一个索引。
  //   早先分两路搜（search(people) + searchReferenced(refs)），
  //   她们在搜索里是另一类东西、点开是另一种页——那是她们的第二套身份。
  const everyone = [...R.idx.values()];
  const ph = search(everyone, q), dh = searchDocs(shou, q);
  const dn = dh.reduce((a, x) => a + x.spots.length, 0);
  $('qhint').textContent = `${ph.length} 人 · 谱文 ${dn} 处`;
  let h = '';
  if (ph.length) {
    h += `<div class="grp">人　${ph.length}</div>`;
    for (const x of ph) {
      const p = x.person;
      const why = [whyLine(x.matches[0]),
                   x.matches.length > 1 ? `另有 ${x.matches.length - 1} 处` : '',
                   p.src_human].filter(Boolean).map(esc).join('　');
      h += `<div class="hit">${A('person', p.pid, p.name)} `
        + `<small class="dim">第${p.gen}世${p.zi ? ' 字' + esc(p.zi.text) : ''}</small>`
        + `<div class="why">${why}</div></div>`;
    }
  }
  if (dh.length) {
    h += `<div class="grp">谱前面的文章里　${dn} 处</div>`;
    for (const x of dh) {
      h += `<div class="hit">${A('doc', x.doc.id, x.doc.title_read || x.doc.title)}`
        + ` <small class="dim">卷首第${x.doc.page_from}页 · ${x.spots.length}处`
        + (x.isTable ? ' · 这是一张年号对照表' : '') + '</small>'
        + x.spots.slice(0, 3).map(s =>
          `<div class="why">…${esc(s.before)}<mark>${esc(s.hit)}</mark>${esc(s.after)}…</div>`).join('')
        + (x.spots.length > 3 ? `<div class="why dim">还有 ${x.spots.length - 3} 处</div>` : '')
        + '</div>';
    }
  }
  overlay(h || '<div class="grp">没找到</div>');
}

// 启动画哪一页，统一交给最下面那段路由（地址栏有 #… 就开那一页，没有就开首页）。
// 这里原先直接 open_ 了一个写死的人，於是「首页」底下总压着他那张卡。
// 加载页整整五秒：0–3.1s 静置看封面，3.1–4.6s 掀开，4.6–5s 淡出。
// 只在进入和刷新时出现一次，不做常驻背景。
setTimeout(() => {
  const s = $('splash');
  s.style.opacity = '0';
  setTimeout(() => s.remove(), 700);
}, 4600);

// ══════════ 关系计算器 ══════════
// CLAUDE.md 第六节：「选两个人，算出该叫什么。纯算法，绝对可靠。」
// 三条守住：① 共祖全列不挑一个 ② 结构事实在前、通用叫法在后并标明
// ③ 血缘与宗法两条路都算，谁也不替谱选。

/**
 * 算一算该叫什么。
 *
 * ★ **自带两个输入框，不碰顶栏那个搜索框。**
 *   原来是一个全局 kinMode：点开计算器后，顶栏搜到人再点，就填进格子。
 *   问题是顶栏搜索一运行就会把 kinMode 关掉（那是修「搜第二次失效」时加的），
 *   两个功能抢同一个框，结果选完第一个人就掉回搜索结果里了。
 *   现在每格自己一个输入框、结果就列在格子下面，互不干扰。
 */
/**
 * 算一算该叫什么。
 *
 * ★ 两条都是踩过坑才这么写的：
 *
 *   ① **自带输入框，不碰顶栏那个搜索框。**
 *      原来用一个全局 kinMode 劫持顶栏搜索，而顶栏搜索一运行就把它关掉，
 *      结果选完第一个人就掉回搜索结果里。
 *
 *   ② **打字时只换结果列表，绝不重画输入框。**
 *      整页重画会把 input 元素换掉，中文输入法正在拼的字当场被打断——
 *      用户得先打完再按空格才认。所以 kinType 只改 .kinhits 的内容。
 */
function kinHits(key, q) {
  if (!q.trim()) return '';
  const all = search(people, q.trim());
  if (!all.length) return '<small class="dim">没找到这个名字</small>';
  return all.slice(0, 8).map(x =>
    `<div class="hit"><a onclick="kinSet('${key}','${x.person.pid}')">`
    + `${esc(x.person.name)}</a>`
    + `<small class="dim">　第${x.person.gen}世`
    + `${x.person.zi ? '　字' + esc(x.person.zi.text) : ''}`
    + `　${esc(x.person.src_human)}</small></div>`).join('')
    + (all.length > 8
       ? `<div class="hit"><small class="dim">还有 ${all.length - 8} 个</small></div>`
       : '');
}

function showKin() {
  const slot = (key, label, w) => `<div class="slot${w ? ' on' : ''}">`
    + `<div class="slot-l">${label}</div>`
    + (w
      ? `<div class="kinname">${esc(w.name)}`
        + `<small class="dim">　第${w.gen}世${w.zi ? '　字' + esc(w.zi.text) : ''}`
        + `　${esc(w.src_human)}</small>`
        + `<button class="lk" onclick="kinClear('${key}')">换一个</button></div>`
      : `<input class="kinq" id="kinq-${key}" placeholder="输名字，如 承健"`
        + ` oninput="kinType('${key}')">`
        + `<div class="kinhits" id="kinhits-${key}"></div>`)
    + '</div>';

  let h = '<div class="grp">算一算该叫什么</div>'
    + '<div class="kinpick">'
    + slot('A', '这一位', kinA) + slot('B', '和这一位', kinB)
    + '</div>'
    ;

  if (kinA && kinB) {
    const r = kinship(R.idx, kinA.pid, kinB.pid, R.parents);
    h += '<div class="kinres">';
    if (r.directTerm) {
      h += `<div class="kinbig">${esc(kinB.name)} 是 ${esc(kinA.name)} 的<b>${esc(r.directTerm)}</b></div>`
        + `<div><small>${esc(r.note)}</small></div>`;
    } else if (r.commons.length) {
      const c = r.commons[0], d = describe(r, c);
      h += `<div class="kinbig">通用叫法：<b>${esc(d.call)}</b>`
        + '<small class="dim"></small></div>'
        + `<div>${esc(d.fact)}</div>`;
    } else {
      h += `<div class="kinbig">${esc(r.note)}</div>`;
    }
    h += '<div style="margin-top:6px"><small class="dim">世次：'
      + `${esc(kinA.name)} 第 ${kinA.gen} 世，${esc(kinB.name)} 第 ${kinB.gen} 世，`
      + (r.genDiff === 0 ? '同辈' : `差 ${Math.abs(r.genDiff)} 辈`)
      + '</small></div></div>';

    if (r.commons.length) {
      h += `<div class="grp">共同的祖先　${r.commons.length} 个，全部列出</div>`
        + r.commons.map(c => {
          const d = describe(r, c);
          return `<div class="hit">${A('person', c.pid, c.name)}`
            + ` <small class="dim">第${c.gen}世</small>`
            + (c.viaAdoption ? ' <span class="tag hot">这条路经过过继</span>' : '')
            + `<div class="why">${esc(kinA.name)}往上 ${c.minA} 代`
            + `　${esc(kinB.name)}往上 ${c.minB} 代`
            + (r.directTerm ? '' : `　通用叫法：${esc(d.call)}`)
            + '</div></div>';
        }).join('');
    }
  }
  overlay(h);
  // 画完把光标放回还空着的那一格
  const el = $(kinA ? 'kinq-B' : 'kinq-A');
  if (el) el.focus();
}

let kinA = null, kinB = null;
/** 打字：**只换结果列表**，输入框原样不动，输入法才不会被打断。 */
window.kinType = key => {
  const box = $('kinhits-' + key), inp = $('kinq-' + key);
  if (box && inp) box.innerHTML = kinHits(key, inp.value);
};
window.kinSet = (key, pid) => {
  const p = R.idx.get(pid);
  if (!p) return;
  if (key === 'A') kinA = p; else kinB = p;
  showKin();
};
window.kinClear = key => { if (key === 'A') kinA = null; else kinB = null; showKin(); };

window.enterKin = () => go({ v: 'kin' });

// ══════════ 高级搜索：用亲属关系分开重名 ══════════
// 谱里两个士利、两个铣发、三个壁和。加一句「父亲是学义」就唯一了。
// 每一格都是谱上写死的字，不做推断、不打分。
const ADV = [
  ['name', '名 / 字 / 讳 / 号'], ['father', '父亲叫'], ['spouse', '配偶叫'],
  ['son', '儿子叫'], ['daughter', '女儿（适X）'], ['sibling', '兄弟是'],
  ['gen', '第几世'], ['branch', '哪一房'], ['place', '葬在'],
  ['title', '功名'], ['mark', '标记'],
];
let advC = {};

let advDirty = false;

function showAdv() {
  const rows = ADV.map(([k, label]) =>
    `<div class="advrow"><label>${label}</label>`
    + `<input id="adv-${k}" value="${esc(advC[k] ?? '')}" `
    + `oninput="advSet('${k}',this.value)" `
    + `onkeydown="if(event.key==='Enter')advRun()"></div>`).join('');
  let h = '<div class="grp">高级搜索</div>'
    + `<div class="advgrid">${rows}</div>`
    + '<div class="advbar"><button class="btn" onclick="advRun()">搜</button>'
    + '<button class="btn ghost" onclick="advClear()">清空</button>'
    + '<small class="dim">填几格都行，按「搜」或回车</small></div>';

  const c = {};
  for (const [k] of ADV) {
    const v = (advC[k] ?? '').trim();
    if (v) c[k] = k === 'gen' ? Number(v) : v;
  }
  if (advDirty && Object.keys(c).length) {
    const hits = advancedSearch(people, places, c, R.parents);
    h += `<div class="grp">${hits.length} 人</div>`
      + hits.map(x => `<div class="hit">${A('person', x.person.pid, x.person.name)}`
        + ` <small class="dim">第${x.person.gen}世`
        + (x.person.zi ? ' 字' + esc(x.person.zi.text) : '') + '</small>'
        + x.why.map(w => `<div class="why">${esc(w.field)}：${esc(w.matched.slice(0, 60))}</div>`).join('')
        + `<div class="why dim">${esc(x.person.src_human)}</div></div>`).join('');
    // 只填了名字且重名时，提示加一条
    if (c.name && !c.father && hits.length > 1) {
      const amb = ambiguity(people, c.name);
      if (amb.length > 1) h = h.replace('</div>\n', '</div>')
        .replace(`<div class="grp">${hits.length} 人</div>`,
          `<div class="grp">${hits.length} 人</div>`
          + `<div class="brk">谱上叫「${esc(c.name)}」的不止一个。`
          + `加一句「父亲叫什么」通常就能分开——谱里从来是连父名一起认人的。</div>`);
    }
  }
  overlay(h);
};
// ★ 不做实时搜索。每敲一个字就重画整面，光标会被抢走，字都打不进去。
//   只把值记下来，按「搜」或回车才算。
window.advSet = (k, v) => { advC[k] = v; };
window.advRun = () => { advDirty = true; showAdv(); };
window.advClear = () => { advC = {}; advDirty = false; showAdv(); };

// ══════════ 谱上没说清的 ══════════
//
// ★ 这一页**不自己判任何事**，只把判定层（src/core/doubts.ts）的分档摊开。
//   上一版是 `tools/build_doubts.py` 算好写进 data/doubts.json，那个脚本
//   自己重写了一遍反向匹配、版面判断、同名排除、年代窗口——全谱两套判定，
//   而且认的还是旧字段。页面上报「同名分不清 123 人」，判定层这边其实是 0。
//   现在台账、这一页、闸走同一个函数，分档相加正好是全谱人数。
//
// 按「**这是谁的问题**」分，不按现象分：
//   谱上留空　　—— 不是问题。「纪其所可知，阙其所未知」。谱没意见，我们也没意见。
//   谱自己对不上 —— **谱的问题**。原话判出来了，可版面／房支跟原话对不上。
//   靠定式定的　—— 不是谱的原话，是按谱自己的版面规矩定的。要人回去看一眼。
const DOUBT = doubtList(R, revisions);

function drawDoubts(key) {
  const B = DOUBT.buckets, T = DOUBT.tally;
  const K = Object.keys(B);
  const LABEL = {
    靠定式定的: '谱没把话说死，按版面定式定的',
    谱自己对不上: '谱自己两处对不上',
    说不清: '说不清',
    谱没写父亲: '谱上就没写父亲',
    谱上留空: '谱自己写了「缺／未详」',
    名目对不上人: '修谱名目对不上人',
  };
  const need = B.靠定式定的.length + B.谱自己对不上.length + B.说不清.length;
  let h = '<h1 class="title">谱上没说清的</h1>'
    + '<div class="byline">「纪其所可知，阙其所未知」——谱上没说清的，全列在这里。</div>'
    + '<div class="calc">'
    + `有独立条目的 <b>${T.合计}</b> 人，父子关系按「凭什么说没错」分档：<br>`
    + `谱的原话判定、交叉验证无冲突 <b>${T.原话无冲突}</b>　`
    + `判定层留了说明、人工逐条核过 <b>${T.已核无误}</b>　`
    + `逐案翻回谱面核定 <b>${T.人工核定}</b>　`
    + `<span class="dim">（相加 ${T.原话无冲突 + T.已核无误 + T.人工核定}）</span><br>`
    + `真要人回去看一眼的是 <b>${need}</b> 位：`
    + `谱自己前后不一致 ${B.谱自己对不上.length}，靠版面定式定的 ${B.靠定式定的.length}，说不清 ${B.说不清.length}。<br>`
    + `另有 <b>${B.谱没写父亲.length}</b> 位谱上就没写父亲，`
    + `<b>${B.谱上留空.length}</b> 处谱自己写着「缺」「未详」——**那不算问题**，`
    + '修史本来就不能尽善尽美，谱没写我们也不写。'
    + '</div>'
    + '<div class="linebar">'
    + K.map(k => `<button class="lk" onclick="showDoubts('${k}')">`
        + `${esc(LABEL[k] ?? k)} <b>${B[k].length}</b></button>`).join(' ')
    + '</div>';

  const show = key ? [key] : K;
  for (const k of show) {
    const rows = B[k];
    h += `<h2>${esc(LABEL[k] ?? k)}<span class="dim"> ${rows.length}</span></h2>`;
    if (!key && rows.length > 10) {
      h += `<div class="calc">先列 10 条。`
        + `<button class="lk" onclick="showDoubts('${k}')">看全部 ${rows.length} 条</button></div>`;
    }
    h += (key ? rows : rows.slice(0, 10)).map(x => doubtRow(k, x)).join('');
  }
  $('results').classList.add('hide');
  $('body').innerHTML = h;
  $('subject').scrollTop = 0;
}
window.showDoubts = key => go({ v: 'doubts', k: key || '' });

function doubtRow(k, x) {
  if (k === '名目对不上人') {
    return `<div class="dbt"><b>${esc(x.era)}</b> 那一届名目里的 `
      + `<b>${esc(x.name || x.raw)}</b>`
      + `<div class="q">${esc(x.why)}`
      + (x.cands?.length ? `　同名候选 ${x.cands.length} 个：`
          + x.cands.map(c => A('person', c.pid, `${c.gen}世·${c.src}`)).join('　') : '')
      + `<br><small class="raw">名目原文：${esc(x.raw ?? '')}</small></div></div>`;
  }
  const who = `${A('person', x.pid, x.name)} `
    + `<small class="dim">第${x.gen}世　${esc(x.src_human)}</small>`;
  if (k === '谱上留空') {
    return `<div class="dbt">${who}`
      + `<div class="q">${esc(x.why)}<small class="raw">　「${esc(x.raw)}」</small></div></div>`;
  }
  return `<div class="dbt">${who}`
    + `<div class="q">${esc(x.why)}`
    + (x.father_name ? `<br>谱上写父名「${esc(x.father_name)}」` : '')
    + (x.chosen?.length
        ? `　判定给的是 ${x.chosen.map(c => A('person', c.pid, c.name) + `<small class="dim">（${esc(c.kind)}）</small>`).join('、')}`
        : '')
    + (x.basis ? `<br><small class="raw">依据：${esc(x.basis)}</small>` : '')
    + (x.cross ? `<br><small class="dim">${esc(x.cross)}</small>` : '')
    + '</div></div>';
}


// ══════════ 启动 ══════════
// 地址栏带 #… 就直接开那一页（能收藏、能把链接发给别人）。
render(fromHash());
history.replaceState(fromHash(), '', location.hash || '#');
