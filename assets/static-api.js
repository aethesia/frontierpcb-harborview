// All API-shaped requests are evaluated locally from an immutable static export.
const nativeFetch = globalThis.fetch.bind(globalThis);
const manifestResponse = await nativeFetch('/data/manifest.json');
if (!manifestResponse.ok) throw new Error('无法加载静态数据索引');
const manifest = await manifestResponse.json();
const cache = new Map();

function canonical(path) {
  return path.split('/').map(p => encodeURIComponent(decodeURIComponent(p))).join('/');
}
function response(value, status = 200) {
  return new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});
}
async function readEntry(entry) {
  const result = await nativeFetch(entry.url);
  if (!result.ok) throw new Error(`静态文件加载失败 (${result.status})`);
  if (!entry.gzip) return new Response(result.body, {headers: {'Content-Type': entry.type}});
  // Some hosts transparently decode .gz; inspect the magic bytes before decoding.
  const bytes = new Uint8Array(await result.arrayBuffer());
  const compressed = bytes[0] === 31 && bytes[1] === 139;
  const stream = new Blob([bytes]).stream();
  return new Response(compressed ? stream.pipeThrough(new DecompressionStream('gzip')) : stream,
    {headers: {'Content-Type': entry.type}});
}
async function dataset(key) {
  if (!cache.has(key)) {
    const entry = manifest.routes[key];
    if (!entry) throw new Error(`未找到静态数据: ${key}`);
    cache.set(key, readEntry(entry).then(r => r.json()).catch(e => {cache.delete(key); throw e;}));
  }
  return cache.get(key);
}
function paginate(items, params) {
  const page = Math.max(1, Number(params.get('page')) || 1);
  const page_size = Math.max(1, Math.min(100, Number(params.get('page_size')) || 100));
  return {items: items.slice((page - 1) * page_size, page * page_size), total: items.length,
    page, page_size, total_pages: Math.ceil(items.length / page_size)};
}
function matches(value, selected) {
  return !selected.length || (Array.isArray(value) ? value.some(v => selected.includes(v)) : selected.includes(value));
}
function filterList(items, params, jobs) {
  const query = (params.get('q') || '').toLowerCase();
  const fields = jobs ? ['name','display_name','datasets','agents','providers','models'] :
    ['task_name','agent_name','model_provider','model_name','source'];
  let result = items.filter(row => (!query || fields.some(k => String(row[k] ?? '').toLowerCase().includes(query))) &&
    matches(row[jobs ? 'agents' : 'agent_name'], params.getAll('agent')) &&
    matches(row[jobs ? 'providers' : 'model_provider'], params.getAll('provider')) &&
    matches(row[jobs ? 'models' : 'model_name'], params.getAll('model')) &&
    (jobs || matches(row.task_name, params.getAll('task'))));
  if (jobs) {
    const windows = params.getAll('date').map(v => ({today:1,week:7,month:30})[v]).filter(Boolean);
    if (windows.length) result = result.filter(row => Date.parse(row.started_at) >= Date.now() - Math.max(...windows)*86400000);
  }
  const sort = params.get('sort_by');
  if (sort) {
    const order = params.get('sort_order') === 'desc' ? -1 : 1;
    result.sort((a,b) => {
      const av = sort === 'exception_types' ? a[sort]?.[0] ?? '' : a[sort];
      const bv = sort === 'exception_types' ? b[sort]?.[0] ?? '' : b[sort];
      if (av == null || bv == null) return av == null ? bv == null ? 0 : 1 : -1;
      return order * (typeof av === 'number' ? av-bv : String(av).localeCompare(String(bv)));
    });
  }
  return result;
}
export function staticURL(input) {
  const url = new URL(input, globalThis.location?.origin || 'http://localhost');
  const entry = manifest.routes[canonical(url.pathname)];
  return entry && !entry.gzip ? entry.url : input;
}
export async function staticFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url,
    globalThis.location?.origin || 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
  const method = (init.method || input?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return response({detail:'静态展示版本不支持写入操作'}, 405);
  const path = canonical(url.pathname), params = url.searchParams;
  try {
    if (path === '/api/jobs') return response(paginate(filterList(await dataset(path),params,true),params));
    if (/^\/api\/jobs\/[^/]+\/tasks$/.test(path)) return response(paginate(filterList(await dataset(path),params,false),params));
    if (/^\/api\/jobs\/[^/]+\/trials$/.test(path)) {
      let rows = await dataset(path);
      for (const field of ['task_name','source','agent_name','model_name']) {
        if (!params.has(field)) continue;
        rows = rows.filter(row => (field === 'model_name' && row.model_provider ? row.model_provider+'/'+row.model_name : row[field]) === params.get(field));
      }
      return response(paginate(rows,params));
    }
    if (path === '/api/compare') {
      const data = await dataset(path), jobs = params.getAll('job');
      if (!jobs.length) return response({detail:'请选择至少一个批次'},400);
      const agent_models = data.agent_models.filter(a => jobs.includes(a.job_name));
      const keys = new Set(agent_models.map(a => a.key));
      const cells = Object.fromEntries(Object.entries(data.cells).map(([task,values]) =>
        [task,Object.fromEntries(Object.entries(values).filter(([key])=>keys.has(key)))]).filter(([,values])=>Object.keys(values).length));
      const average = values => values.length ? values.reduce((sum,c)=>sum+(c.avg_reward||0),0)/values.length : 0;
      const tasks = data.tasks.filter(t=>cells[t.key]).sort((a,b)=>average(Object.values(cells[b.key]))-average(Object.values(cells[a.key])) || a.key.localeCompare(b.key));
      return response({tasks,agent_models,cells});
    }
    if (path === '/api/pricing') return response({detail:'此模型没有静态价格表'},404);
    const entry = manifest.routes[path];
    if (!entry) return response({detail:'此文件或页面未包含在静态导出中'},404);
    return readEntry(entry);
  } catch (error) {
    return response({detail:error.message},500);
  }
}

// Covers UI downloads and any direct fetch outside the shared API module.
globalThis.fetch = staticFetch;
if (typeof document !== 'undefined') {
  document.addEventListener('click', async event => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor) return;
    const url = new URL(anchor.href, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return;
    event.preventDefault();
    const result = await staticFetch(url);
    if (!result.ok) return;
    const href = URL.createObjectURL(await result.blob());
    const download = document.createElement('a');
    download.href=href; download.download=decodeURIComponent(url.pathname.split('/').at(-1));
    download.click(); setTimeout(()=>URL.revokeObjectURL(href),60000);
  }, true);
}
