package com.heluo.museum.common.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.heluo.museum.config.NotificationConfiguration;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

@SpringJUnitConfig(NotificationTransactionTests.Config.class)
class NotificationTransactionTests {
    @Autowired private NotificationService service;
    @Autowired private JavaMailSender sender;
    @Autowired private PlatformTransactionManager transactions;

    @BeforeEach
    void clearSender() { reset(sender); }

    @Test
    void committedNotificationRunsOnWorkerWithOriginalRequestId() {
        AtomicReference<String> thread = new AtomicReference<>();
        AtomicReference<String> requestId = new AtomicReference<>();
        doAnswer(invocation -> {
            thread.set(Thread.currentThread().getName());
            requestId.set(MDC.get("requestId"));
            return null;
        }).when(sender).send(any(SimpleMailMessage.class));
        MDC.put("requestId", "transaction-test-id");
        try {
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                service.sendStatusNotification("visitor@example.test", "Confirmed", "Confirmed");
                verifyNoInteractions(sender);
            });
        } finally {
            MDC.remove("requestId");
        }
        verify(sender, timeout(3000)).send(any(SimpleMailMessage.class));
        assertThat(thread.get()).startsWith("museum-mail-");
        assertThat(requestId.get()).isEqualTo("transaction-test-id");
    }

    @Test
    void rolledBackNotificationIsNeverSubmitted() {
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            service.sendPasswordReset("visitor@example.test", "secret-token");
            status.setRollbackOnly();
        });
        verifyNoInteractions(sender);
    }

    @Configuration
    @EnableTransactionManagement
    @Import(NotificationConfiguration.class)
    static class Config {
        @Bean DataSource dataSource() {
            return new DriverManagerDataSource("jdbc:h2:mem:notification-transactions;DB_CLOSE_DELAY=-1", "sa", "");
        }
        @Bean PlatformTransactionManager transactions(DataSource dataSource) {
            return new DataSourceTransactionManager(dataSource);
        }
        @Bean JavaMailSender sender() { return mock(JavaMailSender.class); }
        @Bean NotificationService service(JavaMailSender sender, ApplicationEventPublisher events,
                                         ThreadPoolTaskExecutor notificationExecutor) {
            return new NotificationService(sender, "no-reply@heluo.local", "http://localhost:8088", events, notificationExecutor);
        }
    }
}
