/* eslint-disable @typescript-eslint/no-var-requires */
// ADR-003 — Configuración de Webpack para el microfrontend de un juego (remote).
// ÚNICO cambio necesario: los dos valores de "DATOS DEL EQUIPO" según la tabla de la sección 2 del ADR.

// ===================== DATOS DEL EQUIPO =====================
// Equipo 4: 'typingGame' / 4001 · Equipo 5: 'triviaGame' / 4002 · Equipo 6: 'memoryGame' / 4003
const REMOTE_NAME = 'typingGame';
const PORT = 4001;
// ============================================================

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const { ModuleFederationPlugin } = require('webpack').container;
const sharedDeps = require('./mf-shared');

module.exports = function (env) {
  const production = env.production || process.env.NODE_ENV === 'production';
  return {
    target: 'web',
    mode: production ? 'production' : 'development',
    devtool: production ? undefined : 'eval-source-map',
    entry: { entry: './src/main.ts' },
    output: {
      clean: true,
      path: path.resolve(__dirname, 'dist'),
      filename: production ? '[name].[contenthash].bundle.js' : '[name].bundle.js',
      publicPath: 'auto',          // ADR-003 §8: los chunks se piden a ESTE servidor, no al del Shell
      uniqueName: REMOTE_NAME,
    },
    resolve: {
      extensions: ['.ts', '.js'],
      modules: [path.resolve(__dirname, 'src'), 'node_modules'],
      // Sin alias de desarrollo: se deben resolver los mismos paquetes que se comparten.
    },
    devServer: {
      historyApiFallback: true,
      open: !process.env.CI,
      port: PORT,
      headers: { 'Access-Control-Allow-Origin': '*' }, // ADR-003 §8: CORS para que el Shell descargue remoteEntry.js
    },
    performance: { hints: false },
    module: {
      rules: [
        { test: /\.(png|svg|jpg|jpeg|gif)$/i, type: 'asset' },
        { test: /\.(woff|woff2|ttf|eot|svg|otf)(\?v=[0-9]\.[0-9]\.[0-9])?$/i, type: 'asset' },
        { test: /\.css$/i, use: ['style-loader', 'css-loader'] },
        { test: /\.ts$/i, use: ['ts-loader', '@aurelia/webpack-loader'], exclude: /node_modules/ },
        { test: /[/\\]src[/\\].+\.html$/i, use: '@aurelia/webpack-loader', exclude: /node_modules/ },
      ],
    },
    plugins: [
      new ModuleFederationPlugin({
        name: REMOTE_NAME,
        filename: 'remoteEntry.js',                          // ADR-003 §2
        exposes: { './GameModule': './src/game-module' },   // ADR-003 §2
        shared: sharedDeps,                                  // ADR-003 §3
      }),
      new HtmlWebpackPlugin({ template: 'index.html', favicon: 'favicon.ico' }),
      new Dotenv({ path: `./.env${production ? '' : '.' + (process.env.NODE_ENV || 'development')}` }),
    ],
  };
};
