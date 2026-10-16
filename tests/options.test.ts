import { describe, expect, it } from 'vitest';
import { ConversationController, type ConversationView } from '../src/app/conversation';
import type { ConversationStatus } from '../src/app/status';
import { SessionLog } from '../src/debug/sessionLog';
import { ScenarioEngine } from '../src/scenario/engine';
import type { Scenario, ScenarioNode } from '../src/scenario/types';
import { validateScenario } from '../src/scenario/validate';
import type { Speaker, SpeechHandle } from '../src/tts/types';

const opt = (id: string, text: string, ...intents: string[]) => ({ id, text, intents });

const scenario: Scenario = {
  id: 'opciones',
  title: 'Test',
  description: 'Test',
  persona: { name: 'Javier' },
  initialAnger: 6,
  start: 'inicio',
  endings: { calmedAt: 0, calmedNode: 'fin_bien', escalatedAt: 10, escalatedNode: 'fin_mal' },
  globalIntents: [
    { id: 'disculpa', keywords: ['lo siento'], anger: -1, kind: 'positive' },
    {
      id: 'calmese',
      keywords: ['calmese'],
      anger: 3,
      say: ['¡No me diga que me calme!'],
      kind: 'negative',
    },
  ],
  nodes: {
    inicio: {
      say: ['¡No funciona!'],
      intents: [
        { id: 'empatia', keywords: ['entiendo'], anger: -2, next: 'medio', kind: 'positive' },
        { id: 'norma', keywords: ['normas'], anger: 3, next: 'medio', kind: 'negative' },
      ],
      fallback: { say: ['¿Qué?'], anger: 1 },
      options: [
        opt('a', 'Lo siento, le entiendo perfectamente.', 'disculpa', 'empatia'),
        opt('b', 'Son las normas de la tienda.', 'norma'),
        opt('c', 'Cálmese, por favor.', 'calmese'),
        opt('d', 'Lo siento mucho.', 'disculpa'),
      ],
    },
    medio: {
      say: ['¿Y ahora qué?'],
      intents: [{ id: 'cambio', keywords: ['cambio'], anger: -5, next: 'fin_bien' }],
      fallback: { say: ['¿Qué?'] },
      options: [
        opt('a', 'Se la cambio ahora mismo.', 'cambio'),
        opt('b', 'Lo siento.', 'disculpa'),
        opt('c', 'Cálmese.', 'calmese'),
        opt('d', 'Cálmese, que no es para tanto.', 'calmese'),
      ],
    },
    fin_bien: { say: ['Gracias.'], outcome: 'calmed' },
    fin_mal: { say: ['¡Me voy!'], outcome: 'escalated' },
  },
};

const withNode = (id: string, node: Partial<ScenarioNode>): Scenario => ({
  ...scenario,
  nodes: { ...scenario.nodes, [id]: { ...(scenario.nodes[id] as ScenarioNode), ...node } },
});

describe('validateScenario with options', () => {
  it('accepts valid options', () => {
    expect(validateScenario(scenario)).toEqual([]);
  });

  it('requires exactly 4 options', () => {
    const s = withNode('inicio', { options: scenario.nodes.inicio?.options?.slice(0, 3) });
    expect(validateScenario(s)).toContain('Nodo "inicio": tiene 3 opciones y deben ser 4.');
  });

  it('reports unknown intents, duplicates, long texts and several node intents', () => {
    const s = withNode('inicio', {
      options: [
        opt('a', 'Hola.', 'no_existe'),
        opt('a', 'Le entiendo y son las normas.', 'empatia', 'norma'),
        opt(
          'c',
          'una dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis',
          'disculpa',
        ),
        opt('d', 'Vale.'),
      ],
    });
    expect(validateScenario(s)).toEqual(
      expect.arrayContaining([
        'Nodo "inicio", opción "a": la intención "no_existe" no existe en el nodo ni en las globales.',
        'Nodo "inicio", opción "a": el id está repetido.',
        'Nodo "inicio", opción "a": apunta a más de una intención del nodo.',
        'Nodo "inicio", opción "c": tiene 16 palabras (máximo 15).',
        'Nodo "inicio", opción "d": no apunta a ninguna intención.',
      ]),
    );
  });

  it('rejects options on final nodes', () => {
    const s = withNode('fin_bien', { options: [opt('a', 'Adiós.', 'disculpa')] });
    expect(validateScenario(s)).toContain('Nodo "fin_bien": es final y no debe tener opciones.');
  });
});

