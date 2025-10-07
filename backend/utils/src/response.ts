// API Response utilities - equivalent to Rust's utils/src/response.rs

export interface ApiResponse<T = unknown, E = unknown> {
  success: boolean;
  data?: T;
  error_data?: E;
  message?: string;
}

export class ApiResponseBuilder {
  /**
   * Creates a successful response with data and no message
   */
  static success<T>(data: T): ApiResponse<T> {
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
  static error(message: string): ApiResponse {
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
  static errorWithData<E>(data: E): ApiResponse<unknown, E> {
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
  static successWithMessage<T>(data: T, message: string): ApiResponse<T> {
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
  static errorWithMessageAndData<E>(message: string, data: E): ApiResponse<unknown, E> {
    return {
      success: false,
      data: undefined,
      message,
      error_data: data
    };
  }
}

// Type-safe response helpers for common patterns
export type SuccessResponse<T> = ApiResponse<T> & { success: true; data: T };
export type ErrorResponse<E = unknown> = ApiResponse<unknown, E> & { success: false };

// Utility functions for response handling
export function isSuccessResponse<T>(response: ApiResponse<T>): response is SuccessResponse<T> {
  return response.success === true && response.data !== undefined;
}

export function isErrorResponse<E>(
  response: ApiResponse<unknown, E>
): response is ErrorResponse<E> {
  return response.success === false;
}
