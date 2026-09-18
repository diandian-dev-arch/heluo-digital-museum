package com.heluo.museum.common.api;

import com.heluo.museum.common.web.RequestCorrelationFilter;

public record ApiResponse<T>(String code, String message, T data, String requestId) {
    public static <T> ApiResponse<T> ok(T data, String operation) {
        return new ApiResponse<>("OK", "success", data, RequestCorrelationFilter.currentId());
    }
}
