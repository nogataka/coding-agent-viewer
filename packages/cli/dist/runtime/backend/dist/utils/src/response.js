// API Response utilities - equivalent to Rust's utils/src/response.rs
export class ApiResponseBuilder {
    /**
     * Creates a successful response with data and no message
     */
    static success(data) {
        return {
            success: true,
            data,
            message: undefined,
            error_data: undefined
        };
    }
    /**
     * Creates an error response with message and no data
     */
    static error(message) {
        return {
            success: false,
            data: undefined,
            message,
            error_data: undefined
        };
    }
    /**
     * Creates an error response with no data, no message, but with arbitrary error_data
     */
    static errorWithData(data) {
        return {
            success: false,
            data: undefined,
            error_data: data,
            message: undefined
        };
    }
    /**
     * Creates a successful response with both data and message
     */
    static successWithMessage(data, message) {
        return {
            success: true,
            data,
            message,
            error_data: undefined
        };
    }
    /**
     * Creates an error response with both message and error data
     */
    static errorWithMessageAndData(message, data) {
        return {
            success: false,
            data: undefined,
            message,
            error_data: data
        };
    }
}
// Utility functions for response handling
export function isSuccessResponse(response) {
    return response.success === true && response.data !== undefined;
}
export function isErrorResponse(response) {
    return response.success === false;
}
//# sourceMappingURL=response.js.map