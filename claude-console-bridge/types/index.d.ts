/**
 * Claude Console Bridge - TypeScript Declarations
 */

// ============================================
// Core Types
// ============================================

export interface DebugEvent {
  source: 'browser' | 'server' | 'prisma' | 'external-api';
  level: 'error' | 'warn' | 'info';
  type: string;
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
  timestamp: number;
  context?: EventContext;
  metadata?: Record<string, any>;
}

export interface EventContext {
  route?: string;
  method?: string;
  path?: string;
  clientId?: string;
  userId?: string;
  requestDuration?: number;
  statusCode?: number;
  model?: string;
  action?: string;
  [key: string]: any;
}

export interface ClientConfig {
  bridgePort?: number;
  bridgeHost?: string;
  enabled?: boolean;
  writeToFile?: boolean;
  logToConsole?: boolean;
  maxErrors?: number;
  maxNetwork?: number;
}

// ============================================
// Client Module (claude-console-bridge/client)
// ============================================

declare module 'claude-console-bridge/client' {
  export function configure(options: ClientConfig): void;
  export function captureError(error: Error, context?: Partial<EventContext>): void;
  export function captureWarning(message: string, context?: Partial<EventContext>): void;
  export function capturePrismaError(error: any, params?: { model?: string; action?: string; args?: any }): void;
  export function captureApiError(error: any, context?: { url?: string; method?: string; status?: number; service?: string; responseData?: any }): void;
  export function sendToBridge(type: string, data: Partial<DebugEvent>): void;
  export function createEvent(data: Partial<DebugEvent>): DebugEvent;
  export function getBuffer(): { errors: any[]; network: any[] };
  export function clearBuffer(): void;
}

// ============================================
// NestJS Module (claude-console-bridge/nestjs)
// ============================================

declare module 'claude-console-bridge/nestjs' {
  import { NestInterceptor, ExecutionContext, CallHandler, ExceptionFilter, ArgumentsHost } from '@nestjs/common';
  import { Observable } from 'rxjs';
  import { Request, Response, NextFunction } from 'express';

  export class ClaudeConsoleInterceptor implements NestInterceptor {
    constructor(options?: ClientConfig);
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
  }

  export class ClaudeConsoleExceptionFilter implements ExceptionFilter {
    constructor(options?: ClientConfig);
    catch(exception: any, host: ArgumentsHost): void;
  }

  export function requestLoggerMiddleware(options?: {
    logSuccessful?: boolean;
    logBody?: boolean;
  }): (req: Request, res: Response, next: NextFunction) => void;

  export function setupGlobalHandlers(options?: ClientConfig): void;

  export function CatchErrors(context?: Partial<EventContext>): MethodDecorator;

  export function configure(options: ClientConfig): void;
  export function captureError(error: Error, context?: Partial<EventContext>): void;
  export function captureWarning(message: string, context?: Partial<EventContext>): void;
}

// ============================================
// Prisma Module (claude-console-bridge/prisma)
// ============================================

declare module 'claude-console-bridge/prisma' {
  import { Prisma, PrismaClient } from '@prisma/client';

  export interface PrismaMiddlewareOptions extends ClientConfig {
    logQueries?: boolean;
    logTiming?: boolean;
    sensitiveModels?: string[];
  }

  export function createPrismaMiddleware(options?: PrismaMiddlewareOptions): Prisma.Middleware;

  export function claudeConsoleExtension(options?: ClientConfig): {
    name: string;
    query: any;
  };

  export function wrapPrismaClient<T extends PrismaClient>(
    prismaClient: T,
    options?: PrismaMiddlewareOptions
  ): T;

  export function handleConnectionError(error: Error): never;

  export const PRISMA_ERROR_CODES: Record<string, string>;

  export function configure(options: ClientConfig): void;
  export function capturePrismaError(error: any, params?: { model?: string; action?: string; args?: any }): void;
}

// ============================================
// Express Module (claude-console-bridge/express)
// ============================================

declare module 'claude-console-bridge/express' {
  import { Request, Response, NextFunction, ErrorRequestHandler, RequestHandler } from 'express';

  export interface ErrorHandlerOptions extends ClientConfig {
    logStack?: boolean;
    exposeErrors?: boolean;
    onError?: (err: Error, req: Request, res: Response) => void;
  }

  export interface RequestLoggerOptions extends ClientConfig {
    logAll?: boolean;
    logBody?: boolean;
    ignorePaths?: string[];
  }

  export function errorHandler(options?: ErrorHandlerOptions): ErrorRequestHandler;

  export function requestLogger(options?: RequestLoggerOptions): RequestHandler;

  export function asyncHandler<T>(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
  ): RequestHandler;

  export function notFoundHandler(): RequestHandler;

  export function setupProcessHandlers(options?: ClientConfig): void;

  export function createErrorScope(scopeName: string): {
    capture: (error: Error, req?: Request) => void;
    warning: (message: string, context?: Partial<EventContext>) => void;
  };

  export function configure(options: ClientConfig): void;
  export function captureError(error: Error, context?: Partial<EventContext>): void;
  export function captureWarning(message: string, context?: Partial<EventContext>): void;
}
