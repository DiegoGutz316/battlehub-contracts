// ADR-003 §2 — Módulo que el Shell carga. Debe exportarse con el nombre "GameModule"
// e implementar los 4 métodos del contrato. Reemplacen el contenido de ejemplo por su juego.
import { customElement } from 'aurelia';
import template from './game-module.html';
import './game-module.css';
import type { GameContext, GameModule as IGameModule } from './game-contracts';

type GameState = 'created' | 'initialized' | 'running' | 'paused' | 'disposed';

@customElement({ name: 'typing-game-module', template }) // nombre con prefijo del juego
export class GameModule implements IGameModule {
  public context: GameContext | null = null;
  public state: GameState = 'created';
  public score = 0;

  private timer: ReturnType<typeof setInterval> | null = null;
  public secondsLeft = 60;

  /** Recibe el contexto del Shell y prepara el estado inicial. NO inicia la partida. */
  public async initialize(context: GameContext): Promise<void> {
    if (!context?.matchId || !context.currentUser?.id) {
      // ADR-003 §6: si el juego no puede iniciar, RECHAZAR la promesa. El Shell lo mostrará como LIFECYCLE_ERROR.
      throw new Error('Contexto inválido: falta matchId o currentUser');
    }
    this.context = context;
    this.state = 'initialized';
    // Aquí: cargar datos iniciales desde su API (/api/games/{game}/...), si hace falta.
  }

  /** Comienza la partida: conectar al hub propio, arrancar temporizadores, etc. */
  public async start(): Promise<void> {
    // Aquí: conectar a su hub de SignalR (/hubs/typing | /hubs/trivia | /hubs/memory).
    //   this.connection = new HubConnectionBuilder().withUrl(`${API_URL}/hubs/typing`).build();
    //   await this.connection.start();   // si falla, la excepción llega al Shell como LIFECYCLE_ERROR
    this.state = 'running';
    this.stopTimer();
    this.timer = setInterval(() => {
      if (this.secondsLeft > 0) this.secondsLeft--;
    }, 1000);
  }

  /** Pausa (el usuario salió del área del juego). El Shell puede volver a llamar start(). */
  public async pause(): Promise<void> {
    this.stopTimer();
    this.state = 'paused';
  }

  /** Libera TODO antes de que el Shell descargue el juego: timers, listeners, conexión al hub. */
  public async dispose(): Promise<void> {
    this.stopTimer();
    // Aquí: await this.connection?.stop();
    this.state = 'disposed';
  }

  /** Ejemplo de acción del juego. */
  public addPoint(): void {
    if (this.state === 'running') this.score++;
  }

  private stopTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}
