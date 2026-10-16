import { describe, expect, it } from 'vitest';
import scenarioJson from '../scenarios/devolucion-sin-ticket.json';
import { buildSummary } from '../src/app/summary';
import { ScenarioEngine } from '../src/scenario/engine';
import type { Scenario, ScenarioIntent, ScenarioOption } from '../src/scenario/types';
import { validateScenario } from '../src/scenario/validate';

const scenario = scenarioJson as Scenario;

/** Plays a conversation by option ids (in the scenario's own order, not the shuffled one). */
function play(ids: string[]) {
  const engine = new ScenarioEngine(scenario, { random: () => 0 });
  engine.start();
  for (const id of ids) if (!engine.state.ended) engine.choose(id);
  return engine;
}

/** Sum of the anger changes of the intents an option points to (its "valence"). */
function delta(nodeId: string, option: ScenarioOption): number {
  const node = scenario.nodes[nodeId];
  const all: ScenarioIntent[] = [...(node?.intents ?? []), ...(scenario.globalIntents ?? [])];
  return option.intents.reduce((sum, id) => sum + (all.find((i) => i.id === id)?.anger ?? 0), 0);
}

const playable = Object.entries(scenario.nodes).filter(([, n]) => !n.outcome);

describe('options of "Devolución sin ticket"', () => {
  it('the scenario stays valid', () => {
    expect(validateScenario(scenario)).toEqual([]);
  });

  it('every non-final moment offers 4 options', () => {
    for (const [id, node] of playable) expect(node.options, id).toHaveLength(4);
  });

  it('every moment has at least one good and one bad option', () => {
    for (const [id, node] of playable) {
      const deltas = (node.options ?? []).map((o) => delta(id, o));
      expect(Math.min(...deltas), `${id} needs a calming option`).toBeLessThan(0);
      expect(Math.max(...deltas), `${id} needs an option that makes it worse`).toBeGreaterThan(0);
    }
  });

  it('a good run calms Javier down', () => {
    const engine = play(['a', 'a', 'a']); // listen → card payment → exchange
    expect(engine.state.outcome).toBe('calmed');
    const summary = buildSummary(scenario, engine.state);
    expect(summary.negatives).toEqual([]);
    expect(summary.positives).toContain('Ofrecer un cambio');
  });

  it('asking for the ticket first still allows a good ending through "cierre"', () => {
    const engine = play(['b', 'a', 'a', 'a']); // ticket → no te preocupes → cambio → despedida
    expect(engine.state.turns.map((t) => t.node)).toEqual([
      'sin_ticket',
      'busca_compra',
      'cierre',
      'fin_bien',
    ]);
    expect(engine.state.outcome).toBe('calmed');
  });

  it('a bad run makes Javier leave', () => {
    const engine = play(['c', 'c']); // "cálmese" twice
    expect(engine.state.outcome).toBe('escalated');
    expect(buildSummary(scenario, engine.state).negatives).toEqual(['Decirle que se calme']);
  });

  it('rigidity and blame also end badly', () => {
    expect(play(['d', 'c', 'c']).state.outcome).toBe('escalated');
  });

  it('every option of every moment can be chosen from that moment', () => {
    for (const [id, node] of playable) {
      for (const option of node.options ?? []) {
        const engine = new ScenarioEngine({ ...scenario, start: id }, { random: () => 0 });
        engine.start();
        expect(() => engine.choose(option.id), `${id}/${option.id}`).not.toThrow();
        expect(Object.keys(scenario.nodes)).toContain(engine.state.nodeId);
      }
    }
  });
});
