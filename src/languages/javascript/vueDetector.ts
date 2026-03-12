/**
 * Vue.js/Vuex pattern detector (Feature 27, Sub-PR 8)
 *
 * Detects:
 * 1. axios.defaults.baseURL — global base URL
 * 2. Vuex actions with API calls (ApiService.get, axios.get, etc.)
 * 3. this.$store.dispatch('actionName') — component dispatches
 * 4. ApiService.get('resource') — service-layer API calls
 */

export interface VueApiCall {
  actionName?: string;
  /** Resolved string value when actionName is a constant (e.g., FETCH_ARTICLES → 'fetchArticles') */
  resolvedName?: string;
  method: string;
  urlPattern: string;
  baseUrl?: string;
  sourceFile: string;
  line?: number;
}

export interface VuexDispatch {
  actionName: string;
  sourceFile: string;
  line?: number;
}

export interface VueBaseUrl {
  url: string;
  sourceFile: string;
  line?: number;
}

/**
 * Detect axios.defaults.baseURL settings.
 */
export function detectAxiosBaseUrl(sourceText: string, filePath: string): VueBaseUrl | undefined {
  const match = sourceText.match(/axios\.defaults\.baseURL\s*=\s*['"`]([^'"`]+)['"`]/);
  if (match) {
    const line = sourceText.substring(0, match.index).split('\n').length;
    return { url: match[1], sourceFile: filePath, line };
  }
  return undefined;
}

/**
 * Detect Vuex action definitions with API calls.
 */
export function detectVuexActions(sourceText: string, filePath: string): VueApiCall[] {
  const calls: VueApiCall[] = [];
  const lines = sourceText.split('\n');

  // Pass 1: Build a map of constant name → string value.
  // Matches patterns like:
  //   const FETCH_ARTICLES = 'fetchArticles'
  //   export const FETCH_ARTICLES = "fetchArticles"
  const constantMap = new Map<string, string>();
  for (const line of lines) {
    const constMatch = line.match(
      /(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=\s*['"]([^'"]+)['"]/,
    );
    if (constMatch) {
      constantMap.set(constMatch[1], constMatch[2]);
    }
  }

  // Pass 2: Detect action definitions and their API calls.
  let currentAction = '';
  let currentResolvedName: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Vuex action definition: [ACTION_NAME]({ commit }, payload) {
    // or: actionName({ commit }) {
    const actionMatch = line.match(/(?:\[(\w+)\]|(\w+))\s*\(\s*\{\s*(?:commit|dispatch|state|getters|rootState)/);
    if (actionMatch) {
      currentAction = actionMatch[1] || actionMatch[2] || '';
      // If using bracket syntax with a constant, resolve to its string value
      if (actionMatch[1] && constantMap.has(actionMatch[1])) {
        currentResolvedName = constantMap.get(actionMatch[1]);
      } else {
        currentResolvedName = undefined;
      }
      continue;
    }

    // ApiService.get/post/put/delete('resource')
    const apiServiceMatch = line.match(/ApiService\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (apiServiceMatch) {
      calls.push({
        actionName: currentAction || undefined,
        resolvedName: currentResolvedName,
        method: apiServiceMatch[1].toUpperCase(),
        urlPattern: apiServiceMatch[2],
        sourceFile: filePath,
        line: i + 1,
      });
      continue;
    }

    // axios.get/post/put/delete('url')
    const axiosMatch = line.match(/axios\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (axiosMatch) {
      calls.push({
        actionName: currentAction || undefined,
        resolvedName: currentResolvedName,
        method: axiosMatch[1].toUpperCase(),
        urlPattern: axiosMatch[2],
        sourceFile: filePath,
        line: i + 1,
      });
    }
  }

  return calls;
}

/**
 * Detect this.$store.dispatch() or store.dispatch() calls.
 */
export function detectVuexDispatches(sourceText: string, filePath: string): VuexDispatch[] {
  const dispatches: VuexDispatch[] = [];
  const lines = sourceText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // this.$store.dispatch('ACTION_NAME') or store.dispatch('actionName')
    const match = line.match(/(?:this\.\$store|store)\.dispatch\s*\(\s*['"](\w+)['"]/);
    if (match) {
      dispatches.push({
        actionName: match[1],
        sourceFile: filePath,
        line: i + 1,
      });
    }
  }

  return dispatches;
}
