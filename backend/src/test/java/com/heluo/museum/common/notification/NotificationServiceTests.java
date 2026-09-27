package com.heluo.museum.common.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.doThrow;

import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

class NotificationServiceTests {
    @Test
    void passwordResetIsDeliveredOnlyInTheMessageBody() {
        JavaMailSender sender = mock(JavaMailSender.class);
        AtomicReference<NotificationService.NotificationRequested> event = new AtomicReference<>();
        NotificationService service = new NotificationService(sender, "no-reply@heluo.local", "http://localhost:8088",
                value -> event.set((NotificationService.NotificationRequested) value), Runnable::run);

        service.sendPasswordReset("visitor@example.test", "one-time-token");
        verifyNoInteractions(sender);
        service.dispatch(event.get());

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
        NotificationService service = new NotificationService(null, "no-reply@heluo.local", "http://localhost:8088",
                mock(ApplicationEventPublisher.class), Runnable::run);

        service.dispatch(new NotificationService.NotificationRequested("visitor@example.test", "Paid", "Paid", "status"));
    }

    @Test
    void fullQueueAndSmtpFailureDoNotFailCompletedActions() {
        JavaMailSender sender = mock(JavaMailSender.class);
        var event = new NotificationService.NotificationRequested("visitor@example.test", "Paid", "Paid", "status");
        var service = new NotificationService(sender, "no-reply@heluo.local", "http://localhost:8088",
                mock(ApplicationEventPublisher.class), task -> { throw new RejectedExecutionException(); });
        service.dispatch(event);
        verifyNoInteractions(sender);
        doThrow(new MailSendException("private connection details")).when(sender).send(org.mockito.ArgumentMatchers.any(SimpleMailMessage.class));
        var failing = new NotificationService(sender, "no-reply@heluo.local", "http://localhost:8088",
                mock(ApplicationEventPublisher.class), Runnable::run);
        failing.dispatch(event);
    }
}
