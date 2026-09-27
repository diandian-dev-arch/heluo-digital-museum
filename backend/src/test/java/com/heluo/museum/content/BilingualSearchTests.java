package com.heluo.museum.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = {
    "spring.profiles.active=test",
    "spring.datasource.url=jdbc:h2:mem:bilingual;MODE=MySQL;DB_CLOSE_DELAY=-1",
    "museum.bootstrap.enabled=true", "museum.bootstrap.admin-username=bilingual_admin",
    "museum.bootstrap.admin-password=BilingualTestPassword123", "museum.bootstrap.admin-email=bilingual@example.test"
})
@AutoConfigureMockMvc
@Transactional
class BilingualSearchTests {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;

    @DynamicPropertySource
    static void mysql(DynamicPropertyRegistry registry) {
        String password = System.getenv("HELUO_MIGRATION_MYSQL_PASSWORD");
        if (password == null) return;
        String name = "museum_bilingual_test_" + UUID.randomUUID().toString().replace("-", "");
        registry.add("spring.datasource.url", () -> "jdbc:mysql://127.0.0.1:13306/" + name
            + "?createDatabaseIfNotExist=true&useUnicode=true&characterEncoding=utf8&serverTimezone=UTC&useSSL=false&allowPublicKeyRetrieval=true");
        registry.add("spring.datasource.username", () -> "root");
        registry.add("spring.datasource.password", () -> password);
        registry.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
    }

