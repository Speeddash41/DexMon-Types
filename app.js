import { fetchPokemonList, fetchPokemon, fetchAllTypes, fetchType } from './api.js';

const listContainer = document.getElementById('list-container');
const pokemonCard = document.getElementById('pokemon-card');
const searchInput = document.getElementById('search');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const pageInfo = document.getElementById('page-info');
const chartWrap = document.getElementById('chart-wrap');

let offset = 0;
const limit = 48;
let totalCount = 0;
let cachedTypes = {};
let allTypeNames = [];

async function init(){
  const types = await fetchAllTypes();
  allTypeNames = types.map(t => t.name).sort();
  for (const t of types) cachedTypes[t.name] = await fetchType(t.name);
  renderTypeChart();
  await loadPage();
  attachEvents();
}

function attachEvents(){
  prevBtn.addEventListener('click', async ()=>{
    if (offset === 0) return;
    offset = Math.max(0, offset - limit);
    await loadPage();
  });
  nextBtn.addEventListener('click', async ()=>{
    if (offset + limit >= totalCount) return;
    offset += limit;
    await loadPage();
  });
  searchInput.addEventListener('input', debounce(async (e)=>{
    const q = e.target.value.trim().toLowerCase();
    if (!q) { offset = 0; await loadPage(); return; }
    // if numeric search by id
    if (/^\d+$/.test(q)) {
      const p = await fetchPokemon(q);
      showPokemon(p);
      return;
    }
    // try fetch by name
    try {
      const p = await fetchPokemon(q);
      showPokemon(p);
    } catch {
      // fallback: filter current page
      const items = Array.from(listContainer.querySelectorAll('.poke-item'));
      items.forEach(it => {
        const name = it.dataset.name;
        it.style.display = name.includes(q) ? '' : 'none';
      });
    }
  }, 300));
}

async function loadPage(){
  listContainer.innerHTML = '<div class="placeholder">Carregando...</div>';
  const data = await fetchPokemonList(limit, offset);
  totalCount = data.count;
  pageInfo.textContent = `${offset+1} - ${Math.min(offset+limit, totalCount)} de ${totalCount}`;
  listContainer.innerHTML = '';
  for (const p of data.results){
    try {
      const detail = await fetchPokemon(p.name);
      const el = makeListItem(detail);
      listContainer.appendChild(el);
    } catch (e){
      // skip on error
    }
  }
}

function makeListItem(pokemon){
  const el = document.createElement('div');
  el.className = 'poke-item';
  el.dataset.name = pokemon.name;
  el.innerHTML = `
    <div class="poke-id">#${pokemon.id}</div>
    <img src="${pokemon.sprites.front_default || ''}" alt="${pokemon.name}" onerror="this.style.display='none'"/>
    <div class="poke-name">${pokemon.name}</div>
    <div class="poke-types"></div>
  `;
  const typesWrap = el.querySelector('.poke-types');
  for (const t of pokemon.types){
    const span = document.createElement('span');
    span.className = `type-pill ${t.type.name}`;
    span.textContent = t.type.name;
    typesWrap.appendChild(span);
  }
  el.addEventListener('click', ()=> showPokemon(pokemon));
  return el;
}

function showPokemon(pokemon){
  pokemonCard.classList.remove('empty');
  pokemonCard.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'pokemon-header';
  header.innerHTML = `
    <div class="poke-sprite"><img src="${pokemon.sprites.other['official-artwork'].front_default || pokemon.sprites.front_default || ''}" alt="${pokemon.name}" style="max-width:100%;max-height:100%"/></div>
    <div class="poke-info">
      <div style="display:flex;gap:8px;align-items:center">
        <div style="font-weight:700;font-size:18px;text-transform:capitalize">${pokemon.name}</div>
        <div class="small">#${pokemon.id}</div>
      </div>
      <div class="pokemon-stats"></div>
      <div class="small">Tipos:</div>
      <div class="types-row"></div>
    </div>
  `;
  const statsWrap = header.querySelector('.pokemon-stats');
  for (const s of pokemon.stats){
    const sp = document.createElement('div');
    sp.className = 'stat-pill';
    sp.textContent = `${s.stat.name}: ${s.base_stat}`;
    statsWrap.appendChild(sp);
  }
  const typesRow = header.querySelector('.types-row');
  const types = pokemon.types.map(t=>t.type.name);
  for (const name of types){
    const span = document.createElement('span');
    span.className = `type-pill ${name}`;
    span.textContent = name;
    typesRow.appendChild(span);
  }

  pokemonCard.appendChild(header);

  // Damage relations derived
  const relations = computeCombinedRelations(types);
  const section = document.createElement('div');
  section.innerHTML = `<div class="small">Eficácia contra este Pokémon (combinado):</div>`;
  const dl = document.createElement('div');
  dl.className = 'damage-list';
  for (const level of ['0','0.5','1','2']){
    const filtered = Object.entries(relations).filter(([,m]) => String(m) === level).map(([t])=>t);
    if (filtered.length === 0) continue;
    const pill = document.createElement('div');
    pill.className = 'damage-pill';
    pill.innerHTML = `<strong>x${level}</strong> — ` + filtered.map(n=>`<span class="type-pill ${n}" style="margin-left:6px">${n}</span>`).join('');
    dl.appendChild(pill);
  }
  section.appendChild(dl);
  pokemonCard.appendChild(section);

  // list type-by-type cards (each type's relations)
  const detailTypes = document.createElement('div');
  detailTypes.style.marginTop = '8px';
  detailTypes.innerHTML = `<div class="small">Detalhes por tipo:</div>`;
  for (const t of types){
    const box = document.createElement('div');
    box.style.marginTop = '6px';
    box.innerHTML = `<div style="font-weight:600;text-transform:capitalize">${t}</div>`;
    const rel = cachedTypes[t].damage_relations;
    const makeLine = (label, arr) => {
      const node = document.createElement('div');
      node.className = 'small';
      node.style.marginTop = '4px';
      node.innerHTML = `<strong>${label}:</strong> ${arr.length ? arr.map(x=>`<span class="type-pill ${x.name}" style="margin-left:6px">${x.name}</span>`).join('') : '<span class="small">—</span>'}`;
      return node;
    };
    box.appendChild(makeLine('Dá 2x em', rel.double_damage_to));
    box.appendChild(makeLine('Dá 0.5x em', rel.half_damage_to));
    box.appendChild(makeLine('Imune a', rel.no_damage_to));
    detailTypes.appendChild(box);
  }
  pokemonCard.appendChild(detailTypes);
}

