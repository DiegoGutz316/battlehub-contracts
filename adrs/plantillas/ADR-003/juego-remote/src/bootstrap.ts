// Arranque del juego EN MODO INDEPENDIENTE (npm start en el puerto del equipo).
// Sirve para desarrollar y probar el juego sin el Shell. El Shell NO usa este archivo:
// el Shell carga directamente ./GameModule a través de remoteEntry.js.
import Aurelia from 'aurelia';
import { MyApp } from './my-app';

Aurelia.app(MyApp).start();
