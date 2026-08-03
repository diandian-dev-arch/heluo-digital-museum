package com.heluo.museum.common.audit;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class OperationLogService {
    private final JdbcTemplate jdbc;

    public OperationLogService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void record(Long actorUserId, String module, String action, String targetType, String targetId) {
        jdbc.update("insert into operation_logs(actor_user_id,module,action,target_type,target_id) values(?,?,?,?,?)",
                actorUserId, module, action, targetType, targetId);
    }
}
