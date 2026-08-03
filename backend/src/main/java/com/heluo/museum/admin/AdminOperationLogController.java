package com.heluo.museum.admin;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.error.ContentPage;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Read-only administrator audit trail. The /admin security rule is enforced centrally. */
@RestController
@RequestMapping("/api/v1/admin/operation-logs")
public class AdminOperationLogController {
    private final JdbcTemplate jdbc;

    public AdminOperationLogController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public ApiResponse<ContentPage<OperationLogView>> list(@RequestParam(defaultValue = "1") int page,
                                                            @RequestParam(defaultValue = "50") int size,
                                                            @RequestParam(required = false) String module) {
        if (page < 1 || size < 1 || size > 100) throw new IllegalArgumentException("page 必须大于 0，size 必须在 1 到 100 之间");
        String where = module == null || module.isBlank() ? "" : " where l.module=?";
        Object[] filter = module == null || module.isBlank() ? new Object[0] : new Object[] {module.trim().toUpperCase()};
        long total = jdbc.queryForObject("select count(*) from operation_logs l" + where, Long.class, filter);
        Object[] args = java.util.Arrays.copyOf(filter, filter.length + 2);
        args[args.length - 2] = size; args[args.length - 1] = (page - 1) * size;
        List<OperationLogView> items = jdbc.query(
                "select l.id,l.actor_user_id,l.module,l.action,l.target_type,l.target_id,l.created_at,u.username,u.nickname "
                        + "from operation_logs l left join users u on u.id=l.actor_user_id" + where
                        + " order by l.created_at desc,l.id desc limit ? offset ?",
                (rs, rowNum) -> new OperationLogView(rs.getLong("id"), rs.getObject("actor_user_id") == null ? null : ((Number) rs.getObject("actor_user_id")).longValue(),
                        rs.getString("username") == null ? "系统" : rs.getString("username"), rs.getString("module"),
                        rs.getString("action"), rs.getString("target_type"), rs.getString("target_id"),
                        rs.getTimestamp("created_at").toInstant().toString()), args);
        return ApiResponse.ok(ContentPage.of(items, page, size, total), "admin-operation-logs");
    }

    public record OperationLogView(long id, Long actorUserId, String actorUsername, String module, String action,
                                   String targetType, String targetId, String createdAt) { }
}
