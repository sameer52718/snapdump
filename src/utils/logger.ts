const prefix = '[backup-service]';

export const log = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(prefix, message, meta !== undefined ? JSON.stringify(meta) : '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(prefix, message, meta !== undefined ? JSON.stringify(meta) : '');
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(prefix, message, meta !== undefined ? JSON.stringify(meta) : '');
  },
};
