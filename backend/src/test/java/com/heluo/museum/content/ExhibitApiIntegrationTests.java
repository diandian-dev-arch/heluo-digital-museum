package com.heluo.museum.content;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = {
        "spring.profiles.active=test",
        "spring.datasource.url=jdbc:h2:mem:museum-exhibit-api;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
        "museum.bootstrap.enabled=true",
        "museum.bootstrap.admin-username=exhibit_admin",
        "museum.bootstrap.admin-password=TestExhibitPassword123",
        "museum.bootstrap.admin-email=exhibit@example.test"
})
@AutoConfigureMockMvc
class ExhibitApiIntegrationTests {
    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    JdbcTemplate jdbc;

    private String adminToken;
    private long artifactId;

    @BeforeEach
    void authenticateAdmin() throws Exception {
        String body = mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"exhibit_admin\",\"password\":\"TestExhibitPassword123\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode response = objectMapper.readTree(body);
        adminToken = response.path("data").path("accessToken").asText();
        artifactId = jdbc.queryForObject("select id from artifacts where slug='heluo-bronze-jue'", Long.class);
    }

    @Test
    void publicDetailExposesMobileModelFields() throws Exception {
        mvc.perform(get("/api/v1/exhibits/heluo-bronze-ding-3d"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.artifact.slug", is("heluo-bronze-ding")))
                .andExpect(jsonPath("$.data.mobileModelUrl", is("/media/models/heluo-bronze-ding-v5.5-mobile.glb")))
                .andExpect(jsonPath("$.data.mobileModelSizeBytes", is(837720)));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "update exhibits_3d set status='WITHDRAWN' where slug='heluo-bronze-ding-3d'",
            "update exhibits_3d set deleted_at=current_timestamp where slug='heluo-bronze-ding-3d'",
            "update artifacts set status='WITHDRAWN' where slug='heluo-bronze-ding'",
            "update artifacts set deleted_at=current_timestamp where slug='heluo-bronze-ding'",
            "update categories set enabled=0 where code='BRONZE'"
    })
    @Transactional
    void nonPublicContentCannotRemainVisibleThroughExhibitOrIndex(String change) throws Exception {
        jdbc.update(change);
        mvc.perform(get("/api/v1/exhibits/heluo-bronze-ding-3d")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/exhibits")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[*].slug", not(hasItem("heluo-bronze-ding-3d"))));
        mvc.perform(get("/sitemap.xml")).andExpect(status().isOk())
                .andExpect(content().string(not(containsString("/exhibits/heluo-bronze-ding-3d"))));
    }

    @Test
    void adminRequiresMobileModelUrlAndSizeTogether() throws Exception {
        mvc.perform(post("/api/v1/admin/exhibits")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(input("pair-url-only", "PAIR-URL-ONLY", "\"mobileModelUrl\":\"/media/models/mobile.glb\",")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code", is("VALIDATION_ERROR")));

        mvc.perform(post("/api/v1/admin/exhibits")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(input("pair-size-only", "PAIR-SIZE-ONLY", "\"mobileModelSizeBytes\":1024,")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code", is("VALIDATION_ERROR")));
    }

    @Test
    void adminResponsePreservesNullableAndLongMobileModelSizes() throws Exception {
        mvc.perform(post("/api/v1/admin/exhibits")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(input("mobile-null", "MOBILE-NULL", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mobileModelUrl", is("")))
                .andExpect(jsonPath("$.data.mobileModelSizeBytes", nullValue()));

        mvc.perform(post("/api/v1/admin/exhibits")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(input("mobile-long", "MOBILE-LONG",
                                "\"mobileModelUrl\":\"/media/models/mobile-long.glb\",\"mobileModelSizeBytes\":4294967296,")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mobileModelUrl", is("/media/models/mobile-long.glb")))
                .andExpect(jsonPath("$.data.mobileModelSizeBytes", is(4294967296L)));
    }

    private String input(String slug, String sourceRef, String mobileFields) {
        return "{" +
                "\"artifactId\":" + artifactId + "," +
                "\"title\":\"移动模型集成测试\"," +
                "\"slug\":\"" + slug + "\"," +
                "\"modelUrl\":\"/media/models/desktop.glb\"," +
                "\"modelSourceRef\":\"" + sourceRef + "\"," +
                "\"modelFormat\":\"GLB\"," +
                "\"modelSizeBytes\":2048," +
                mobileFields +
                "\"summary\":\"test\"}";
    }
}
