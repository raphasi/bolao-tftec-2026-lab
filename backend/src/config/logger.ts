/**
 * Pino logger configurado:
 *  - dev: pretty-printed colorido
 *  - prod: JSON estruturado (consumido por App Insights / Log Analytics)
 */
import { pino } from 'pino';
import { env, isDevelopment } from './env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'bolao-backend',
    env: env.NODE_ENV,
  },
});
