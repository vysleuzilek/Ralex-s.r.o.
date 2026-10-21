/* Ralex S.R.O — sdílená logika: načítání appek a ukládání přímo do GitHub repa */
const RALEX = (() => {
  const host = location.hostname, seg = location.pathname.split("/").filter(Boolean);
  const onPages = host.endsWith(".github.io");
  const OWNER = onPages ? host.split(".")[0] : "vysleuzilek";
  const REPO = onPages && seg[0] && !/\.html?$/.test(seg[0]) ? decodeURIComponent(seg[0]) : (onPages ? host : "Ralex-s.r.o.");
  const BRANCH = "main";
  const KEY = "ralex_gh_token";
  const API = `https://api.github.com/repos/${OWNER}/${encodeURIComponent(REPO)}`;

  const token = {
    get() { try { return localStorage.getItem(KEY) || "" } catch { return "" } },
    set(t) { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY) } catch {} }
  };

  async function api(path, opts = {}, tok = token.get()) {
    const r = await fetch(API + path, {
      ...opts,
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(tok ? { Authorization: "Bearer " + tok } : {}), ...(opts.headers || {}) }
    });
    if (!r.ok) { const e = new Error("GitHub " + r.status); e.status = r.status; try { e.body = await r.json() } catch {} throw e }
    return r;
  }

  async function verify(tok) {
    const r = await api("", {}, tok);
    const j = await r.json();
    if (j.permissions && j.permissions.push === false) { const e = new Error("no push"); e.status = 403; throw e }
    return true;
  }

  async function readApps(ref) {
    const r = await api(`/contents/apps.json?ref=${ref || BRANCH}&t=${Date.now()}`, { headers: { Accept: "application/vnd.github.raw+json" } }).catch(e => { if (e.status === 404) return null; throw e });
    if (!r) return [];
    const list = JSON.parse(await r.text());
    return Array.isArray(list) ? list : [];
  }

  /* Pro návštěvníky z GitHub Pages; s tokenem čerstvě z API (Pages se obnovují ~1 min) */
  async function loadApps() {
    if (token.get()) { try { return (await readApps()).filter(ok) } catch {} }
    const r = await fetch("apps.json?t=" + Date.now(), { cache: "no-store" });
    return (await r.json()).filter(ok);
  }
  const ok = a => a && a.id && a.name;

  const isUrl = s => /^https?:\/\//i.test(s || "");
  const v = a => a.v ? "?v=" + a.v : "";
  const src = (a, f) => isUrl(f) ? f : `apps/${a.id}/${f}${v(a)}`;
  const raw = (a, f) => `https://raw.githubusercontent.com/${OWNER}/${encodeURIComponent(REPO)}/${BRANCH}/apps/${a.id}/${f}${v(a)}`;

  /* obrázek: GitHub Pages → raw.githubusercontent (hned po nahrání) → fallback */
  function img(a, f, alt, onFail) {
    const im = new Image(); im.alt = alt || ""; im.draggable = false; im.decoding = "async";
    let tried = false;
    im.onerror = () => { if (!tried && !isUrl(f)) { tried = true; im.src = raw(a, f) } else onFail && onFail() };
    im.src = src(a, f);
    return im;
  }

  const b64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = rej; fr.readAsDataURL(blob) });
  const utf8b64 = s => b64(new Blob([s], { type: "text/plain" }));

  /* Jeden commit: nahraje soubory, smaže staré, upraví apps.json */
  async function commit({ message, files = [], mutate, deleteDir, keepFor, onStep = () => {} }) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ref = await (await api(`/git/ref/heads/${BRANCH}`)).json();
      const head = ref.object.sha;
      const base = (await (await api(`/git/commits/${head}`)).json()).tree.sha;
      const apps = mutate(await readApps(head));

      const tree = [];
      const total = files.length + 1; let n = 0;
      for (const f of files) {
        onStep(++n, total, f.label || f.path);
        const content = f.blob ? await b64(f.blob) : await utf8b64(f.text);
        const blob = await (await api("/git/blobs", { method: "POST", body: JSON.stringify({ content, encoding: "base64" }) })).json();
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
      }
      onStep(++n, total, "apps.json");
      tree.push({ path: "apps.json", mode: "100644", type: "blob", sha: (await (await api("/git/blobs", { method: "POST", body: JSON.stringify({ content: await utf8b64(JSON.stringify(apps, null, 2) + "\n"), encoding: "base64" }) })).json()).sha });

      /* smazat soubory, které už appka nepoužívá (nebo celou složku) */
      if (deleteDir) {
        const r = await api(`/contents/apps/${deleteDir}?ref=${head}`).catch(e => { if (e.status === 404) return null; throw e });
        const list = r ? await r.json() : [];
        const keep = new Set((keepFor || []).map(x => `apps/${deleteDir}/${x}`));
        const writing = new Set(tree.map(t => t.path));
        for (const it of Array.isArray(list) ? list : []) if (it.type === "file" && !keep.has(it.path) && !writing.has(it.path)) tree.push({ path: it.path, mode: "100644", type: "blob", sha: null });
      }

      const t = await (await api("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: base, tree }) })).json();
      const c = await (await api("/git/commits", { method: "POST", body: JSON.stringify({ message, tree: t.sha, parents: [head] }) })).json();
      try { await api(`/git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha }) }); return apps }
      catch (e) { if (e.status === 422 && attempt === 0) continue; throw e }
    }
  }

  function errText(e) {
    if (e && e.status === 401) return "Token nefunguje nebo vypršel. Vlož nový.";
    if (e && e.status === 403) return "Token nemá práva zapisovat. V nastavení tokenu dej Contents → Read and write.";
    if (e && e.status === 404) return `Repo ${OWNER}/${REPO} nenalezeno. Token musí mít přístup k tomuhle repu.`;
    if (e && e.status === 422) return "GitHub soubor odmítl (moc velký?). Video dej max 95 MB, nebo použij YouTube odkaz.";
    if (e instanceof TypeError) return "Bez připojení, nebo je soubor moc velký. Zkus to znovu.";
    return "Uložení se nepovedlo (" + (e && e.message || "chyba") + ").";
  }

  return { OWNER, REPO, BRANCH, token, verify, loadApps, commit, img, src, raw, isUrl, errText };
})();
