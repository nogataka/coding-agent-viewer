// Stream line processing utilities - equivalent to Rust's utils/src/stream_lines.rs
import { Transform, Readable } from 'stream';
import { createReadStream } from 'fs';

/**
 * Extension methods for converting chunked string streams to line streams
 */
export class LinesStreamProcessor {
  /**
   * Convert a chunked string stream to a line stream
   */
  static createLinesTransform(): Transform {
    let buffer = '';

    return new Transform({
      objectMode: true,

      transform(chunk: string | Buffer, encoding, callback) {
        const data = chunk.toString();
        buffer += data;

        // Split on newlines
        const lines = buffer.split('\n');

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        // Emit complete lines
        for (const line of lines) {
          this.push(line);
        }

        callback();
      },

      flush(callback) {
        // Emit any remaining buffer content
        if (buffer.length > 0) {
          this.push(buffer);
        }
        callback();
      }
    });
  }

  /**
   * Create a readable stream from lines array
   */
  static fromLines(lines: string[]): Readable {
    let index = 0;

    return new Readable({
      objectMode: true,

      read() {
        if (index < lines.length) {
          this.push(lines[index++]);
        } else {
          this.push(null); // End of stream
        }
      }
    });
  }

  /**
   * Convert stream to lines with async iterator
   */
  static async *streamToLines(
    stream: NodeJS.ReadableStream
  ): AsyncGenerator<string, void, unknown> {
    let buffer = '';

    for await (const chunk of stream) {
      const data = chunk.toString();
      buffer += data;

      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line

      for (const line of lines) {
        yield line;
      }
    }

    // Yield any remaining buffer content
    if (buffer.length > 0) {
      yield buffer;
    }
  }

  /**
   * Process stream lines with a callback
   */
  static async processStreamLines(
    stream: NodeJS.ReadableStream,
    lineCallback: (line: string) => void | Promise<void>
  ): Promise<void> {
    for await (const line of LinesStreamProcessor.streamToLines(stream)) {
      await lineCallback(line);
    }
  }

  /**
   * Collect all lines from a stream into an array
   */
  static async collectLines(stream: NodeJS.ReadableStream): Promise<string[]> {
    const lines: string[] = [];

    for await (const line of LinesStreamProcessor.streamToLines(stream)) {
      lines.push(line);
    }

    return lines;
  }

  /**
   * Filter stream lines with a predicate
   */
  static filterLines(predicate: (line: string) => boolean): Transform {
    return new Transform({
      objectMode: true,

      transform(line: string, encoding, callback) {
        if (predicate(line)) {
          this.push(line);
        }
        callback();
      }
    });
  }

  /**
   * Map stream lines with a function
   */
  static mapLines<T>(mapper: (line: string) => T): Transform {
    return new Transform({
      objectMode: true,

      transform(line: string, encoding, callback) {
        try {
          const result = mapper(line);
          this.push(result);
        } catch (error) {
          this.emit('error', error);
        }
        callback();
      }
    });
  }

  /**
   * Split stream by delimiter and yield chunks
   */
  static splitByDelimiter(delimiter: string = '\n'): Transform {
    let buffer = '';

    return new Transform({
      objectMode: true,

      transform(chunk: string | Buffer, encoding, callback) {
        const data = chunk.toString();
        buffer += data;

        const parts = buffer.split(delimiter);
        buffer = parts.pop() || '';

        for (const part of parts) {
          this.push(part);
        }

        callback();
      },

      flush(callback) {
        if (buffer.length > 0) {
          this.push(buffer);
        }
        callback();
      }
    });
  }

  /**
   * Create a readable stream from a file that yields lines
   */
  static createFileLineStream(filePath: string): NodeJS.ReadableStream {
    const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
    const linesTransform = LinesStreamProcessor.createLinesTransform();

    return fileStream.pipe(linesTransform);
  }
}

/**
 * Utility function to convert stream to async iterable
 */
export async function* streamAsyncIterable<T>(
  stream: NodeJS.ReadableStream
): AsyncGenerator<T, void, unknown> {
  for await (const chunk of stream) {
    yield chunk as T;
  }
}

/**
 * Buffer stream data and yield when buffer reaches threshold
 */
export function createBufferedTransform(bufferSize: number, flushOnEnd: boolean = true): Transform {
  let buffer: string[] = [];
  let currentSize = 0;

  return new Transform({
    objectMode: true,

    transform(chunk: string, encoding, callback) {
      buffer.push(chunk);
      currentSize += chunk.length;

      if (currentSize >= bufferSize) {
        this.push(buffer.join(''));
        buffer = [];
        currentSize = 0;
      }

      callback();
    },

    flush(callback) {
      if (flushOnEnd && buffer.length > 0) {
        this.push(buffer.join(''));
      }
      callback();
    }
  });
}
