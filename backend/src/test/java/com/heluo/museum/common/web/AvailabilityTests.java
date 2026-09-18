package com.heluo.museum.common.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.heluo.museum.auth.JwtAuthenticationFilter;
import com.heluo.museum.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class AvailabilityTests {
    @Test
    void databaseFailureMakesReadinessDownWithoutAffectingLivenessOrExposingDetails() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.execute(any(ConnectionCallback.class)))
                .thenThrow(new DataAccessResourceFailureException("private-host password=private-value"));
        HealthController health = new HealthController(jdbc);
        var response = health.ready();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getBody().data()).containsEntry("status", "DOWN");
        assertThat(new ObjectMapper().writeValueAsString(response.getBody())).doesNotContain("private-host", "private-value");
        assertThat(health.health().data()).containsEntry("status", "UP");
    }

    @Test
    void authenticationDatabaseFailureReturns503WithCorrelatedEnvelopeInsteadOf401() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenThrow(new DataAccessResourceFailureException("private-host password=private-value"));
        String secret = "test-only-secret-must-be-at-least-32-bytes-long";
        var mapper = new ObjectMapper();
        var auth = new JwtAuthenticationFilter(jdbc, secret, mapper);
        var request = new MockHttpServletRequest("GET", "/api/v1/auth/me");
        request.addHeader("Authorization", "Bearer " + new JwtService(secret).issue(123).value());
        var response = new MockHttpServletResponse();
        new RequestCorrelationFilter().doFilter(request, response,
                (req, res) -> auth.doFilter(req, res, (nextRequest, nextResponse) -> {
                    throw new AssertionError("Unavailable authentication must not reach the controller");
                }));
        assertThat(response.getStatus()).isEqualTo(503);
        var body = mapper.readTree(response.getContentAsString());
        assertThat(body.path("code").asText()).isEqualTo("SERVICE_UNAVAILABLE");
        assertThat(body.path("requestId").asText()).isEqualTo(response.getHeader("X-Request-Id"));
        assertThat(response.getContentAsString()).doesNotContain("private-host", "private-value");
    }
}
