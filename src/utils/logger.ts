import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SUCCESS = 'success'
}

export class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
      LogLevel.SUCCESS
    ];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.error(chalk.gray(`[DEBUG] ${message}`), data || '');
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.error(chalk.blue(`[INFO] ${message}`), data || '');
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(chalk.yellow(`[WARN] ${message}`), data || '');
    }
  }

  error(message: string, error?: unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(chalk.red(`[ERROR] ${message}`));
      if (error) {
        if (typeof error === 'string') {
          console.error(chalk.red(error));
        } else if (error instanceof Error) {
          console.error(chalk.red(error.message));
          if (error.stack) {
            console.error(chalk.red(error.stack));
          }
        } else {
          console.error(chalk.red(String(error)));
        }
      }
    }
  }

  success(message: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.SUCCESS)) {
      console.error(chalk.green(`✓ ${message}`), data || '');
    }
  }
}

export const logger = new Logger();
