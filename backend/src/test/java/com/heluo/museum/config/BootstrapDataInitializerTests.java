package com.heluo.museum.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = {
        "spring.profiles.active=test",
        "spring.datasource.url=jdbc:h2:mem:museum-bootstrap;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
        "museum.bootstrap.enabled=true",
        "museum.bootstrap.admin-username=bootstrap_admin",
        "museum.bootstrap.admin-password=TestBootstrapPassword123",
        "museum.bootstrap.admin-email=bootstrap@example.test"
})
class BootstrapDataInitializerTests {
    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void freshDatabaseUsesCurrentV54WebAssets() {
        var exhibit = jdbc.queryForMap("select model_url,model_source_ref,model_size_bytes,cover_image_url from exhibits_3d where slug=?",
                "heluo-bronze-ding-3d");

        assertThat(exhibit.get("model_url")).isEqualTo("/media/models/heluo-bronze-ding-v5.4.glb");
        assertThat(exhibit.get("model_source_ref")).isEqualTo("MODEL-HELUO-BRONZE-DING-V5-4-CMA-1962-281-CC0");
        assertThat(((Number) exhibit.get("model_size_bytes")).longValue()).isEqualTo(5213372L);
        assertThat(exhibit.get("cover_image_url")).isEqualTo("/media/exhibits/heluo-bronze-ding-v5.4-cover.webp");
    }
}
