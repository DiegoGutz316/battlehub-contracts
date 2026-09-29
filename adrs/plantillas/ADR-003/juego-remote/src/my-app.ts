// Arnés de desarrollo: simula lo que hace el Shell para probar el juego solo (npm start).
import { GameModule } from './game-module';
import type { GameContext } from './game-contracts';

export class MyApp {
  public static dependencies = [GameModule];
  public game?: GameModule;

  public readonly fakeContext: GameContext = {
    matchId: 'match-dev-001',
    gameType: 'typing',
    currentUser: { id: 'user-dev', displayName: 'Jugador de prueba' },
  };

  public async attached(): Promise<void> {
    await this.game?.initialize(this.fakeContext);
  }
}
