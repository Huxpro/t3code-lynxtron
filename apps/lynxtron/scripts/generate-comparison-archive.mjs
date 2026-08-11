#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  collectGitArtifactProvenance,
  summarizeArtifactProvenance,
} from "./evidence-provenance.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDirectory, "..");
const repoRoot = path.resolve(appRoot, "../..");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const manifestPath = path.resolve(
  argValue("--manifest", path.join(appRoot, "evidence/manifests/main-shell.json")),
);
const outputPath = path.resolve(
  argValue("--output", path.join(appRoot, "evidence/2026-08-04/H4/comparison.html")),
);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const artifactPaths = manifest.states.flatMap((state) =>
  Object.values(state.evidence)
    .filter((evidence) => evidence.path)
    .map((evidence) => path.resolve(path.dirname(manifestPath), evidence.path)),
);
const artifactProvenance = collectGitArtifactProvenance({ repoRoot, artifactPaths });
const provenanceSummary = summarizeArtifactProvenance(artifactProvenance);
const relative = (artifact) =>
  artifact
    ? path
        .relative(path.dirname(outputPath), path.resolve(path.dirname(manifestPath), artifact))
        .split(path.sep)
        .join("/")
    : null;

const archive = {
  version: 1,
  id: manifest.id,
  label: manifest.label,
  note: relative(manifest.note),
  states: manifest.states.map((state) => {
    const resolved = { ...manifest.defaults, ...state.state };
    return {
      id: state.id,
      label: state.label,
      verdict: state.verdict,
      route: resolved.semanticRoute ?? resolved.route,
      theme: resolved.theme,
      size: `${resolved.viewport.width}x${resolved.viewport.height}`,
      snapshot: resolved.snapshotSha256,
      evidence: Object.fromEntries(
        Object.entries(state.evidence).map(([client, evidence]) => [
          client,
          {
            ...evidence,
            path: relative(evidence.path),
            assertions: relative(evidence.assertions),
            console: relative(evidence.console),
            provenance: evidence.path
              ? artifactProvenance.get(path.resolve(path.dirname(manifestPath), evidence.path))
              : null,
          },
        ]),
      ),
    };
  }),
  provenance: provenanceSummary,
};

