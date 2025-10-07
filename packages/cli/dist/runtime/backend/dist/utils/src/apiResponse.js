/**
 * Create a success response
 */
export function successResponse(data, message) {
    return {
        success: true,
        data,
        error_data: null,
        message: message || null
    };
}
/**
 * Create an error response
 */
export function errorResponse(message, errorData) {
    return {
        success: false,
        data: null,
        error_data: errorData || null,
        message
    };
}
/**
 * Create a validation error response
 */
export function validationErrorResponse(errors) {
    return {
        success: false,
        data: null,
        error_data: errors,
        message: 'Validation failed'
    };
}
//# sourceMappingURL=apiResponse.js.map