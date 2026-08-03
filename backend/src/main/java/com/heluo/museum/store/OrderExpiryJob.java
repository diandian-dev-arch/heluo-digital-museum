package com.heluo.museum.store;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Releases stock for pending orders whose 30-minute mock-payment window expired. */
@Component
public class OrderExpiryJob {
    private final JdbcTemplate jdbc;
    public OrderExpiryJob(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Scheduled(initialDelayString = "${museum.orders.expiry-initial-delay-ms:60000}", fixedDelayString = "${museum.orders.expiry-scan-ms:60000}")
    @Transactional
    public void cancelExpiredOrders() {
        List<Long> ids = jdbc.query("select id from orders where status='PENDING_PAYMENT' and expires_at<=current_timestamp(3) for update",
                (rs, rowNum) -> rs.getLong(1));
        for (Long id : ids) {
            jdbc.query("select product_id,quantity from order_items where order_id=?", rs -> {
                while (rs.next()) jdbc.update("update products set locked_stock=greatest(0,locked_stock-?) where id=?", rs.getInt("quantity"), rs.getLong("product_id"));
                return null;
            }, id);
            jdbc.update("update orders set status='CANCELLED',cancelled_at=current_timestamp(3),cancel_reason='支付超时',status_updated_at=current_timestamp(3) where id=? and status='PENDING_PAYMENT'", id);
        }
    }
}
