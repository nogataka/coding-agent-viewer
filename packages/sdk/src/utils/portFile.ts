import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export async function writePortFile(port: number): Promise<void> {
  const portFilePath = path.join(os.tmpdir(), 'coding-agent-viewer-port');
  await fs.writeFile(portFilePath, port.toString(), 'utf-8');
}

export async function readPortFile(): Promise<number | null> {
  try {
    const portFilePath = path.join(os.tmpdir(), 'coding-agent-viewer-port');
    const content = await fs.readFile(portFilePath, 'utf-8');
    return parseInt(content.trim(), 10);
  } catch {
    return null;
  }
}
