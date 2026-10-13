import Joi from 'joi';

export const validationSchema = Joi.object({
  // Server
  PORT: Joi.number().port().default(3001),

   // Swagger
  SWAGGER_OPEN: Joi.boolean().default(true),

  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.number().default(900),
  JWT_REFRESH_EXPIRES_IN: Joi.number().default(604800),

  // Snowflake ID Generator
  WORKER_ID: Joi.number().integer().min(0).max(31).default(0),
  DATACENTER_ID: Joi.number().integer().min(0).max(31).default(0),

  // Pino Logger (日志)
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent')
    .default('info'),
  LOG_JSON_FORMAT: Joi.boolean().default(true),
  LOG_SLOW_REQUEST_THRESHOLD: Joi.number().integer().min(100).default(500),
  LOG_OUTPUT: Joi.string().valid('console', 'file').default('console'),
  LOG_DIR: Joi.string().default('logs'),
  LOG_MAX_FILE_SIZE: Joi.number().integer().min(1).default(10),
  LOG_MAX_FILES: Joi.number().integer().min(0).default(7),
})
