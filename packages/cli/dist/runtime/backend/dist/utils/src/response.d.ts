export interface ApiResponse<T = unknown, E = unknown> {
    success: boolean;
    data?: T;
    error_data?: E;
    message?: string;
}
export declare class ApiResponseBuilder {
    /**
     * Creates a successful response with data and no message
     */
    static success<T>(data: T): ApiResponse<T>;
    /**
     * Creates an error response with message and no data
     */
    static error(message: string): ApiResponse;
    /**
     * Creates an error response with no data, no message, but with arbitrary error_data
     */
    static errorWithData<E>(data: E): ApiResponse<unknown, E>;
    /**
     * Creates a successful response with both data and message
     */
    static successWithMessage<T>(data: T, message: string): ApiResponse<T>;
    /**
     * Creates an error response with both message and error data
     */
    static errorWithMessageAndData<E>(message: string, data: E): ApiResponse<unknown, E>;
}
export type SuccessResponse<T> = ApiResponse<T> & {
    success: true;
    data: T;
};
export type ErrorResponse<E = unknown> = ApiResponse<unknown, E> & {
    success: false;
};
export declare function isSuccessResponse<T>(response: ApiResponse<T>): response is SuccessResponse<T>;
export declare function isErrorResponse<E>(response: ApiResponse<unknown, E>): response is ErrorResponse<E>;
//# sourceMappingURL=response.d.ts.map