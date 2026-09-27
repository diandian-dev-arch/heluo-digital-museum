package com.heluo.museum.auth;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.audit.OperationLogService;
import com.heluo.museum.common.error.ConflictException;
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
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final JdbcTemplate jdbc;
    private final JwtService jwt;
    private final NotificationService notificationService;
    private final OperationLogService operationLogService;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final SecureRandom secureRandom = new SecureRandom();

    AuthController(JdbcTemplate jdbc, JwtService jwt, NotificationService notificationService,
                   OperationLogService operationLogService) {
        this.jdbc = jdbc;
        this.jwt = jwt;
        this.notificationService = notificationService;
        this.operationLogService = operationLogService;
    }

    @PostMapping("/register")
    @Transactional
    public ResponseEntity<ApiResponse<UserView>> register(@Valid @RequestBody Register body) {
        String email = blank(body.email());
        String phone = blank(body.phone());
        if (count("select count(*) from users where username=?", body.username()) > 0) {
            throw new ConflictException("用户名已存在");
        }
        if (email != null && count("select count(*) from users where email=?", email) > 0) {
            throw new ConflictException("邮箱已被使用");
        }
        if (phone != null && count("select count(*) from users where phone=?", phone) > 0) {
            throw new ConflictException("手机号已被使用");
        }
        jdbc.update("insert into users(username,password_hash,nickname,email,phone) values(?,?,?,?,?)", body.username(),
                encoder.encode(body.password()), body.nickname().trim(), email, phone);
        long id = jdbc.queryForObject("select id from users where username=?", Long.class, body.username());
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code='USER'", id);
        operationLogService.record(id, "AUTH", "REGISTER", "USER", String.valueOf(id));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(userView(id), "register"));
    }

    @PostMapping("/login")
    @Transactional
    public ApiResponse<LoginResult> login(@Valid @RequestBody Login body) {
        List<LoginRow> matches = jdbc.query(
                "select id,password_hash,status from users where username=? and deleted_at is null",
                (rs, rowNum) -> new LoginRow(rs.getLong("id"), rs.getString("password_hash"), rs.getString("status")),
                body.username());
        if (matches.isEmpty() || !"ACTIVE".equals(matches.get(0).status())
                || !encoder.matches(body.password(), matches.get(0).passwordHash())) {
            throw new InvalidCredentialsException();
        }
        long id = matches.get(0).id();
        JwtService.Token token = jwt.issue(id);
        jdbc.update("insert into auth_sessions(id,user_id,expires_at) values(?,?,?)", token.id(), id,
                Timestamp.from(token.expiresAt()));
        jdbc.update("update users set last_login_at=current_timestamp(3) where id=?", id);
        operationLogService.record(id, "AUTH", "LOGIN", "USER", String.valueOf(id));
        return ApiResponse.ok(new LoginResult(token.value(), token.expiresAt().toString(), userView(id)), "login");
    }

    @GetMapping("/me")
    public ApiResponse<UserView> me(Authentication authentication) {
        return ApiResponse.ok(userView(actorId(authentication)), "me");
    }

    @PostMapping("/logout")
    public ApiResponse<Map<String, String>> logout(Authentication authentication,
                                                    @RequestHeader("Authorization") String authorization) {
        String rawToken = authorization.substring(7);
        String sessionId = io.jsonwebtoken.Jwts.parser().verifyWith(
                        io.jsonwebtoken.security.Keys.hmacShaKeyFor(jwt.secretBytes())).build()
                .parseSignedClaims(rawToken).getPayload().getId();
        long userId = actorId(authentication);
        jdbc.update("update auth_sessions set revoked_at=current_timestamp(3) where id=? and user_id=?", sessionId, userId);
        operationLogService.record(userId, "AUTH", "LOGOUT", "USER", String.valueOf(userId));
        return ApiResponse.ok(Map.of("status", "logged_out"), "logout");
    }

    @PostMapping("/password-reset/request")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, String>>> requestPasswordReset(@Valid @RequestBody PasswordResetRequest body) {
        List<ResetUser> users = jdbc.query(
                "select id,email from users where username=? and email=? and status='ACTIVE' and deleted_at is null",
                (rs, rowNum) -> new ResetUser(rs.getLong("id"), rs.getString("email")), body.username(), body.email().trim());
        if (!users.isEmpty()) {
            ResetUser user = users.get(0);
            String rawToken = newToken();
            jdbc.update("update password_reset_tokens set used_at=current_timestamp(3) where user_id=? and used_at is null", user.id());
            jdbc.update("insert into password_reset_tokens(id,user_id,token_hash,expires_at) values(?,?,?,?)", UUID.randomUUID().toString(),
                    user.id(), sha256(rawToken), Timestamp.from(Instant.now().plus(30, ChronoUnit.MINUTES)));
            notificationService.sendPasswordReset(user.email(), rawToken);
            operationLogService.record(user.id(), "AUTH", "PASSWORD_RESET_REQUEST", "USER", String.valueOf(user.id()));
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.ok(Map.of("status", "accepted"), "password-reset-request"));
    }

    @PostMapping("/password-reset/confirm")
    @Transactional
    public ApiResponse<Map<String, String>> confirmPasswordReset(@Valid @RequestBody PasswordResetConfirm body) {
        String tokenHash = sha256(body.resetToken());
        List<Long> userIds = jdbc.query(
                "select user_id from password_reset_tokens where token_hash=? and used_at is null and expires_at>current_timestamp(3)",
                (rs, rowNum) -> rs.getLong(1), tokenHash);
        if (userIds.isEmpty()) {
            throw new ResourceNotFoundException("重置链接无效或已过期");
        }
        int consumed = jdbc.update("update password_reset_tokens set used_at=current_timestamp(3) "
                + "where token_hash=? and used_at is null and expires_at>current_timestamp(3)", tokenHash);
        if (consumed != 1) {
            throw new ResourceNotFoundException("重置链接无效或已过期");
        }
        long userId = userIds.get(0);
        jdbc.update("update users set password_hash=? where id=?", encoder.encode(body.newPassword()), userId);
        jdbc.update("update auth_sessions set revoked_at=current_timestamp(3) where user_id=? and revoked_at is null", userId);
        operationLogService.record(userId, "AUTH", "PASSWORD_RESET_CONFIRM", "USER", String.valueOf(userId));
        return ApiResponse.ok(Map.of("status", "password_reset"), "password-reset-confirm");
    }

    UserView userView(long userId) {
        List<UserView> users = jdbc.query(
                "select id,username,nickname,email,phone,status from users where id=? and deleted_at is null",
                (rs, rowNum) -> new UserView(rs.getLong("id"), rs.getString("username"), rs.getString("nickname"),
                        empty(rs.getString("email")), empty(rs.getString("phone")), rs.getString("status"), roles(rs.getLong("id"))), userId);
        if (users.isEmpty()) {
            throw new ResourceNotFoundException("用户不存在");
        }
        return users.get(0);
    }

    private List<String> roles(long userId) {
        return jdbc.queryForList("select r.code from roles r join user_roles ur on ur.role_id=r.id where ur.user_id=?", String.class, userId);
    }

    private long count(String sql, Object... values) {
        return jdbc.queryForObject(sql, Long.class, values);
    }

    private static long actorId(Authentication authentication) {
        return (Long) authentication.getPrincipal();
    }

    private static String blank(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String empty(String value) {
        return value == null ? "" : value;
    }

    private String newToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha256(String input) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(64);
            for (byte value : hash) {
                result.append(String.format("%02x", value));
            }
            return result.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("无法生成安全令牌摘要", exception);
        }
    }

    public record Register(@NotBlank @Pattern(regexp = "[A-Za-z0-9_]{3,32}") String username,
                           @NotBlank @Size(min = 8, max = 72) String password,
                           @NotBlank @Size(max = 50) String nickname, @Email String email, @Size(max = 20) String phone) {
    }

    public record Profile(@NotBlank @Size(max = 50) String nickname, @Email String email, @Size(max = 20) String phone) {
    }

    public record Login(@NotBlank String username, @NotBlank String password) {
    }

    public record PasswordResetRequest(@NotBlank String username, @NotBlank @Email String email) {
    }

    public record PasswordResetConfirm(@NotBlank String resetToken, @NotBlank @Size(min = 8, max = 72) String newPassword) {
    }

    public record UserView(long id, String username, String nickname, String email, String phone, String status,
                           List<String> roles) {
    }

    public record LoginResult(String accessToken, String expiresAt, UserView user) {
    }

    private record LoginRow(long id, String passwordHash, String status) {
    }

    private record ResetUser(long id, String email) {
    }

    public static class InvalidCredentialsException extends RuntimeException {
    }
}
