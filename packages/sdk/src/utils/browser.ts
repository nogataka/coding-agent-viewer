import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';

const execAsync = promisify(exec);

export async function openBrowser(url: string): Promise<void> {
  try {
    const platform = process.platform;
    let command: string;

    switch (platform) {
      case 'darwin':
        command = `open "${url}"`;
        break;
      case 'win32':
        command = `start "${url}"`;
        break;
      default:
        command = `xdg-open "${url}"`;
        break;
    }

    await execAsync(command);
  } catch (error) {
    logger.error('Failed to open browser:', error);
    throw error;
  }
}
