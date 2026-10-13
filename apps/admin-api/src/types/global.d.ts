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

    }
  }
}

export {};
