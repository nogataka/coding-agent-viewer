/**
 * Standard API Response format matching Rust implementation
 */
export interface ApiResponse<T = unknown> {
    success: boolean;
    data: T | null;
    error_data: unknown | null;
    message: string | null;
}
/**
 * Create a success response
 */
export declare function successResponse<T>(data: T, message?: string): ApiResponse<T>;
/**
 * Create an error response
 */
export declare function errorResponse(message: string, errorData?: unknown): ApiResponse<null>;
/**
 * Create a validation error response
 */
export declare function validationErrorResponse(errors: unknown): ApiResponse<null>;
//# sourceMappingURL=apiResponse.d.ts.map