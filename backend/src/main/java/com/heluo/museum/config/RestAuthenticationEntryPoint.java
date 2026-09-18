package com.heluo.museum.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.heluo.museum.common.error.ApiError;
import com.heluo.museum.common.web.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

@Component
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {
    private final ObjectMapper objectMapper;

    public RestAuthenticationEntryPoint(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException exception) throws IOException {
        write(objectMapper, response, HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请先登录后再继续", request);
    }

    static void write(ObjectMapper objectMapper, HttpServletResponse response, HttpStatus status,
                      String code, String message, HttpServletRequest request) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(),
                new ApiError(code, message, List.of(), RequestCorrelationFilter.currentId()));
    }
}
