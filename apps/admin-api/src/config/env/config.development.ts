import { registerAs } from '@nestjs/config';
import { AppConfig } from '../configuration.interface.js';

export const developmentConfig = registerAs('development', (): AppConfig => ({
  server: {},
  jwt: {
    accessExpiresIn: 7200,
    refreshExpiresIn: 604800,
  },
}));
