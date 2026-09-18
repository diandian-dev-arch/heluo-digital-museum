package com.heluo.museum.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.AdditionalAnswers.delegatesTo;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import db.migration.V24__Separate_ding_from_jue;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.migration.Context;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class DingAssociationMigrationTests {
    private DriverManagerDataSource dataSource;
    private JdbcTemplate jdbc;

    @BeforeEach
    void prepareLegacyDatabase() {
        String mysqlPassword = System.getenv("HELUO_MIGRATION_MYSQL_PASSWORD");
        String databaseId = UUID.randomUUID().toString().replace("-", "");
        // Opt-in integration run against the dedicated local quality server only.
        // Each case keeps its own database for inspection; never touches museum_quality.
        dataSource = mysqlPassword == null
                ? new DriverManagerDataSource("jdbc:h2:mem:ding-" + databaseId + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "")
                : new DriverManagerDataSource("jdbc:mysql://127.0.0.1:13306/museum_ding_test_" + databaseId
                    + "?createDatabaseIfNotExist=true&useUnicode=true&characterEncoding=utf8&serverTimezone=UTC&useSSL=false&allowPublicKeyRetrieval=true", "root", mysqlPassword);
        Flyway.configure().dataSource(dataSource).target("23").load().migrate();
        jdbc = new JdbcTemplate(dataSource);
        jdbc.update("insert into users(id,username,password_hash,nickname) values(1,'fixture','not-a-login-hash','fixture')");
        jdbc.update("insert into categories(id,code,name) values(1,'BRONZE','青铜礼器')");
        jdbc.update("""
                insert into artifacts(id,category_id,title,slug,content,status,created_by,updated_by)
                values(1,1,'河洛纹青铜爵（概念展品）','heluo-bronze-jue','管理员已补充的爵正文','PUBLISHED',1,1)
                """);
        jdbc.update("""
                insert into exhibits_3d(id,artifact_id,title,slug,description,model_url,model_source_ref,
                    model_size_bytes,source_url,status,created_by,updated_by)
                values(1,1,'河洛青铜鼎 · 互动概念展项','heluo-bronze-ding-3d','保留展项说明',
                    '/media/models/heluo-bronze-ding-v5.5.glb',
                    'MODEL-HELUO-BRONZE-DING-V5-5-CMA-1962-281-CC0-CENTERLINE-FIX',5213372,
                    'https://www.clevelandart.org/art/1962.281','PUBLISHED',1,1)
                """);
    }

    private void upgrade() {
        // This regression isolates V24; later content migrations have their own coverage.
        Flyway.configure().dataSource(dataSource).target("24").load().migrate();
    }

    @Test
    void failedAssociationUpdateRollsBackTheNewArtifactEvenWithAutoCommitConnection() throws Exception {
        try (var realConnection = dataSource.getConnection()) {
            assertThat(realConnection.getAutoCommit()).isTrue();
            var connection = mock(Connection.class, delegatesTo(realConnection));
            doThrow(new SQLException("Injected association failure"))
                    .when(connection).prepareStatement(startsWith("update exhibits_3d set artifact_id="));
            var context = mock(Context.class);
            when(context.getConnection()).thenReturn(connection);
            assertThatThrownBy(() -> new V24__Separate_ding_from_jue().migrate(context))
                    .isInstanceOf(SQLException.class).hasMessage("Injected association failure");
            assertThat(realConnection.getAutoCommit()).isTrue();
        }
        assertThat(jdbc.queryForObject("select count(*) from artifacts", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select artifact_id from exhibits_3d where id=1", Long.class)).isEqualTo(1L);
        upgrade();
        assertThat(jdbc.queryForObject("select count(*) from artifacts", Integer.class)).isEqualTo(2);
    }

    @Test
    void upgradesLegacyAssociationWithoutChangingJueOrExhibitContent() {
        var jueBefore = jdbc.queryForMap("select * from artifacts where id=1");
        upgrade();
        long linked = jdbc.queryForObject("select artifact_id from exhibits_3d where id=1", Long.class);
        assertThat(linked).isNotEqualTo(1);
        assertThat(jdbc.queryForObject("select slug from artifacts where id=?", String.class, linked))
                .isEqualTo("heluo-bronze-ding");
        assertThat(jdbc.queryForObject("select content from artifacts where id=?", String.class, linked))
                .contains("CC0 Public Domain", "不是馆方扫描数据或官方复原", "1962.281");
        assertThat(jdbc.queryForMap("select * from artifacts where id=1")).isEqualTo(jueBefore);
        assertThat(jdbc.queryForObject("select description from exhibits_3d where id=1", String.class)).isEqualTo("保留展项说明");
        upgrade();
        assertThat(jdbc.queryForObject("select count(*) from artifacts", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select artifact_id from exhibits_3d where id=1", Long.class)).isEqualTo(linked);
    }

    @ParameterizedTest
    @ValueSource(strings = {"PUBLISHED", "DRAFT", "WITHDRAWN", "DELETED"})
    void existingDingSlugIsNeverOverwrittenOrAutomaticallyLinked(String status) {
        jdbc.update("""
                insert into artifacts(id,category_id,title,slug,content,status,created_by,updated_by)
                values(2,1,'管理员的鼎','heluo-bronze-ding','保留管理员正文',?,1,1)
                """, status.equals("DELETED") ? "PUBLISHED" : status);
        if (status.equals("DELETED")) jdbc.update("update artifacts set deleted_at=current_timestamp where id=2");
        var before = jdbc.queryForList("select * from artifacts order by id");
        upgrade();
        assertThat(jdbc.queryForList("select * from artifacts order by id")).isEqualTo(before);
        assertThat(jdbc.queryForObject("select artifact_id from exhibits_3d where id=1", Long.class)).isEqualTo(1L);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "update exhibits_3d set title='管理员的新展项' where id=1",
            "update exhibits_3d set model_source_ref='CUSTOM-MODEL' where id=1",
            "update exhibits_3d set source_url='https://example.test/other' where id=1",
            "update exhibits_3d set status='WITHDRAWN' where id=1",
            "update exhibits_3d set deleted_at=current_timestamp where id=1",
            "update artifacts set status='WITHDRAWN' where id=1",
            "update artifacts set deleted_at=current_timestamp where id=1",
            "update artifacts set slug='another-artifact' where id=1"
    })
    void nonSeedOrNonPublicRecordsAreLeftForExplicitEditorialReview(String change) {
        jdbc.update(change);
        var before = jdbc.queryForMap("select * from exhibits_3d where id=1");
        upgrade();
        assertThat(jdbc.queryForObject("select count(*) from artifacts", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForMap("select * from exhibits_3d where id=1")).isEqualTo(before);
    }
}
