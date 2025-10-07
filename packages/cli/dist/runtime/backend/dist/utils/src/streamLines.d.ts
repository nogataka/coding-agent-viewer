import { Transform, Readable } from 'stream';
/**
 * Extension methods for converting chunked string streams to line streams
 */
export declare class LinesStreamProcessor {
    /**
     * Convert a chunked string stream to a line stream
     */
    static createLinesTransform(): Transform;
    /**
     * Create a readable stream from lines array
     */
    static fromLines(lines: string[]): Readable;
    /**
     * Convert stream to lines with async iterator
     */
    static streamToLines(stream: NodeJS.ReadableStream): AsyncGenerator<string, void, unknown>;
    /**
     * Process stream lines with a callback
     */
    static processStreamLines(stream: NodeJS.ReadableStream, lineCallback: (line: string) => void | Promise<void>): Promise<void>;
    /**
     * Collect all lines from a stream into an array
     */
    static collectLines(stream: NodeJS.ReadableStream): Promise<string[]>;
    /**
     * Filter stream lines with a predicate
     */
    static filterLines(predicate: (line: string) => boolean): Transform;
    /**
     * Map stream lines with a function
     */
    static mapLines<T>(mapper: (line: string) => T): Transform;
    /**
     * Split stream by delimiter and yield chunks
     */
    static splitByDelimiter(delimiter?: string): Transform;
    /**
     * Create a readable stream from a file that yields lines
     */
    static createFileLineStream(filePath: string): NodeJS.ReadableStream;
}
/**
 * Utility function to convert stream to async iterable
 */
export declare function streamAsyncIterable<T>(stream: NodeJS.ReadableStream): AsyncGenerator<T, void, unknown>;
/**
 * Buffer stream data and yield when buffer reaches threshold
 */
export declare function createBufferedTransform(bufferSize: number, flushOnEnd?: boolean): Transform;
//# sourceMappingURL=streamLines.d.ts.map