const escapedArchive = JSON.stringify(archive).replaceAll("<", "\\u003c");
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>T3 Code Lynxtron · 严格证据档案</title>
<style>
:root{color-scheme:dark;--bg:#090a0c;--panel:#15181c;--panel2:#1d2126;--line:#30363d;--text:#f2f4f7;--muted:#9ca4ae;--good:#73d8a3;--bad:#ff8585;--warn:#f0c66d;--accent:#8fc7ff}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#151b26 0,transparent 30%),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.shell{width:min(1880px,calc(100% - 32px));margin:auto;padding:30px 0 72px}.mast{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:30px;border-bottom:1px solid var(--line);padding-bottom:22px}
.eyebrow{color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}.mast h1{font-size:42px;margin:8px 0 10px;letter-spacing:-.03em}.intro{color:var(--muted);line-height:1.65;max-width:850px;margin:0}
.summary{display:grid;grid-template-columns:repeat(2,minmax(130px,1fr));gap:10px}.metric{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}.metric strong{display:block;font-size:25px}.metric span{color:var(--muted);font-size:12px}
.toolbar{position:sticky;top:0;z-index:5;margin:20px 0;padding:12px;background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:12px;backdrop-filter:blur(16px);display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.toolbar label{color:var(--muted);font-size:12px}.toolbar select{margin-left:6px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:7px;padding:6px 9px}.count{margin-left:auto;color:var(--muted);font-size:12px}
.case{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:17px;margin:0 0 20px}.case-head{display:flex;gap:10px;align-items:baseline}.case h2{margin:0;font-size:19px}.meta{color:var(--muted);font-size:12px}.verdict{margin-left:auto;border-radius:999px;padding:3px 9px;font-size:11px;border:1px solid currentColor}
.verdict[data-kind="visual-certified"],.verdict[data-kind="native-certified"]{color:var(--good)}.verdict[data-kind="visual-gap"],.verdict[data-kind="invalid-harness"]{color:var(--bad)}.verdict[data-kind="incomplete"],.verdict[data-kind="capture-valid"]{color:var(--warn)}
.frames{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:13px}.frame{background:var(--panel2);border:1px solid var(--line);border-radius:10px;overflow:hidden;min-height:180px}.frame-head{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line);font-size:12px}.status{font-size:10px;text-transform:uppercase;letter-spacing:.08em}.status[data-status="retained"]{color:var(--good)}.status[data-status="pending"],.status[data-status="diagnostic"]{color:var(--warn)}
.provenance{font-size:10px;text-transform:uppercase;letter-spacing:.06em}.provenance[data-status="tracked-clean"]{color:var(--good)}.provenance[data-status="tracked-modified"]{color:var(--warn)}.provenance[data-status="untracked"],.provenance[data-status="missing"],.provenance[data-status="outside-repository"]{color:var(--bad)}
.image{display:block;width:100%;border:0;padding:0;background:#000;cursor:zoom-in}.image img{display:block;width:100%;height:auto}.missing{padding:28px 16px;color:var(--muted);font-size:13px;line-height:1.5}.links{display:flex;gap:12px;flex-wrap:wrap;padding:9px 10px;border-top:1px solid var(--line)}.links a{color:var(--accent);font-size:11px;text-decoration:none}
.gates{display:flex;gap:5px;flex-wrap:wrap;margin:8px 10px}.gate{border:1px solid var(--line);border-radius:999px;padding:2px 7px;font-size:10px;color:var(--muted)}.gate[data-value="pass"],.gate[data-value="capture-valid"],.gate[data-value="intentional-delta"]{color:var(--good)}.gate[data-value="gap"],.gate[data-value="invalid-harness"]{color:var(--bad)}
dialog{border:0;background:transparent;max-width:97vw;max-height:96vh}dialog::backdrop{background:#000c;backdrop-filter:blur(6px)}.lightbox-head{display:flex;justify-content:space-between;color:white;margin-bottom:8px}.lightbox img{max-width:96vw;max-height:88vh;display:block}.close{background:#222;color:white;border:1px solid #555;border-radius:8px;padding:5px 10px}
.legend{display:flex;gap:20px;flex-wrap:wrap;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:18px}
@media(max-width:900px){.mast{grid-template-columns:1fr}.frames{grid-template-columns:1fr}.summary{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body><main class="shell">
<header class="mast"><div><div class="eyebrow">Plan 11C · Manifest-first evidence</div><h1>同一状态，三种运行表面。</h1><p class="intro">真实 Web、Lynx-for-Web 与 Lynxtron Native 的严格证据档案。页面只消费 manifest；缺失、诊断和视觉 gap 会保持可见，不再把 capture validity 汇总成整体 PASS。</p></div><div class="summary" id="summary"></div></header>
<nav class="toolbar">
<label>界面<select id="stateFilter"><option value="all">全部</option></select></label>
<label>Verdict<select id="verdictFilter"><option value="all">全部</option></select></label>
<label>状态<select id="statusFilter"><option value="all">全部</option><option value="retained">Retained</option><option value="pending">Pending</option><option value="diagnostic">Diagnostic</option></select></label>
<span class="count" id="count"></span>
</nav>
<section id="gallery"></section>
<footer class="legend"><span><b>Web</b>：产品视觉与 composition authority</span><span><b>Lynx Web</b>：快速迭代面</span><span><b>Native</b>：最终平台 authority</span><span>Capture valid ≠ visual certified ≠ native certified</span></footer>
</main>
<dialog id="lightbox"><div class="lightbox-head"><span id="lightboxTitle"></span><button class="close" id="close">关闭</button></div><div class="lightbox"><img id="lightboxImage" alt="" /></div></dialog>
<script>
const archive=${escapedArchive};
const clients=[["web","Web authority"],["lynx","Lynx-for-Web"],["native","Lynxtron Native"]];
const filters={state:"all",verdict:"all",status:"all"};let visibleImages=[];let activeImage=0;
const esc=(v)=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const summary=document.querySelector("#summary"),gallery=document.querySelector("#gallery"),count=document.querySelector("#count");
const retained=archive.states.flatMap(s=>Object.values(s.evidence)).filter(e=>e.status==="retained").length;
const gaps=archive.states.filter(s=>s.verdict.includes("gap")||s.verdict==="invalid-harness").length;
summary.innerHTML=[["状态",archive.states.length],["Retained frames",retained],["Archived files",archive.provenance.archived+"/"+archive.provenance.total],["Gap/Invalid",gaps]].map(([l,v])=>\`<div class="metric"><strong>\${v}</strong><span>\${l}</span></div>\`).join("");
const stateFilter=document.querySelector("#stateFilter"),verdictFilter=document.querySelector("#verdictFilter"),statusFilter=document.querySelector("#statusFilter");
for(const s of archive.states)stateFilter.insertAdjacentHTML("beforeend",\`<option value="\${esc(s.id)}">\${esc(s.label)}</option>\`);
for(const v of [...new Set(archive.states.map(s=>s.verdict))])verdictFilter.insertAdjacentHTML("beforeend",\`<option value="\${esc(v)}">\${esc(v)}</option>\`);
function gateBadges(e){if(!e.gates)return"";return \`<div class="gates">\${Object.entries(e.gates).map(([k,v])=>\`<span class="gate" data-value="\${esc(v)}">\${esc(k)}: \${esc(v)}</span>\`).join("")}</div>\`}
function frame(client,label,e,state){const links=[["Assertions",e.assertions],["Console",e.console]].filter(x=>x[1]).map(([l,p])=>\`<a href="\${esc(p)}">\${l}</a>\`).join("");if(!e.path)return\`<article class="frame"><div class="frame-head"><b>\${label}</b><span class="status" data-status="\${esc(e.status)}">\${esc(e.status)}</span></div><div class="missing"><b>\${esc(e.reason??"缺少证据")}</b>\${gateBadges(e)}</div><div class="links">\${links}</div></article>\`;const provenance=e.provenance??{status:"unknown"};return\`<article class="frame"><div class="frame-head"><b>\${label}</b><span><span class="status" data-status="\${esc(e.status)}">\${esc(e.status)}</span> · <span class="provenance" data-status="\${esc(provenance.status)}">\${esc(provenance.archived?"archived":provenance.status)}</span></span></div><button class="image" data-image="\${esc(e.path)}" data-title="\${esc(state.label+" · "+label)}"><img src="\${esc(e.path)}" alt="\${esc(state.label+" · "+label)}" loading="lazy"></button>\${gateBadges(e)}<div class="links">\${links}</div></article>\`}
function render(){const visible=archive.states.filter(s=>(filters.state==="all"||s.id===filters.state)&&(filters.verdict==="all"||s.verdict===filters.verdict)&&(filters.status==="all"||Object.values(s.evidence).some(e=>e.status===filters.status)));gallery.innerHTML=visible.map(s=>\`<article class="case" id="\${esc(s.id)}"><div class="case-head"><h2>\${esc(s.label)}</h2><span class="meta">\${esc(s.route)} · \${esc(s.theme)} · \${esc(s.size)} · \${esc(String(s.snapshot).slice(0,10))}</span><span class="verdict" data-kind="\${esc(s.verdict)}">\${esc(s.verdict)}</span></div><div class="frames">\${clients.map(([id,label])=>frame(id,label,s.evidence[id],s)).join("")}</div></article>\`).join("");count.textContent=\`\${visible.length} / \${archive.states.length} states\`;visibleImages=[...gallery.querySelectorAll("[data-image]")];visibleImages.forEach((b,i)=>b.addEventListener("click",()=>openLightbox(i)))}
for(const [el,key] of [[stateFilter,"state"],[verdictFilter,"verdict"],[statusFilter,"status"]])el.addEventListener("change",()=>{filters[key]=el.value;render()});
const dialog=document.querySelector("#lightbox"),lightboxImage=document.querySelector("#lightboxImage"),lightboxTitle=document.querySelector("#lightboxTitle");
function openLightbox(i){activeImage=i;const b=visibleImages[i];lightboxImage.src=b.dataset.image;lightboxTitle.textContent=b.dataset.title;dialog.showModal()}
document.querySelector("#close").addEventListener("click",()=>dialog.close());dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close()});document.addEventListener("keydown",e=>{if(!dialog.open)return;if(e.key==="Escape")dialog.close();if(e.key==="ArrowRight"&&visibleImages.length)openLightbox((activeImage+1)%visibleImages.length);if(e.key==="ArrowLeft"&&visibleImages.length)openLightbox((activeImage-1+visibleImages.length)%visibleImages.length)});render();
</script></body></html>`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, html);
console.log(
  `generated ${path.relative(process.cwd(), outputPath)} from ${path.relative(process.cwd(), manifestPath)}`,
);
