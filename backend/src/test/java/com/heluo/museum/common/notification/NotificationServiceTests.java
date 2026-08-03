package com.heluo.museum.common.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

class NotificationServiceTests {
    @Test
    void passwordResetIsDeliveredOnlyInTheMessageBody() {
        JavaMailSender sender = mock(JavaMailSender.class);
        NotificationService service = new NotificationService(sender, "no-reply@heluo.local", "http://localhost:8088");

        service.sendPasswordReset("visitor@example.test", "one-time-token");

        var message = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(message.capture());
        assertThat(message.getValue().getFrom()).isEqualTo("no-reply@heluo.local");
        assertThat(message.getValue().getTo()).containsExactly("visitor@example.test");
        assertThat(message.getValue().getText())
                .contains("http://localhost:8088/reset-password?token=one-time-token")
                .contains("30 分钟");
    }

    @Test
    void missingSmtpDoesNotInterruptCompletedBusinessActions() {
        NotificationService service = new NotificationService(null, "no-reply@heluo.local", "http://localhost:8088");

        service.sendStatusNotification("visitor@example.test", "模拟支付成功", "订单已支付。");
    }
}
