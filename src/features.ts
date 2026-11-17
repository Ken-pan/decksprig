import type {Component} from 'svelte';
import type {Feature} from './feature-loaders';
export type {Feature,FeatureProps} from './feature-loaders';
const registry=()=>import('./feature-loaders');
export function loadDocumentLibraryActions(){return registry().then(module=>module.libraryActions());}

// The optional-workspace registry includes generated preload metadata. Load it
// with the first requested workspace rather than every application entry.
const pending = new Map<Feature, Promise<Component<any>>>();
export function loadFeature(feature: Feature): Promise<Component<any>> {
  let request = pending.get(feature);
  if (!request) {
    // A bundler may remember a failed CSS preload. Retrying its import can then
    // mount an unstyled component. Every instance keeps the same failure until
    // the supported app refresh reloads both the module and its dependencies.
    request = registry().then(async({loaders})=>(await loaders[feature]()).default as Component<any>);
    pending.set(feature, request);
  }
  return request;
}
