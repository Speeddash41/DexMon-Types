const API = 'https://pokeapi.co/api/v2';

export async function fetchPokemonList(limit=48, offset=0){
  const res = await fetch(`${API}/pokemon?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error('Erro ao carregar lista');
  return res.json();
}

export async function fetchPokemon(idOrName){
  const res = await fetch(`${API}/pokemon/${idOrName}`);
  if (!res.ok) throw new Error('Pokémon não encontrado');
  return res.json();
}

export async function fetchAllTypes(){
  const res = await fetch(`${API}/type`);
  if (!res.ok) throw new Error('Erro ao carregar tipos');
  const j = await res.json();
  // exclude pseudo types like 'shadow' or 'unknown' if present
  return j.results.filter(r => !['shadow','unknown'].includes(r.name));
}

export async function fetchType(name){
  const res = await fetch(`${API}/type/${name}`);
  if (!res.ok) throw new Error('Erro ao carregar tipo');
  return res.json();
}