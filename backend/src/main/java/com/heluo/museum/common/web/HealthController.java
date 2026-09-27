package com.heluo.museum.common.web;

import com.heluo.museum.common.api.ApiResponse;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class HealthController {
    private static final Logger log = LoggerFactory.getLogger(HealthController.class);
    private final JdbcTemplate jdbc;

    public HealthController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/health")
    public ApiResponse<Map<String, String>> health() {
        return ApiResponse.ok(Map.of("status", "UP"), "health");
    }

    @GetMapping("/ready")
    public ResponseEntity<ApiResponse<Map<String, String>>> ready() {
        try {
            Boolean ready = jdbc.execute((ConnectionCallback<Boolean>) connection -> {
                try (var statement = connection.prepareStatement("select 1")) {
                    statement.setQueryTimeout(2);
                    try (var result = statement.executeQuery()) {
                        return result.next() && result.getInt(1) == 1;
                    }
                }
            });
            if (Boolean.TRUE.equals(ready)) {
                return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
                        .body(ApiResponse.ok(Map.of("status", "UP"), "ready"));
            }
        } catch (DataAccessException exception) {
            log.warn("Readiness failed: reason={}", exception.getClass().getSimpleName());
        }
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .cacheControl(org.springframework.http.CacheControl.noStore())
                .body(new ApiResponse<>("SERVICE_UNAVAILABLE", "服务暂时不可用", Map.of("status", "DOWN"),
                        RequestCorrelationFilter.currentId()));
    }
}
