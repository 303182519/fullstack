declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: number;

      JWT_SECRET: string;
      JWT_ACCESS_EXPIRES_IN: number;
      JWT_REFRESH_EXPIRES_IN: number;

      SWAGGER_OPEN: boolean;

      WORKER_ID: number;
      DATACENTER_ID: number;

      LOG_LEVEL: LoggerConfig['level'];
      LOG_OUTPUT: LoggerConfig['output'];
      LOG_SLOW_REQUEST_THRESHOLD: number;
      LOG_INCLUDE_CONTEXT: boolean;
      LOG_DIR: string;
      LOG_MAX_FILE_SIZE: number;
      LOG_MAX_FILES: number;
    }
  }
}

export {};
