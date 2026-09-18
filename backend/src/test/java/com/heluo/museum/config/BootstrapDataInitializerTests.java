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

    @Autowired
    private BootstrapDataInitializer initializer;

    @Test
    void restartingDoesNotRestoreAnEditorsClearedTranslation() {
        var before = jdbc.queryForMap("select title_en,summary_en from artifacts where slug='water-bird-bronze'");
        try {
            jdbc.update("update artifacts set title_en=null,summary_en=null where slug='water-bird-bronze'");
            initializer.run();
            assertThat(jdbc.queryForObject("select title_en from artifacts where slug='water-bird-bronze'", String.class)).isNull();
        } finally {
            jdbc.update("update artifacts set title_en=?,summary_en=? where slug='water-bird-bronze'", before.get("title_en"), before.get("summary_en"));
        }
    }

    @Test
    void dingAndJueKeepDistinctIdentitiesAndSourceProvenance() {
        var artifact = jdbc.queryForMap("select a.slug,a.content from artifacts a join exhibits_3d e on e.artifact_id=a.id where e.slug='heluo-bronze-ding-3d'");
        assertThat(artifact.get("slug")).isEqualTo("heluo-bronze-ding");
        assertThat((String) artifact.get("content")).contains("CC0 Public Domain", "https://www.clevelandart.org/art/1962.281", "不是馆方扫描数据或官方复原");
        assertThat(jdbc.queryForObject("select title from artifacts where slug='heluo-bronze-jue'", String.class))
                .isEqualTo("河洛纹青铜爵（概念展品）");
    }

    @Test
    void freshDatabaseUsesCurrentV55WebAssets() {
        var exhibit = jdbc.queryForMap("select model_url,model_source_ref,model_size_bytes,mobile_model_url,mobile_model_size_bytes,cover_image_url from exhibits_3d where slug=?",
                "heluo-bronze-ding-3d");

        assertThat(exhibit.get("model_url")).isEqualTo("/media/models/heluo-bronze-ding-v5.5.glb");
        assertThat(exhibit.get("model_source_ref")).isEqualTo("MODEL-HELUO-BRONZE-DING-V5-5-CMA-1962-281-CC0-CENTERLINE-FIX");
        assertThat(((Number) exhibit.get("model_size_bytes")).longValue()).isEqualTo(5213372L);
        assertThat(exhibit.get("mobile_model_url")).isEqualTo("/media/models/heluo-bronze-ding-v5.5-mobile.glb");
        assertThat(((Number) exhibit.get("mobile_model_size_bytes")).longValue()).isEqualTo(837720L);
        assertThat(exhibit.get("cover_image_url")).isEqualTo("/media/exhibits/heluo-bronze-ding-v5.4-cover.webp");
    }

    @Test
    void freshDatabaseUsesExpandedEditorialArticles() {
        var articles = jdbc.queryForList("select slug, content from articles order by slug");

        assertThat(articles).hasSize(3);
        assertThat(articles).allSatisfy(article -> {
            assertThat((String) article.get("content"))
                    .hasSizeGreaterThan(600)
                    .contains("｜")
                    .contains("留给观众的问题");
        });
    }
}
