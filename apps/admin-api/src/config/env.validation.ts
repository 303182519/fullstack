import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Server
  PORT: Joi.number().port(),

  // Swagger
  SWAGGER_OPEN: Joi.boolean().default(true),

  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.number().default(900),
  JWT_REFRESH_EXPIRES_IN: Joi.number().default(604800),

  // Snowflake ID Generator
  WORKER_ID: Joi.number().integer().min(0).max(31).default(0),
  DATACENTER_ID: Joi.number().integer().min(0).max(31).default(0),

})