// compute combined multipliers for defender (the Pokemon types are defenders)
function computeCombinedRelations(defenderTypes){
  // start with 1 for all types
  const mult = {};
  for (const t of allTypeNames) mult[t] = 1;
  for (const def of defenderTypes){
    const rel = cachedTypes[def].damage_relations;
    for (const d of rel.double_damage_from) mult[d.name] *= 2;
    for (const d of rel.half_damage_from) mult[d.name] *= 0.5;
    for (const d of rel.no_damage_from) mult[d.name] *= 0;
  }
  // normalize small float rounding
  for (const k in mult){
    const v = mult[k];
    if (Math.abs(v) < 0.001) mult[k] = 0;
    else if (Math.abs(v - 0.5) < 0.001) mult[k] = 0.5;
    else if (Math.abs(v - 2) < 0.001) mult[k] = 2;
    else if (Math.abs(v - 1) < 0.001) mult[k] = 1;
    else mult[k] = Number(v.toFixed(2));
  }
  return mult;
}

function renderTypeChart(){
  // ensure cachedTypes available for all names (lazy fetch if missing)
  const ensurePromises = allTypeNames.map(async (n)=>{
    if (!cachedTypes[n]) cachedTypes[n] = await fetchType(n);
  });
  Promise.all(ensurePromises).then(()=>{
    // header + legend
    const legend = document.createElement('div');
    legend.className = 'type-legend';
    legend.innerHTML = `<span><b>Legenda:</b></span>
      <span class="leg-item leg-2">2x</span>
      <span class="leg-item leg-1">1x</span>
      <span class="leg-item leg-05">0.5x</span>
      <span class="leg-item leg-0">0x</span>`;
    chartWrap.innerHTML = '';
    chartWrap.appendChild(legend);

    const table = document.createElement('table');
    table.className = 'type-table';
    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    trHead.innerHTML = '<th class="sticky-head">Atk \\ Def</th>' + allTypeNames.map(n=>`<th style="text-transform:capitalize">${n}</th>`).join('');
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const atk of allTypeNames){
      const tr = document.createElement('tr');
      const cells = allTypeNames.map(def=>{
        const rel = cachedTypes[atk].damage_relations;
        let mult = 1;
        if (rel.double_damage_to.some(x=>x.name===def)) mult = 2;
        if (rel.half_damage_to.some(x=>x.name===def)) mult = 0.5;
        if (rel.no_damage_to.some(x=>x.name===def)) mult = 0;
        // assign class based on multiplier for colors and show tooltip
        const cls = mult === 2 ? 'mult-2' : mult === 0.5 ? 'mult-05' : mult === 0 ? 'mult-0' : 'mult-1';
        return `<td class="${cls}" data-mult="${mult}" title="${atk} → ${def}: x${mult}">${mult}</td>`;
      }).join('');
      tr.innerHTML = `<th class="sticky-col" style="text-transform:capitalize">${atk}</th>` + cells;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    chartWrap.appendChild(table);
  }).catch((e)=>{
    chartWrap.innerHTML = `<div class="placeholder">Erro ao gerar tabela de tipos</div>`;
    console.error(e);
  });
}

function debounce(fn, wait=200){
  let t;
  return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), wait); };
}

init();