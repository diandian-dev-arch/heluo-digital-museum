package com.heluo.museum.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestCorrelationFilter extends OncePerRequestFilter {
    public static final String REQUEST_ID = "requestId";
    private static final Logger log = LoggerFactory.getLogger(RequestCorrelationFilter.class);

    public static String currentId() {
        String id = MDC.get(REQUEST_ID);
        return id == null ? UUID.randomUUID().toString() : id;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String previous = MDC.get(REQUEST_ID);
        String id = UUID.randomUUID().toString();
        long start = System.nanoTime();
        MDC.put(REQUEST_ID, id);
        request.setAttribute(REQUEST_ID, id);
        response.setHeader("X-Request-Id", id);
        try {
            chain.doFilter(request, response);
        } finally {
            // Query parameters and request bodies can contain credentials or reset tokens.
            log.info("API request: requestId={}, method={}, path={}, status={}, durationMs={}", id,
                    request.getMethod(), request.getRequestURI(), response.getStatus(), (System.nanoTime() - start) / 1_000_000);
            if (previous == null) MDC.remove(REQUEST_ID);
            else MDC.put(REQUEST_ID, previous);
        }
    }
}
