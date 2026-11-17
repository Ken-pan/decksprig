/** Omit only modules already fetched by the importing chunk's static graph. */
export function browserPreload() {
  const imported = new Map();
  return {
    plugin: {
      name: 'browser-static-preloads', enforce: 'pre',
      // Vite rewrites preload tables after chunk hashing. Version that rewrite
      // so previously published immutable URLs never receive different bytes.
      augmentChunkHash() { return 'browser-static-preloads/2'; },
      generateBundle: {order: 'pre', handler(_options, bundle) {
        imported.clear();
        const chunks = Object.values(bundle).filter(chunk => chunk.type === 'chunk');
        const walk = (start, dynamic = false) => {
          const seen = new Set();
          const visit = file => {if (seen.has(file)) return; seen.add(file); const chunk=bundle[file]; if(chunk?.type!=='chunk')return; for(const dependency of [...chunk.imports,...(dynamic?chunk.dynamicImports:[])])visit(dependency);};
          visit(start); return seen;
        };
        const entries = chunks.filter(chunk=>chunk.isEntry).map(chunk=>({static:walk(chunk.fileName),reachable:walk(chunk.fileName,true)}));
        for (const chunk of chunks) {
          const seen = walk(chunk.fileName);
          const owners = entries.filter(entry=>entry.reachable.has(chunk.fileName));
          // Only initial hosts gain ancestor hints. If another entry reaches a
          // shared host lazily, its entry dependencies are not assumed loaded.
          if(owners.length&&owners.every(entry=>entry.static.has(chunk.fileName))){
            for(const file of owners[0].static)if(owners.every(entry=>entry.static.has(file)))seen.add(file);
          }
          imported.set(chunk.fileName, seen);
        }
      }},
    },
    resolveDependencies(filename, dependencies, context) {
      if (context.hostType !== 'js') return dependencies;
      const loaded = imported.get(context.hostId);
      const filtered = dependencies.filter(file => file.endsWith('.css') || !loaded?.has(file));
      // Without a stylesheet barrier the import starts immediately. Repeating
      // its own URL as a preload only grows the generated dependency tables.
      return filtered.some(file=>file.endsWith('.css')) ? filtered : filtered.filter(file=>file!==filename);
    },
  };
}