describe('ScenarioEngine options mode', () => {
  it('offers the 4 options of the current node in a stable shuffled order per turn', () => {
    let seed = 0;
    const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const e = new ScenarioEngine(scenario, { random });
    e.start();
    const first = e.options().map((o) => o.id);
    expect([...first].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(e.options().map((o) => o.id)).toEqual(first);
  });

  it('applies all the intents of the chosen option', () => {
    const e = new ScenarioEngine(scenario, { random: () => 0 });
    e.start();
    const turn = e.choose('a');
    expect(e.state).toMatchObject({ nodeId: 'medio', anger: 3 }); // 6 - 1 - 2
    expect(turn.text).toBe('¿Y ahora qué?');
    expect(e.state.turns[0]).toMatchObject({
      userText: 'Lo siento, le entiendo perfectamente.',
      intent: 'empatia',
      globals: ['disculpa'],
      kinds: ['positive', 'positive'],
    });
  });

  it('uses the global reaction when the option only has global intents', () => {
    const e = new ScenarioEngine(scenario, { random: () => 0 });
    e.start();
    expect(e.choose('c').text).toBe('¡No me diga que me calme!');
    expect(e.state).toMatchObject({ nodeId: 'inicio', anger: 9 });
  });

  it('keeps diminishing returns and reaches both endings', () => {
    const good = new ScenarioEngine(scenario, { random: () => 0 });
    good.start();
    good.choose('d'); // 5
    good.choose('d'); // 4
    good.choose('d'); // 4 (third apology: no effect)
    expect(good.state.anger).toBe(4);
    good.choose('a'); // 4 - 2 = 2 → medio (apology no longer counts)
    expect(good.choose('a')).toMatchObject({ final: true, text: 'Gracias.' });
    expect(good.state.outcome).toBe('calmed');

    const bad = new ScenarioEngine(scenario, { random: () => 0 });
    bad.start();
    bad.choose('c'); // 9
    expect(bad.choose('c')).toMatchObject({ final: true, text: '¡Me voy!' });
    expect(bad.state.outcome).toBe('escalated');
    expect(bad.options()).toEqual([]);
  });

  it('rejects unknown options', () => {
    const e = new ScenarioEngine(scenario, { random: () => 0 });
    e.start();
    expect(() => e.choose('z')).toThrow(/no existe/);
  });
});

describe('ConversationController.submitOption', () => {
  class View implements ConversationView {
    statuses: ConversationStatus[] = [];
    user = '';
    setStatus(s: ConversationStatus) {
      this.statuses.push(s);
    }
    setUser(t: string) {
      this.user = t;
    }
    setAvatar() {}
  }
  const speaker: Speaker = {
    name: 'fake',
    say: async (): Promise<SpeechHandle> => ({ latencyMs: 1, ended: Promise.resolve(), stop() {} }),
    level: () => 0,
    stop() {},
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('plays a turn with the chosen reply, without STT or recording', async () => {
    const view = new View();
    const engine = new ScenarioEngine(scenario, { random: () => 0 });
    const log = new SessionLog({
      startedAt: '',
      userAgent: '',
      sttModel: null,
      sttDevice: null,
      voice: null,
      capabilities: {},
    });
    const c = new ConversationController({
      responder: engine,
      view,
      speaker,
      stt: null,
      recorder: null,
      log,
    });
    await c.start();
    await flush();
    expect(c.status).toBe('idle');
    expect(c.currentOptions()).toHaveLength(4);
    await c.submitOption('a');
    await flush();
    expect(view.user).toBe('Lo siento, le entiendo perfectamente.');
    expect(engine.state.nodeId).toBe('medio');
    expect(log.last).toMatchObject({
      userText: 'Lo siento, le entiendo perfectamente.',
      sttMs: null,
    });
    expect(c.status).toBe('idle');
  });

  it('ignores unknown options and offers none while not idle', async () => {
    const view = new View();
    const engine = new ScenarioEngine(scenario, { random: () => 0 });
    const c = new ConversationController({
      responder: engine,
      view,
      speaker,
      stt: null,
      recorder: null,
      log: new SessionLog({
        startedAt: '',
        userAgent: '',
        sttModel: null,
        sttDevice: null,
        voice: null,
        capabilities: {},
      }),
    });
    expect(c.currentOptions()).toEqual([]); // still in intro
    await c.start();
    await flush();
    await c.submitOption('zzz');
    expect(engine.state.turns).toHaveLength(0);
  });
});
