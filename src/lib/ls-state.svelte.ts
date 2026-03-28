function saveToLS<K>(key: string, val: any) {
  localStorage.setItem(key, JSON.stringify(val));
}

function readFromLS<K>(key: string, def: K) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      saveToLS(key, def);
      return def;
    }
    return JSON.parse(raw) as K;
  } catch (e) {
    saveToLS(key, def);
    return def;
  }
}

// If not using an object, like a string, use `{v: string} rather than `string` directly
// otherwise the reactivity won't work
export function lsState<K>(
  key: string,
  def: K,
  reset?: boolean | ((v: K) => K),
) {
  if (typeof localStorage === "undefined") return def;
  if (typeof reset === "boolean") {
    localStorage.removeItem(key);
  }

  let initialState = readFromLS(key, def);

  if (typeof reset === "function") {
    initialState = reset(initialState);
  }

  let data = $state<K>(initialState);

  $effect(() => {
    saveToLS(key, data);
  });

  return data;
}