    JsonNode search(String word, String type, int page, int size) throws Exception {
        return mapper.readTree(mvc.perform(get("/api/v1/search").param("keyword", word).param("type", type)
            .param("page", String.valueOf(page)).param("size", String.valueOf(size)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
    }

    String token() throws Exception {
        return mapper.readTree(mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(Map.of("username", "bilingual_admin", "password", "BilingualTestPassword123"))))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data").path("accessToken").asText();
    }

    @Test void freshSeedIsFullyTranslatedAndCaseInsensitiveWithStablePaging() throws Exception {
        for (String table : new String[]{"artifacts", "articles"}) {
            assertThat(jdbc.queryForObject("select count(*) from " + table + " where title_en is null or summary_en is null", Integer.class)).isZero();
        }
        var all = search("bronze", "all", 1, 24);
        assertThat(all.path("total").asInt()).isEqualTo(4);
        assertThat(search(" BRONZE ", "all", 1, 24)).isEqualTo(all);
        assertThat(search("青铜", "all", 1, 24).path("total").asInt()).isEqualTo(4);
        assertThat(search("jade", "all", 1, 24).path("total").asInt()).isEqualTo(1);
        assertThat(search("bronze", "artifact", 1, 24).path("total").asInt()).isEqualTo(3);
        assertThat(search("bronze", "article", 1, 24).path("total").asInt()).isEqualTo(1);
        var first = search("bronze", "all", 1, 2);
        var second = search("bronze", "all", 2, 2);
        assertThat(first.path("totalPages").asInt()).isEqualTo(2);
        assertThat(first.path("items").get(0)).isNotEqualTo(second.path("items").get(0));
        assertThat(search("bronze", "all", 3, 2).path("items").size()).isZero();
    }

    @Test void searchesAllFourFieldsLiterallyAndValidatesInput() throws Exception {
        jdbc.update("update artifacts set title='独特标题',summary='独特摘要',title_en='UniqueTitle',summary_en='UniqueSummary 100% under_score bang! quote\u0027\u0027mark' where slug='heluo-bronze-ding'");
        for (String word : new String[]{"独特标题", "独特摘要", "uniquetitle", "uniquesummary", "%", "_", "!", "'mark"}) {
            assertThat(search(word, "all", 1, 24).path("total").asInt()).as(word).isEqualTo(1);
        }
        assertThat(search("missingphrase", "all", 1, 24).path("total").asInt()).isZero();
        assertThat(search("' OR 1=1 --", "all", 1, 24).path("total").asInt()).isZero();
        for (String endpoint : new String[]{"search", "artifacts", "articles"}) {
            for (String word : new String[]{" ", "x".repeat(101)})
                mvc.perform(get("/api/v1/" + endpoint).param("keyword", word)).andExpect(status().isUnprocessableEntity());
            mvc.perform(get("/api/v1/" + endpoint).param("keyword", "UniqueSummary"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.total").value(endpoint.equals("articles") ? 0 : 1));
        }
    }

    @Test void hiddenRecordsStayHiddenInBothLanguages() throws Exception {
        for (String table : new String[]{"artifacts", "articles"}) {
            jdbc.update("update " + table + " set title='测试隐私',title_en='HiddenUnique',summary='测试隐私',summary_en='HiddenUnique'");
        }
        for (String change : new String[]{"status='DRAFT'", "status='WITHDRAWN'", "status='PUBLISHED',deleted_at=current_timestamp"}) {
            jdbc.update("update artifacts set " + change);
            jdbc.update("update articles set " + change);
            assertThat(search("HiddenUnique", "all", 1, 24).path("total").asInt()).isZero();
            assertThat(search("测试隐私", "all", 1, 24).path("total").asInt()).isZero();
        }
        jdbc.update("update artifacts set status='PUBLISHED',deleted_at=null");
        jdbc.update("update articles set status='PUBLISHED',deleted_at=null");
        jdbc.update("update categories set enabled=0");
        assertThat(search("HiddenUnique", "all", 1, 24).path("total").asInt()).isZero();
    }

    @Test void adminCanCreateEditOmitAndClearTranslationsWithValidation() throws Exception {
        String auth = "Bearer " + token();
        long categoryId = jdbc.queryForObject("select id from categories where code='BRONZE'", Long.class);
        for (String resource : new String[]{"artifacts", "articles"}) {
            String slug = "bilingual-" + resource;
            String body = mapper.writeValueAsString(Map.of("categoryId", categoryId, "title", "中文标题", "slug", slug,
                "summary", "中文摘要", "content", "中文正文", "titleEn", "  Created English  ", "summaryEn", " Summary English "));
            var data = mapper.readTree(mvc.perform(post("/api/v1/admin/" + resource).header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.titleEn").value("Created English")).andReturn().getResponse().getContentAsString()).path("data");
            String path = "/api/v1/admin/" + resource + "/" + data.path("id").asLong();
            mvc.perform(patch(path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content("{\"summary\":\"更新中文\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.titleEn").value("Created English"));
            mvc.perform(patch(path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content("{\"titleEn\":\" Updated English \",\"summaryEn\":\"FreshSummary\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.titleEn").value("Updated English"));
            mvc.perform(post(path + "/publish").header("Authorization", auth)).andExpect(status().isOk());
            mvc.perform(get("/api/v1/" + resource + "/" + slug)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.titleEn").value("Updated English"));
            for (String invalid : new String[]{"{\"titleEn\":2}", mapper.writeValueAsString(Map.of("titleEn", "x".repeat(301))), mapper.writeValueAsString(Map.of("summaryEn", "x".repeat(1001)))})
                mvc.perform(patch(path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(invalid)).andExpect(status().isUnprocessableEntity());
            mvc.perform(patch(path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content("{\"titleEn\":\" \",\"summaryEn\":null}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.titleEn").isEmpty()).andExpect(jsonPath("$.data.summaryEn").isEmpty());
            assertThat(jdbc.queryForObject("select title_en from " + resource + " where slug=?", String.class, slug)).isNull();
            mvc.perform(patch(path).contentType(MediaType.APPLICATION_JSON).content("{\"titleEn\":\"forbidden\"}"))
                .andExpect(status().isUnauthorized());
        }
    }

    @Test void ordinaryAccountCannotCreateOrModifyTranslations() throws Exception {
        String username = "reader_" + UUID.randomUUID().toString().substring(0, 8);
        String credentials = mapper.writeValueAsString(Map.of("username", username, "password", "ReaderPassword123", "nickname", "Reader"));
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(credentials))
            .andExpect(status().isCreated());
        String auth = "Bearer " + mapper.readTree(mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(credentials))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data").path("accessToken").asText();
        for (String resource : new String[]{"artifacts", "articles"}) {
            long id = jdbc.queryForObject("select min(id) from " + resource, Long.class);
            mvc.perform(patch("/api/v1/admin/" + resource + "/" + id).header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"titleEn\":\"Unauthorized\"}"))
                .andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/admin/" + resource).header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"titleEn\":\"Unauthorized\"}"))
                .andExpect(status().isForbidden());
        }
    }
}
