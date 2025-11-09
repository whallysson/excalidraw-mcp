import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log level from environment or default to 'info'
const logLevel = process.env.LOG_LEVEL || 'info';

// Log format configuration
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');

// Winston logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: 'excalidraw-mcp-backend' },
  transports: [
    // File transport for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Helper function to log MCP tool execution
export function logMCPTool(
  toolName: string,
  params: Record<string, any>,
  result?: any,
  error?: any,
  duration?: number
): void {
  const logData = {
    tool: toolName,
    params,
    duration,
    timestamp: new Date().toISOString()
  };

  if (error) {
    logger.error('MCP tool failed', { ...logData, error });
  } else {
    logger.info('MCP tool executed', { ...logData, result });
  }
}

// Helper function to log WebSocket events
export function logWebSocket(
  event: string,
  connectionId: string,
  data?: Record<string, any>
): void {
  logger.info('WebSocket event', {
    event,
    connectionId,
    data,
    timestamp: new Date().toISOString()
  });
}

export default logger;
