package com.heluo.museum.admin;

import com.heluo.museum.common.api.ApiResponse;
import java.math.BigDecimal;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/dashboard")
public class AdminDashboardController {
    private final JdbcTemplate jdbc;
    public AdminDashboardController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    @GetMapping("/summary")
    public ApiResponse<Map<String, Object>> summary() {
        long users = jdbc.queryForObject("select count(*) from users where deleted_at is null", Long.class);
        long appointments = jdbc.queryForObject("select count(*) from appointments", Long.class);
        long orders = jdbc.queryForObject("select count(*) from orders", Long.class);
        BigDecimal sales = jdbc.queryForObject("select coalesce(sum(payable_amount),0) from orders where status in ('PAID','COMPLETED')", BigDecimal.class);
        return ApiResponse.ok(Map.of("userCount", users, "appointmentCount", appointments, "orderCount", orders,
                "salesAmount", sales.toPlainString()), "admin-dashboard-summary");
    }
}
