package com.heluo.museum.auth;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.audit.OperationLogService;
import com.heluo.museum.common.error.ConflictException;
import com.heluo.museum.common.error.ContentPage;
import com.heluo.museum.common.error.ResourceNotFoundException;
import com.heluo.museum.common.notification.NotificationService;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** User administration. SecurityConfiguration restricts this controller to ADMIN. */
@RestController
@RequestMapping("/api/v1/admin/users")
public class AdminUserController {
    private final JdbcTemplate jdbc;
    private final OperationLogService operationLogService;
    private final NotificationService notificationService;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final SecureRandom random = new SecureRandom();

    AdminUserController(JdbcTemplate jdbc, OperationLogService operationLogService, NotificationService notificationService) {
        this.jdbc = jdbc;
        this.operationLogService = operationLogService;
        this.notificationService = notificationService;
    }

    @GetMapping
    public ApiResponse<ContentPage<UserAdminView>> list(@RequestParam(defaultValue = "1") int page,
                                                         @RequestParam(defaultValue = "20") int size,
                                                         @RequestParam(required = false) String keyword) {
        if (page < 1 || size < 1 || size > 100) {
            throw new IllegalArgumentException("page 必须大于 0，size 必须在 1 到 100 之间");
        }
        String where = " where u.deleted_at is null";
        Object[] queryArguments = new Object[0];
        if (keyword != null && !keyword.isBlank()) {
            where += " and (u.username like ? or u.nickname like ?)";
            String query = "%" + keyword.trim() + "%";
            queryArguments = new Object[] {query, query};
        }
        long total = jdbc.queryForObject("select count(*) from users u" + where, Long.class, queryArguments);
        Object[] dataArguments = java.util.Arrays.copyOf(queryArguments, queryArguments.length + 2);
        dataArguments[dataArguments.length - 2] = size;
        dataArguments[dataArguments.length - 1] = (page - 1) * size;
        List<UserAdminView> items = jdbc.query(
                "select u.id,u.username,u.nickname,u.email,u.phone,u.status,u.created_at,"
                        + "group_concat(r.code order by r.code separator ',') role_codes from users u "
                        + "left join user_roles ur on ur.user_id=u.id left join roles r on r.id=ur.role_id" + where
                        + " group by u.id,u.username,u.nickname,u.email,u.phone,u.status,u.created_at"
                        + " order by u.created_at desc,u.id desc limit ? offset ?",
                (rs, rowNum) -> new UserAdminView(rs.getLong("id"), rs.getString("username"), rs.getString("nickname"),
                        empty(rs.getString("email")), empty(rs.getString("phone")), rs.getString("status"),
                        List.of(empty(rs.getString("role_codes")).split(",")), rs.getTimestamp("created_at").toInstant().toString()),
                dataArguments);
        return ApiResponse.ok(ContentPage.of(items, page, size, total), "admin-users");
    }

    @PostMapping
    @Transactional
    public ApiResponse<UserAdminView> create(Authentication authentication, @Valid @RequestBody CreateUser body) {
        String email = blank(body.email());
        String phone = blank(body.phone());
        if (count("select count(*) from users where username=?", body.username()) > 0
                || (email != null && count("select count(*) from users where email=?", email) > 0)
                || (phone != null && count("select count(*) from users where phone=?", phone) > 0)) {
            throw new ConflictException("用户名、邮箱或手机号已被使用");
        }
        jdbc.update("insert into users(username,password_hash,nickname,email,phone) values(?,?,?,?,?)", body.username(),
                passwordEncoder.encode(body.password()), body.nickname(), email, phone);
        long id = jdbc.queryForObject("select id from users where username=?", Long.class, body.username());
        jdbc.update("insert into user_roles(user_id,role_id,assigned_by) select ?,id,? from roles where code='USER'", id,
                actorId(authentication));
        operationLogService.record(actorId(authentication), "USER", "CREATE", "USER", String.valueOf(id));
        return ApiResponse.ok(userById(id), "admin-user-create");
    }

