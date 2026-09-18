package com.heluo.museum.common.notification;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import org.springframework.lang.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Sends user notifications through the configured SMTP boundary. Delivery failures are logged without secrets and
 * must not roll back an already completed business transaction.
 */
@Service
public class NotificationService {
    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    private final JavaMailSender mailSender;
    private final String from;
    private final String publicBaseUrl;
    private final ApplicationEventPublisher events;
    private final Executor executor;

    public NotificationService(@Nullable JavaMailSender mailSender,
                               @Value("${museum.mail.from}") String from,
                               @Value("${museum.mail.public-base-url}") String publicBaseUrl,
                               ApplicationEventPublisher events,
                               @Qualifier("notificationExecutor") Executor executor) {
        this.mailSender = mailSender;
        this.from = from;
        this.publicBaseUrl = publicBaseUrl;
        this.events = events;
        this.executor = executor;
    }

    public void sendPasswordReset(String email, String rawToken) {
        String resetUrl = UriComponentsBuilder.fromUriString(publicBaseUrl)
                .path("/reset-password")
                .queryParam("token", rawToken)
                .encode(StandardCharsets.UTF_8)
                .toUriString();
        events.publishEvent(new NotificationRequested(email, "重置河洛数字博物馆密码", "请在 30 分钟内打开以下链接设置新密码：\n" + resetUrl
                + "\n\n若非本人操作，请忽略此邮件。", "password-reset"));
    }

    public void sendStatusNotification(String email, String subject, String summary) {
        events.publishEvent(new NotificationRequested(email, subject, summary, "status"));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void dispatch(NotificationRequested notification) {
        try {
            executor.execute(() -> send(notification.email(), notification.subject(), notification.text(), notification.kind()));
        } catch (RejectedExecutionException exception) {
            log.warn("Notification not delivered: kind={}, reason=queue-unavailable", notification.kind());
        }
    }

    private void send(String email, String subject, String text, String kind) {
        if (mailSender == null) {
            log.warn("Notification not delivered: kind={}, reason=smtp-not-configured", kind);
            return;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(email);
            message.setSubject(subject);
            message.setText(text);
            mailSender.send(message);
            log.info("Notification delivered: kind={}", kind);
        } catch (MailException exception) {
            log.warn("Notification not delivered: kind={}, reason={}", kind, exception.getClass().getSimpleName());
        }
    }

    public record NotificationRequested(String email, String subject, String text, String kind) {}
}
