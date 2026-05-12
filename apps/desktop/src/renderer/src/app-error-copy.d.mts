export type AppErrorSource = 'recording' | 'export' | 'project' | 'recovery' | 'region' | 'shell';
export type AppError = { source: AppErrorSource; message: string };
export type ErrorStateCopy = { label: string; title: string; detail: string };

export function appError(source: AppErrorSource, err: unknown, fallback?: string): AppError;
export function errorStateCopy(error: AppError): ErrorStateCopy;
