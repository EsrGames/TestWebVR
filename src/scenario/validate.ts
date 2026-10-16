import type { Scenario, ScenarioIntent } from './types';

/**
 * Checks a scenario JSON for authoring mistakes and returns readable Spanish errors
 * (the scenario files are meant to be edited by the team).
 */
export function validateScenario(scenario: Scenario): string[] {
  const errors: string[] = [];
  const nodes = scenario.nodes ?? {};
  const has = (id: string | undefined) => id !== undefined && id in nodes;

  if (!scenario.id) errors.push('Falta "id".');
  if (!scenario.persona?.name) errors.push('Falta "persona.name".');
  if (!has(scenario.start)) errors.push(`El nodo inicial "${scenario.start}" no existe.`);
  if (!(scenario.initialAnger >= 0 && scenario.initialAnger <= 10)) {
    errors.push('"initialAnger" debe estar entre 0 y 10.');
  }
  const e = scenario.endings;
  if (!e) {
    errors.push('Falta "endings".');
  } else {
    if (!has(e.calmedNode)) errors.push(`El nodo final "${e.calmedNode}" no existe.`);
    if (!has(e.escalatedNode)) errors.push(`El nodo final "${e.escalatedNode}" no existe.`);
    if (!(e.calmedAt < scenario.initialAnger && scenario.initialAnger < e.escalatedAt)) {
      errors.push('Debe cumplirse calmedAt < initialAnger < escalatedAt.');
    }
  }

  const checkIntent = (intent: ScenarioIntent, where: string) => {
    if (!intent.id) errors.push(`${where}: una intención no tiene "id".`);
    if (!intent.keywords || intent.keywords.length === 0) {
      errors.push(`${where}: la intención "${intent.id}" no tiene palabras clave.`);
    } else if (intent.keywords.some((k) => !k.trim())) {
      errors.push(`${where}: la intención "${intent.id}" tiene una palabra clave vacía.`);
    }
    if (intent.next !== undefined && !has(intent.next)) {
      errors.push(`${where}: la intención "${intent.id}" lleva a "${intent.next}", que no existe.`);
    }
    if (intent.say !== undefined && intent.say.length === 0) {
      errors.push(`${where}: la intención "${intent.id}" tiene "say" vacío.`);
    }
  };

  for (const intent of scenario.globalIntents ?? []) checkIntent(intent, 'globalIntents');
  for (const [id, node] of Object.entries(nodes)) {
    if (!node.say || node.say.length === 0) errors.push(`Nodo "${id}": no tiene frases ("say").`);
    if (!node.outcome) {
      if (!node.intents || node.intents.length === 0) {
        errors.push(`Nodo "${id}": no tiene intenciones y no es final.`);
      }
      if (!node.fallback || node.fallback.say.length === 0) {
        errors.push(`Nodo "${id}": no tiene "fallback".`);
      }
    }
    const seen = new Set<string>();
    for (const intent of node.intents ?? []) {
      if (seen.has(intent.id))
        errors.push(`Nodo "${id}": la intención "${intent.id}" está repetida.`);
      seen.add(intent.id);
      checkIntent(intent, `Nodo "${id}"`);
    }
  }
  for (const [id, node] of Object.entries(nodes)) {
    if (!node.options) continue;
    errors.push(...validateOptions(scenario, id));
  }
  return errors;
}

export const OPTIONS_PER_NODE = 4;
export const MAX_OPTION_WORDS = 15;

/** Checks the options of one node (used by validateScenario). */
export function validateOptions(scenario: Scenario, nodeId: string): string[] {
  const errors: string[] = [];
  const node = scenario.nodes[nodeId];
  if (!node?.options) return errors;
  const where = `Nodo "${nodeId}"`;
  if (node.outcome) {
    errors.push(`${where}: es final y no debe tener opciones.`);
    return errors;
  }
  if (node.options.length !== OPTIONS_PER_NODE) {
    errors.push(`${where}: tiene ${node.options.length} opciones y deben ser ${OPTIONS_PER_NODE}.`);
  }
  const nodeIntents = new Set((node.intents ?? []).map((i) => i.id));
  const globalIntents = new Set((scenario.globalIntents ?? []).map((i) => i.id));
  const seen = new Set<string>();
  for (const option of node.options) {
    const label = `${where}, opción "${option.id}"`;
    if (!option.id) errors.push(`${where}: una opción no tiene "id".`);
    if (seen.has(option.id)) errors.push(`${label}: el id está repetido.`);
    seen.add(option.id);
    const words = option.text?.trim().split(/\s+/).filter(Boolean).length ?? 0;
    if (words === 0) errors.push(`${label}: no tiene texto.`);
    if (words > MAX_OPTION_WORDS) {
      errors.push(`${label}: tiene ${words} palabras (máximo ${MAX_OPTION_WORDS}).`);
    }
    if (!option.intents || option.intents.length === 0) {
      errors.push(`${label}: no apunta a ninguna intención.`);
      continue;
    }
    let ofNode = 0;
    for (const intentId of option.intents) {
      if (nodeIntents.has(intentId)) ofNode++;
      else if (!globalIntents.has(intentId)) {
        errors.push(
          `${label}: la intención "${intentId}" no existe en el nodo ni en las globales.`,
        );
      }
    }
    if (ofNode > 1) errors.push(`${label}: apunta a más de una intención del nodo.`);
  }
  return errors;
}
