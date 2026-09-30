// Pruebas unitarias del ciclo de vida del contrato GameModule.
import { GameModule } from '../src/game-module';
import type { GameContext } from '../src/game-contracts';

const ctx: GameContext = {
  matchId: 'match-001',
  gameType: 'typing',
  currentUser: { id: 'user-001', displayName: 'Francisco' },
};

describe('GameModule (contrato ADR-003)', () => {
  it('exporta los 4 métodos del contrato', () => {
    const g = new GameModule();
    for (const m of ['initialize', 'start', 'pause', 'dispose'] as const) {
      expect(typeof g[m]).toBe('function');
    }
  });

  it('recorre el ciclo initialize → start → pause → dispose', async () => {
    const g = new GameModule();
    await g.initialize(ctx);
    expect(g.state).toBe('initialized');
    await g.start();
    expect(g.state).toBe('running');
    await g.pause();
    expect(g.state).toBe('paused');
    await g.dispose();
    expect(g.state).toBe('disposed');
  });

  it('rechaza initialize() con un contexto inválido (LIFECYCLE_ERROR en el Shell)', async () => {
    const g = new GameModule();
    await expect(g.initialize({} as GameContext)).rejects.toThrow('Contexto inválido');
  });
});
