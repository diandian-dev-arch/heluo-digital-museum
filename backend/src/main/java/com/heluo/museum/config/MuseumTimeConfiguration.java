package com.heluo.museum.config;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.boot.autoconfigure.validation.ValidationConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MuseumTimeConfiguration {
    @Bean
    Clock museumClock() {
        return Clock.system(ZoneId.of("Asia/Shanghai"));
    }

    @Bean
    ValidationConfigurationCustomizer museumValidationClock(Clock clock) {
        return configuration -> configuration.clockProvider(() -> clock);
    }
}