    @PatchMapping("/{id}/status")
    @Transactional
    public ApiResponse<UserAdminView> updateStatus(Authentication authentication, @PathVariable long id,
                                                    @Valid @RequestBody StatusUpdate body) {
        long actorId = actorId(authentication);
        UserAdminView user = userById(id);
        if (user.roles().contains("ADMIN")) {
            throw new ConflictException("第一版不允许通过后台禁用或恢复管理员账号");
        }
        jdbc.update("update users set status=? where id=?", body.status(), id);
        operationLogService.record(actorId, "USER", "STATUS_" + body.status(), "USER", String.valueOf(id));
        return ApiResponse.ok(userById(id), "admin-user-status");
    }

    @PostMapping("/{id}/reset-password")
    @Transactional
    public ApiResponse<java.util.Map<String, String>> resetPassword(Authentication authentication, @PathVariable long id) {
        UserAdminView user = userById(id);
        if (user.email().isBlank()) {
            throw new ConflictException("该账号未绑定邮箱，无法发送重置链接");
        }
        String rawToken = newToken();
        jdbc.update("update password_reset_tokens set used_at=current_timestamp(3) where user_id=? and used_at is null", id);
        jdbc.update("insert into password_reset_tokens(id,user_id,token_hash,expires_at) values(?,?,?,?)", UUID.randomUUID().toString(),
                id, sha256(rawToken), Timestamp.from(Instant.now().plus(30, ChronoUnit.MINUTES)));
        notificationService.sendPasswordReset(user.email(), rawToken);
        operationLogService.record(actorId(authentication), "USER", "PASSWORD_RESET", "USER", String.valueOf(id));
        return ApiResponse.ok(java.util.Map.of("status", "accepted"), "admin-user-reset-password");
    }

    private UserAdminView userById(long id) {
        List<UserAdminView> users = jdbc.query(
                "select u.id,u.username,u.nickname,u.email,u.phone,u.status,u.created_at,"
                        + "group_concat(r.code order by r.code separator ',') role_codes from users u "
                        + "left join user_roles ur on ur.user_id=u.id left join roles r on r.id=ur.role_id"
                        + " where u.id=? and u.deleted_at is null group by u.id,u.username,u.nickname,u.email,u.phone,u.status,u.created_at",
                (rs, rowNum) -> new UserAdminView(rs.getLong("id"), rs.getString("username"), rs.getString("nickname"),
                        empty(rs.getString("email")), empty(rs.getString("phone")), rs.getString("status"),
                        List.of(empty(rs.getString("role_codes")).split(",")), rs.getTimestamp("created_at").toInstant().toString()), id);
        if (users.isEmpty()) {
            throw new ResourceNotFoundException("用户不存在");
        }
        return users.get(0);
    }

    private long count(String sql, Object... values) {
        return jdbc.queryForObject(sql, Long.class, values);
    }

    private static long actorId(Authentication authentication) {
        return (Long) authentication.getPrincipal();
    }

    private String newToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha256(String input) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(64);
            for (byte value : bytes) {
                result.append(String.format("%02x", value));
            }
            return result.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("无法生成安全令牌摘要", exception);
        }
    }

    private static String blank(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String empty(String value) {
        return value == null ? "" : value;
    }

    public record UserAdminView(long id, String username, String nickname, String email, String phone, String status,
                                List<String> roles, String createdAt) {
    }

    public record CreateUser(@NotBlank @Pattern(regexp = "[A-Za-z0-9_]{3,32}") String username,
                             @NotBlank @Size(min = 8, max = 72) String password,
                             @NotBlank @Size(max = 50) String nickname, @Email String email, @Size(max = 20) String phone) {
    }

    public record StatusUpdate(@NotBlank @Pattern(regexp = "ACTIVE|DISABLED") String status) {
    }
}
